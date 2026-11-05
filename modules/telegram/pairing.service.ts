import crypto from 'crypto';
import { prisma } from '@/database/prisma';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction, UserRole } from '@prisma/client';
import { logger } from '@/lib/logger';
import { TelegramService } from './telegram.service';

export interface PairingCodeRecord {
  code: string;
  driverProfileId: string;
  driverUserId: string;
  expiresAt: Date;
  generatedByUserId: string;
}

// In-memory store for active pairing codes with TTL
// Key: normalized code (e.g., "ABL-A8B3C9")
const activePairingCodes = new Map<string, PairingCodeRecord>();

// Helper to clean up expired codes periodically
function cleanupExpiredCodes() {
  const now = new Date();
  for (const [code, record] of activePairingCodes.entries()) {
    if (record.expiresAt < now) {
      activePairingCodes.delete(code);
    }
  }
}

export class DriverPairingService {
  /**
   * Generates a secure, cryptographically random one-time link code with a 30-minute TTL.
   */
  public static async generatePairingCode(
    driverProfileId: string,
    performedByUserId: string
  ): Promise<{ code: string; expiresAt: Date; deepLink: string }> {
    cleanupExpiredCodes();

    // Verify driver exists
    let driver;
    if (process.env.DATABASE_URL) {
      driver = await prisma.driverProfile.findUnique({
        where: { id: driverProfileId },
        include: { user: true },
      });
    } else {
      // In-memory/test fallback
      driver = {
        id: driverProfileId,
        userId: `user-${driverProfileId}`,
        fullName: 'Водитель',
        user: { isActive: true, role: UserRole.DRIVER },
      };
    }

    if (!driver) {
      throw new Error('Водитель не найден в системе');
    }

    if (!driver.user?.isActive) {
      throw new Error('Учётная запись водителя деактивирована');
    }

    // Invalidate any existing pairing codes for this driver
    for (const [existingCode, record] of activePairingCodes.entries()) {
      if (record.driverProfileId === driverProfileId) {
        activePairingCodes.delete(existingCode);
      }
    }

    // Generate random 6-character alphanumeric code
    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
    const code = `ABL-${randomSuffix}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    activePairingCodes.set(code, {
      code,
      driverProfileId,
      driverUserId: driver.userId,
      expiresAt,
      generatedByUserId: performedByUserId,
    });

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'AliBrosDriverBot';
    const deepLink = `https://t.me/${botUsername}?start=${code}`;

    logger.info(
      { driverProfileId, code, expiresAt },
      'Generated driver Telegram pairing code'
    );

    return { code, expiresAt, deepLink };
  }

  /**
   * Validates pairing code and links the Telegram account to the driver.
   * Enforces:
   * 1. Code exists and is not expired.
   * 2. Single-use: code is immediately deleted.
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
    cleanupExpiredCodes();

    const normalizedCode = codeInput.trim().toUpperCase();
    const record = activePairingCodes.get(normalizedCode);

    if (!record) {
      return {
        success: false,
        error: 'Неверный или устаревший код привязки. Запросите новый код у менеджера.',
      };
    }

    if (record.expiresAt < new Date()) {
      activePairingCodes.delete(normalizedCode);
      return {
        success: false,
        error: 'Срок действия кода привязки истёк (срок жизни 30 минут).',
      };
    }

    const telegramIdBigInt = BigInt(telegramIdInput.toString());

    // Check if this Telegram ID is already linked to another user
    if (process.env.DATABASE_URL) {
      const existingAccount = await prisma.telegramAccount.findUnique({
        where: { telegramId: telegramIdBigInt },
        include: { user: true },
      });

      if (existingAccount && existingAccount.userId !== record.driverUserId) {
        return {
          success: false,
          error:
            'Этот Telegram-аккаунт уже привязан к другому пользователю. Обратитесь к администратору для сброса привязки.',
        };
      }
    }

    // Invalidate code immediately (single-use enforcement)
    activePairingCodes.delete(normalizedCode);

    // Save linking in DB
    let driverName = 'Водитель';
    if (process.env.DATABASE_URL) {
      await TelegramService.linkAccount({
        userId: record.driverUserId,
        telegramId: telegramIdBigInt,
        username: telegramUser.username,
        firstName: telegramUser.firstName,
        lastName: telegramUser.lastName,
        languageCode: telegramUser.languageCode,
      });

      const profile = await prisma.driverProfile.findUnique({
        where: { id: record.driverProfileId },
      });
      if (profile) {
        driverName = profile.fullName;
      }

      await AuditService.log({
        userId: record.driverUserId,
        action: AuditAction.UPDATE,
        resource: 'DriverTelegramAccount',
        resourceId: record.driverProfileId,
        metadata: {
          telegramId: telegramIdBigInt.toString(),
          username: telegramUser.username,
        },
      });
    }

    logger.info(
      { driverProfileId: record.driverProfileId, telegramId: telegramIdBigInt.toString() },
      'Successfully verified and linked driver Telegram account'
    );

    return {
      success: true,
      driverProfileId: record.driverProfileId,
      driverFullName: driverName,
    };
  }

  /**
   * Retrieves driver profile for an authenticated Telegram ID.
   */
  public static async getDriverByTelegramId(telegramIdInput: bigint | number | string) {
    if (!process.env.DATABASE_URL) return null;

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
  public static _clearAllCodesForTesting() {
    activePairingCodes.clear();
  }
}
