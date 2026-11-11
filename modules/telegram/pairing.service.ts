import crypto from 'crypto';
import { prisma } from '@/database/prisma';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction, UserRole } from '@prisma/client';
import { logger } from '@/lib/logger';

export class DriverPairingService {
  /**
   * Generates a secure, cryptographically random one-time pairing code with a 30-minute TTL
   * persisted in PostgreSQL via Prisma.
   */
  public static async generatePairingCode(
    driverProfileId: string,
    performedByUserId: string
  ): Promise<{ code: string; expiresAt: Date; deepLink: string }> {
    // 1. Verify driver exists and is active
    const driver = await prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      include: { user: true },
    });

    if (!driver) {
      throw new Error('Водитель не найден в системе');
    }

    if (!driver.user?.isActive) {
      throw new Error('Учётная запись водителя деактивирована');
    }

    // 2. Invalidate any existing unused active pairing codes for this driver
    await prisma.telegramPairingCode.updateMany({
      where: {
        userId: driver.userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        expiresAt: new Date(),
      },
    });

    // 3. Generate random 6-character alphanumeric code with ABL- prefix
    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
    const code = `ABL-${randomSuffix}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes TTL

    // 4. Persist code in PostgreSQL
    await prisma.telegramPairingCode.create({
      data: {
        code,
        userId: driver.userId,
        expiresAt,
      },
    });

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'AliBrosDriverBot';
    const deepLink = `https://t.me/${botUsername}?start=${code}`;

    logger.info(
      { driverProfileId, code, expiresAt, performedByUserId },
      'Generated driver Telegram pairing code in database'
    );

    return { code, expiresAt, deepLink };
  }

  /**
   * Validates pairing code and links the Telegram account to the driver.
   * Atomically consumes the code via Prisma transaction to prevent race conditions.
   * Enforces:
   * 1. Code exists in DB and is not expired.
   * 2. Single-use: atomically set usedAt; concurrent requests will fail.
   * 3. One Telegram ID cannot be linked to multiple drivers/users.
   */
  public static async verifyAndLinkDriver(
    telegramIdInput: bigint | number | string,
    codeInput: string,
    telegramUser: {
      username?: string;
      firstName?: string;
      lastName?: string;
      languageCode?: string;
    }
  ): Promise<{
    success: boolean;
    error?: string;
    driverProfileId?: string;
    driverFullName?: string;
  }> {
    const normalizedCode = codeInput.trim().toUpperCase();
    const telegramIdBigInt = BigInt(telegramIdInput.toString());

    return await prisma.$transaction(async (tx) => {
      const now = new Date();

      // 1. Fetch pairing code with driver user and profile
      const pairingRecord = await tx.telegramPairingCode.findUnique({
        where: { code: normalizedCode },
        include: {
          user: {
            include: { driverProfile: true },
          },
        },
      });

      if (!pairingRecord) {
        return {
          success: false,
          error: 'Неверный или устаревший код привязки. Запросите новый код у менеджера.',
        };
      }

      if (pairingRecord.usedAt !== null) {
        return {
          success: false,
          error: 'Неверный или устаревший код привязки (код уже был использован). Запросите новый код у менеджера.',
        };
      }

      if (pairingRecord.expiresAt <= now) {
        return {
          success: false,
          error: 'Срок действия кода привязки истёк (срок жизни 30 минут).',
        };
      }

      if (pairingRecord.user.role !== UserRole.DRIVER) {
        return {
          success: false,
          error: 'Этот код предназначен для другой роли и не может использоваться в боте водителя.',
        };
      }

      // 2. Prevent account hijacking: Check if this Telegram ID is already linked to another user
      const existingAccount = await tx.telegramAccount.findUnique({
        where: { telegramId: telegramIdBigInt },
      });

      if (existingAccount && existingAccount.userId !== pairingRecord.userId) {
        return {
          success: false,
          error:
            'Этот Telegram-аккаунт уже привязан к другому пользователю. Обратитесь к администратору для сброса привязки.',
        };
      }

      // 3. Atomic consumption: update usedAt where usedAt is still null
      const updateResult = await tx.telegramPairingCode.updateMany({
        where: {
          id: pairingRecord.id,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });

      if (updateResult.count === 0) {
        return {
          success: false,
          error: 'Неверный или устаревший код привязки (код уже был использован). Запросите новый код у менеджера.',
        };
      }

      // 4. Link or update Telegram account for driver
      await tx.telegramAccount.upsert({
        where: { userId: pairingRecord.userId },
        create: {
          userId: pairingRecord.userId,
          telegramId: telegramIdBigInt,
          username: telegramUser.username,
          firstName: telegramUser.firstName,
          lastName: telegramUser.lastName,
          languageCode: telegramUser.languageCode,
          authDate: now,
        },
        update: {
          telegramId: telegramIdBigInt,
          username: telegramUser.username,
          firstName: telegramUser.firstName,
          lastName: telegramUser.lastName,
          languageCode: telegramUser.languageCode,
        },
      });

      const driverProfileId = pairingRecord.user.driverProfile?.id;
      const driverFullName = pairingRecord.user.driverProfile?.fullName || 'Водитель';

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pairingRecord.userId);

      await AuditService.log({
        userId: isUuid ? pairingRecord.userId : undefined,
        action: AuditAction.UPDATE,
        resource: 'DriverTelegramAccount',
        resourceId: driverProfileId,
        metadata: {
          telegramId: telegramIdBigInt.toString(),
          username: telegramUser.username,
        },
      });

      logger.info(
        { driverProfileId, telegramId: telegramIdBigInt.toString() },
        'Successfully verified and linked driver Telegram account'
      );

      return {
        success: true,
        driverProfileId,
        driverFullName,
      };
    }, { timeout: 15000, maxWait: 10000 });
  }

  /**
   * Retrieves driver profile for an authenticated Telegram ID.
   */
  public static async getDriverByTelegramId(telegramIdInput: bigint | number | string) {
    try {
      const telegramId = BigInt(telegramIdInput.toString());
      const account = await prisma.telegramAccount.findUnique({
        where: { telegramId },
        include: {
          user: {
            include: {
              driverProfile: true,
            },
          },
        },
      });

      if (!account || !account.user || account.user.role !== UserRole.DRIVER) {
        return null;
      }

      if (!account.user.isActive) {
        return null;
      }

      return account.user.driverProfile;
    } catch {
      return null;
    }
  }

  /**
   * Helper for testing/clearing pairing codes.
   */
  public static async _clearAllCodesForTesting() {
    try {
      await prisma.telegramPairingCode.deleteMany();
    } catch {
      // In-memory or mocked tests can ignore
    }
  }
}

export class ClientPairingService {
  /**
   * Generates a secure, cryptographically random one-time pairing code with a 30-minute TTL
   * persisted in PostgreSQL for a Client.
   */
  public static async generatePairingCode(
    clientProfileId: string,
    performedByUserId: string
  ): Promise<{ code: string; expiresAt: Date; deepLink: string }> {
    const client = await prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      include: { user: true },
    });

    if (!client) {
      throw new Error('Клиент не найден в системе');
    }

    if (!client.user?.isActive) {
      throw new Error('Учётная запись клиента деактивирована');
    }

    await prisma.telegramPairingCode.updateMany({
      where: {
        userId: client.userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        expiresAt: new Date(),
      },
    });

    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
    const code = `ABL-${randomSuffix}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.telegramPairingCode.create({
      data: {
        code,
        userId: client.userId,
        expiresAt,
      },
    });

    const botUsername = process.env.TELEGRAM_CLIENT_BOT_USERNAME || 'AliBrosClientBot';
    const deepLink = `https://t.me/${botUsername}?start=${code}`;

    logger.info(
      { clientProfileId, code, expiresAt, performedByUserId },
      'Generated client Telegram pairing code in database'
    );

    return { code, expiresAt, deepLink };
  }

  /**
   * Validates pairing code and links the Telegram account to the client.
   */
  public static async verifyAndLinkClient(
    telegramIdInput: bigint | number | string,
    codeInput: string,
    telegramUser: {
      username?: string;
      firstName?: string;
      lastName?: string;
      languageCode?: string;
    }
  ): Promise<{
    success: boolean;
    error?: string;
    clientProfileId?: string;
    companyName?: string;
  }> {
    const normalizedCode = codeInput.trim().toUpperCase();
    const telegramIdBigInt = BigInt(telegramIdInput.toString());

    return await prisma.$transaction(async (tx) => {
      const now = new Date();

      const pairingRecord = await tx.telegramPairingCode.findUnique({
        where: { code: normalizedCode },
        include: {
          user: {
            include: { clientProfile: true },
          },
        },
      });

      if (!pairingRecord) {
        return {
          success: false,
          error: 'Неверный или устаревший код привязки. Запросите новый код в личном кабинете.',
        };
      }

      if (pairingRecord.usedAt !== null) {
        return {
          success: false,
          error: 'Неверный или устаревший код привязки (код уже был использован).',
        };
      }

      if (pairingRecord.expiresAt <= now) {
        return {
          success: false,
          error: 'Срок действия кода привязки истёк (срок жизни 30 минут).',
        };
      }

      if (pairingRecord.user.role !== UserRole.CLIENT) {
        return {
          success: false,
          error: 'Этот код предназначен для другой роли и не может использоваться в клиентском боте.',
        };
      }

      if (!pairingRecord.user.isActive) {
        return {
          success: false,
          error: 'Учётная запись клиента деактивирована.',
        };
      }

      const existingAccount = await tx.telegramAccount.findUnique({
        where: { telegramId: telegramIdBigInt },
      });

      if (existingAccount && existingAccount.userId !== pairingRecord.userId) {
        return {
          success: false,
          error:
            'Этот Telegram-аккаунт уже привязан к другому пользователю. Обратитесь к администратору для сброса привязки.',
        };
      }

      const updateResult = await tx.telegramPairingCode.updateMany({
        where: {
          id: pairingRecord.id,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });

      if (updateResult.count === 0) {
        return {
          success: false,
          error: 'Неверный или устаревший код привязки (код уже был использован).',
        };
      }

      await tx.telegramAccount.upsert({
        where: { userId: pairingRecord.userId },
        create: {
          userId: pairingRecord.userId,
          telegramId: telegramIdBigInt,
          username: telegramUser.username,
          firstName: telegramUser.firstName,
          lastName: telegramUser.lastName,
          languageCode: telegramUser.languageCode,
          authDate: now,
        },
        update: {
          telegramId: telegramIdBigInt,
          username: telegramUser.username,
          firstName: telegramUser.firstName,
          lastName: telegramUser.lastName,
          languageCode: telegramUser.languageCode,
        },
      });

      const clientProfileId = pairingRecord.user.clientProfile?.id;
      const companyName = pairingRecord.user.clientProfile?.companyName || 'Клиент';

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pairingRecord.userId);

      await AuditService.log({
        userId: isUuid ? pairingRecord.userId : undefined,
        action: AuditAction.UPDATE,
        resource: 'ClientTelegramAccount',
        resourceId: clientProfileId,
        metadata: {
          telegramId: telegramIdBigInt.toString(),
          username: telegramUser.username,
        },
      });

      logger.info(
        { clientProfileId, telegramId: telegramIdBigInt.toString() },
        'Successfully verified and linked client Telegram account'
      );

      return {
        success: true,
        clientProfileId,
        companyName,
      };
    }, { timeout: 15000, maxWait: 10000 });
  }

  /**
   * Retrieves client profile for an authenticated Telegram ID.
   */
  public static async getClientByTelegramId(telegramIdInput: bigint | number | string) {
    try {
      const telegramId = BigInt(telegramIdInput.toString());
      const account = await prisma.telegramAccount.findUnique({
        where: { telegramId },
        include: {
          user: {
            include: {
              clientProfile: true,
            },
          },
        },
      });

      if (!account || !account.user || account.user.role !== UserRole.CLIENT) {
        return null;
      }

      if (!account.user.isActive) {
        return null;
      }

      return account.user.clientProfile;
    } catch {
      return null;
    }
  }

  /**
   * Unlinks Telegram account from a client.
   */
  public static async unlinkClient(clientProfileId: string, performedByUserId: string) {
    const client = await prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      include: { user: true },
    });

    if (!client) {
      throw new Error('Клиент не найден в системе');
    }

    await prisma.telegramAccount.deleteMany({
      where: { userId: client.userId },
    });

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(performedByUserId);

    await AuditService.log({
      userId: isUuid ? performedByUserId : undefined,
      action: AuditAction.UPDATE,
      resource: 'ClientProfile',
      resourceId: clientProfileId,
      metadata: { event: 'TELEGRAM_ACCOUNT_UNLINKED', performedByUserId },
    });

    logger.info({ clientProfileId, performedByUserId }, 'Unlinked client Telegram account');
    return { success: true };
  }
}

export class ManagerPairingService {
  /**
   * Generates a secure, cryptographically random one-time pairing code with a 30-minute TTL
   * persisted in PostgreSQL for a Manager or Administrator.
   */
  public static async generatePairingCode(
    managerProfileId: string,
    performedByUserId: string
  ): Promise<{ code: string; expiresAt: Date; deepLink: string }> {
    const manager = await prisma.managerProfile.findUnique({
      where: { id: managerProfileId },
      include: { user: true },
    });

    if (!manager) {
      throw new Error('Менеджер не найден в системе');
    }

    if (!manager.user?.isActive) {
      throw new Error('Учётная запись менеджера деактивирована');
    }

    await prisma.telegramPairingCode.updateMany({
      where: {
        userId: manager.userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        expiresAt: new Date(),
      },
    });

    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
    const code = `ABL-${randomSuffix}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.telegramPairingCode.create({
      data: {
        code,
        userId: manager.userId,
        expiresAt,
      },
    });

    const botUsername = process.env.TELEGRAM_MANAGER_BOT_USERNAME || 'AliBrosManagerBot';
    const deepLink = `https://t.me/${botUsername}?start=${code}`;

    logger.info(
      { managerProfileId, code, expiresAt, performedByUserId },
      'Generated manager Telegram pairing code in database'
    );

    return { code, expiresAt, deepLink };
  }

  /**
   * Validates pairing code and links the Telegram account to the manager.
   */
  public static async verifyAndLinkManager(
    telegramIdInput: bigint | number | string,
    codeInput: string,
    telegramUser: {
      username?: string;
      firstName?: string;
      lastName?: string;
      languageCode?: string;
    }
  ): Promise<{
    success: boolean;
    error?: string;
    managerProfileId?: string;
    fullName?: string;
  }> {
    const normalizedCode = codeInput.trim().toUpperCase();
    const telegramIdBigInt = BigInt(telegramIdInput.toString());

    return await prisma.$transaction(async (tx) => {
      const now = new Date();

      const pairingRecord = await tx.telegramPairingCode.findUnique({
        where: { code: normalizedCode },
        include: {
          user: {
            include: { managerProfile: true },
          },
        },
      });

      if (!pairingRecord) {
        return {
          success: false,
          error: 'Неверный или устаревший код привязки.',
        };
      }

      if (pairingRecord.usedAt !== null) {
        return {
          success: false,
          error: 'Неверный или устаревший код привязки (код уже был использован).',
        };
      }

      if (pairingRecord.expiresAt <= now) {
        return {
          success: false,
          error: 'Срок действия кода привязки истёк (срок жизни 30 минут).',
        };
      }

      const allowedRoles: UserRole[] = [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
      if (!allowedRoles.includes(pairingRecord.user.role)) {
        return {
          success: false,
          error: 'Этот код предназначен для роли сотрудника/менеджера AliBros.',
        };
      }

      if (!pairingRecord.user.isActive) {
        return {
          success: false,
          error: 'Учётная запись сотрудника деактивирована.',
        };
      }

      const existingAccount = await tx.telegramAccount.findUnique({
        where: { telegramId: telegramIdBigInt },
      });

      if (existingAccount && existingAccount.userId !== pairingRecord.userId) {
        return {
          success: false,
          error:
            'Этот Telegram-аккаунт уже привязан к другому пользователю. Обратитесь к администратору для сброса привязки.',
        };
      }

      const updateResult = await tx.telegramPairingCode.updateMany({
        where: {
          id: pairingRecord.id,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });

      if (updateResult.count === 0) {
        return {
          success: false,
          error: 'Неверный или устаревший код привязки (код уже был использован).',
        };
      }

      await tx.telegramAccount.upsert({
        where: { userId: pairingRecord.userId },
        create: {
          userId: pairingRecord.userId,
          telegramId: telegramIdBigInt,
          username: telegramUser.username,
          firstName: telegramUser.firstName,
          lastName: telegramUser.lastName,
          languageCode: telegramUser.languageCode,
          authDate: now,
        },
        update: {
          telegramId: telegramIdBigInt,
          username: telegramUser.username,
          firstName: telegramUser.firstName,
          lastName: telegramUser.lastName,
          languageCode: telegramUser.languageCode,
        },
      });

      const managerProfileId = pairingRecord.user.managerProfile?.id;
      const fullName = pairingRecord.user.managerProfile?.fullName || 'Менеджер';

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pairingRecord.userId);

      await AuditService.log({
        userId: isUuid ? pairingRecord.userId : undefined,
        action: AuditAction.UPDATE,
        resource: 'ManagerTelegramAccount',
        resourceId: managerProfileId,
        metadata: {
          telegramId: telegramIdBigInt.toString(),
          username: telegramUser.username,
        },
      });

      logger.info(
        { managerProfileId, telegramId: telegramIdBigInt.toString() },
        'Successfully verified and linked manager Telegram account'
      );

      return {
        success: true,
        managerProfileId,
        fullName,
      };
    }, { timeout: 15000, maxWait: 10000 });
  }

  /**
   * Retrieves manager profile for an authenticated Telegram ID.
   */
  public static async getManagerByTelegramId(telegramIdInput: bigint | number | string) {
    try {
      const telegramId = BigInt(telegramIdInput.toString());
      const account = await prisma.telegramAccount.findUnique({
        where: { telegramId },
        include: {
          user: {
            include: {
              managerProfile: true,
            },
          },
        },
      });

      const allowedRoles: UserRole[] = [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
      if (!account || !account.user || !allowedRoles.includes(account.user.role)) {
        return null;
      }

      if (!account.user.isActive) {
        return null;
      }

      return account.user;
    } catch {
      return null;
    }
  }

  /**
   * Unlinks Telegram account from a manager or administrator.
   */
  public static async unlinkManager(managerProfileId: string, performedByUserId: string) {
    const manager = await prisma.managerProfile.findUnique({
      where: { id: managerProfileId },
      include: { user: true },
    });

    if (!manager) {
      throw new Error('Менеджер не найден в системе');
    }

    await prisma.telegramAccount.deleteMany({
      where: { userId: manager.userId },
    });

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(performedByUserId);

    await AuditService.log({
      userId: isUuid ? performedByUserId : undefined,
      action: AuditAction.UPDATE,
      resource: 'ManagerProfile',
      resourceId: managerProfileId,
      metadata: { event: 'TELEGRAM_ACCOUNT_UNLINKED', performedByUserId },
    });

    logger.info({ managerProfileId, performedByUserId }, 'Unlinked manager Telegram account');
    return { success: true };
  }
}


