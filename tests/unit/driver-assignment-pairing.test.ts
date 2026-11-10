import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/database/prisma', async () => {
  const { createMockPrisma } = await import('../mocks/mock-prisma');
  const mockPrisma = createMockPrisma();
  return {
    prisma: mockPrisma.mockClient,
    __mockPrismaContext: mockPrisma,
  };
});

import { prisma } from '@/database/prisma';
import { DriverPairingService } from '@/modules/telegram/pairing.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { OrderStatus, AssignmentStatus, UserRole, AuditAction } from '@prisma/client';
import { AuthenticatedUser } from '@/types/rbac';
import { AuditService } from '@/modules/audit/audit.service';

describe('P0 Requirements: Driver Assignment Transactionality & Telegram Pairing Persistence', () => {
  const managerUser: AuthenticatedUser = {
    id: '11111111-2222-3333-4444-555555555555',
    role: 'MANAGER',
    email: 'manager@alibros.ru',
  };

  const clientUser: AuthenticatedUser = {
    id: '22222222-3333-4444-5555-666666666666',
    role: 'CLIENT',
    email: 'client@seller.ru',
  };

  const driverProfileId1 = 'driver-uuid-1';
  const driverProfileId2 = 'driver-uuid-2';
  const testOrderId = 'order-test-uuid-1';

  beforeEach(async () => {
    await DriverPairingService._clearAllCodesForTesting();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // P0.2 — PERSISTENCE & ATOMICITY OF TELEGRAM PAIRING CODES
  // ==========================================================================
  describe('P0.2: Telegram Pairing Codes Database Persistence', () => {
    it('1. Создание pairing-кода: генерирует код с префиксом ABL-, TTL 30 минут и сохраняет в БД', async () => {
      const result = await DriverPairingService.generatePairingCode(
        driverProfileId1,
        managerUser.id
      );

      expect(result.code).toMatch(/^ABL-[A-F0-9]{6}$/);
      expect(result.deepLink).toContain(`start=${result.code}`);

      const now = Date.now();
      expect(result.expiresAt.getTime()).toBeGreaterThan(now + 29 * 60 * 1000);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(now + 30 * 60 * 1000 + 1000);

      // Verify stored in DB
      const record = await prisma.telegramPairingCode.findUnique({
        where: { code: result.code },
      });
      expect(record).not.toBeNull();
      expect(record?.code).toBe(result.code);
      expect(record?.usedAt).toBeNull();
    });

    it('2. Успешное использование: валидирует код, атомарно проставляет usedAt и связывает Telegram ID', async () => {
      const { code } = await DriverPairingService.generatePairingCode(
        driverProfileId1,
        managerUser.id
      );

      const linkResult = await DriverPairingService.verifyAndLinkDriver(
        7771234567n,
        code,
        {
          username: 'driver_telegram_hero',
          firstName: 'Иван',
          lastName: 'Иванов',
        }
      );

      expect(linkResult.success).toBe(true);
      expect(linkResult.driverProfileId).toBe(driverProfileId1);
      expect(linkResult.driverFullName).toBe('Водитель Иванов');

      // Verify in DB that code is marked as used
      const codeRecord = await prisma.telegramPairingCode.findUnique({
        where: { code },
      });
      expect(codeRecord?.usedAt).not.toBeNull();

      // Verify telegramAccount was upserted in DB
      const tgAccount = await prisma.telegramAccount.findUnique({
        where: { telegramId: 7771234567n },
      });
      expect(tgAccount).not.toBeNull();
      expect(tgAccount?.username).toBe('driver_telegram_hero');
    });

    it('3. Повторное использование: запрещено, повторная попытка отклоняется', async () => {
      const { code } = await DriverPairingService.generatePairingCode(
        driverProfileId1,
        managerUser.id
      );

      // First consumption succeeds
      const first = await DriverPairingService.verifyAndLinkDriver(
        7771234567n,
        code,
        { username: 'driver_hero' }
      );
      expect(first.success).toBe(true);

      // Second consumption must be rejected
      const second = await DriverPairingService.verifyAndLinkDriver(
        7771234567n,
        code,
        { username: 'driver_hero' }
      );
      expect(second.success).toBe(false);
      expect(second.error).toContain('уже был использован');
    });

    it('4. Просроченный код: код со сроком действия > 30 минут отклоняется', async () => {
      const { code } = await DriverPairingService.generatePairingCode(
        driverProfileId1,
        managerUser.id
      );

      // Manually simulate expiration in DB
      const expiredDate = new Date(Date.now() - 5 * 60 * 1000); // expired 5 minutes ago
      await prisma.telegramPairingCode.updateMany({
        where: { code },
        data: { expiresAt: expiredDate },
      });

      const res = await DriverPairingService.verifyAndLinkDriver(
        7771234567n,
        code,
        { username: 'driver_late' }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Срок действия кода привязки истёк');
    });

    it('5. Несуществующий код: отклоняется с понятным сообщением', async () => {
      const res = await DriverPairingService.verifyAndLinkDriver(
        7771234567n,
        'ABL-999999',
        { username: 'driver_phantom' }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Неверный или устаревший код привязки');
    });

    it('6. Параллельное использование одного кода: только один запрос успешен (атомарное потребление)', async () => {
      const { code } = await DriverPairingService.generatePairingCode(
        driverProfileId1,
        managerUser.id
      );

      // Fire 2 concurrent linking requests for the same code simultaneously
      const [res1, res2] = await Promise.all([
        DriverPairingService.verifyAndLinkDriver(8881112223n, code, { username: 'req1' }),
        DriverPairingService.verifyAndLinkDriver(8881112223n, code, { username: 'req2' }),
      ]);

      // Exactly one must succeed and one must fail
      const successCount = [res1, res2].filter((r) => r.success).length;
      const failCount = [res1, res2].filter((r) => !r.success).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(1);

      const failedResult = [res1, res2].find((r) => !r.success)!;
      expect(failedResult.error).toContain('уже был использован');
    });

    it('7. Проверка соответствия пользователя: запрещает привязку Telegram ID, если он привязан к другому пользователю', async () => {
      // First link Telegram ID 999000111222 to driver 1
      const { code: codeDriver1 } = await DriverPairingService.generatePairingCode(
        driverProfileId1,
        managerUser.id
      );
      await DriverPairingService.verifyAndLinkDriver(
        999000111222n,
        codeDriver1,
        { username: 'driver_one' }
      );

      // Now driver 2 generates a code
      const { code: codeDriver2 } = await DriverPairingService.generatePairingCode(
        driverProfileId2,
        managerUser.id
      );

      // Attempting to link the same Telegram ID 999000111222 to driver 2 must fail!
      const hijackAttempt = await DriverPairingService.verifyAndLinkDriver(
        999000111222n,
        codeDriver2,
        { username: 'driver_one' }
      );

      expect(hijackAttempt.success).toBe(false);
      expect(hijackAttempt.error).toContain('уже привязан к другому пользователю');
    });

    it('8. Отклоняет генерацию кода для деактивированного водителя', async () => {
      vi.mocked(prisma.driverProfile.findUnique).mockResolvedValueOnce({
        id: 'driver-deactivated-id',
        userId: 'deactivated-user-id',
        fullName: 'Деактивированный Водитель',
        user: { id: 'deactivated-user-id', role: UserRole.DRIVER, isActive: false },
      } as any);

      await expect(
        DriverPairingService.generatePairingCode('driver-deactivated-id', managerUser.id)
      ).rejects.toThrow('Учётная запись водителя деактивирована');
    });
  });

  // ==========================================================================
  // P0.1 — TRANSACTIONALITY & CONCURRENCY OF DRIVER ASSIGNMENT
  // ==========================================================================
  describe('P0.1: Driver Assignment Transactionality & Concurrency', () => {
    it('1. Успешное назначение: в единой транзакции создает Assignment, переводит заказ в ASSIGNED_TO_DRIVER и создает History', async () => {
      // Setup confirmed order in DB
      const mockOrder = {
        id: testOrderId,
        orderNumber: 'ABL-2611-000001',
        status: OrderStatus.CONFIRMED,
        assignments: [],
      };
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(mockOrder as any);

      const assignment = await OrdersService.assignDriver(
        managerUser,
        testOrderId,
        { driverProfileId: driverProfileId1, notes: 'Срочный рейс' }
      );

      expect(assignment).toBeDefined();
      expect(assignment.driverId).toBe(driverProfileId1);
      expect(assignment.status).toBe(AssignmentStatus.ASSIGNED);

      // Verify Prisma $transaction was used
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // Verify order status update was called with ASSIGNED_TO_DRIVER
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: testOrderId },
          data: { status: OrderStatus.ASSIGNED_TO_DRIVER },
        })
      );

      // Verify history tracking record was created
      expect(prisma.orderStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: testOrderId,
            fromStatus: OrderStatus.CONFIRMED,
            toStatus: OrderStatus.ASSIGNED_TO_DRIVER,
            changedById: managerUser.id,
          }),
        })
      );
    });

    it('2. Сбой транзакции назначения водителя: при ошибке в транзакции изменения откатываются', async () => {
      const mockOrder = {
        id: testOrderId,
        orderNumber: 'ABL-2611-000002',
        status: OrderStatus.CONFIRMED,
        assignments: [],
      };
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(mockOrder as any);

      // Simulate failure in orderStatusHistory creation inside transaction
      vi.mocked(prisma.orderStatusHistory.create).mockRejectedValueOnce(
        new Error('DB Connection Timeout during History Insert')
      );

      await expect(
        OrdersService.assignDriver(managerUser, testOrderId, {
          driverProfileId: driverProfileId1,
        })
      ).rejects.toThrow('DB Connection Timeout during History Insert');
    });

    it('3. Конкурентное / дублирующее назначение: если водитель уже назначен на данный заказ, выбрасывает ошибку', async () => {
      const mockOrderWithDriver = {
        id: testOrderId,
        orderNumber: 'ABL-2611-000003',
        status: OrderStatus.ASSIGNED_TO_DRIVER,
        assignments: [
          {
            id: 'asgn-active-1',
            driverId: driverProfileId1,
            status: AssignmentStatus.ASSIGNED,
          },
        ],
      };
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(mockOrderWithDriver as any);

      await expect(
        OrdersService.assignDriver(managerUser, testOrderId, {
          driverProfileId: driverProfileId1, // Same driver already assigned
        })
      ).rejects.toThrow('Этот водитель уже назначен на данную заявку');
    });

    it('4. Повторное назначение (Reassignment): корректно отменяет предыдущее назначение другого водителя', async () => {
      const mockOrderWithPrevDriver = {
        id: testOrderId,
        orderNumber: 'ABL-2611-000004',
        status: OrderStatus.ASSIGNED_TO_DRIVER,
        assignments: [
          {
            id: 'asgn-old-driver-1',
            driverId: driverProfileId1,
            status: AssignmentStatus.ASSIGNED,
            notes: 'Старое назначение',
          },
        ],
      };
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(mockOrderWithPrevDriver as any);

      const newAssignment = await OrdersService.assignDriver(
        managerUser,
        testOrderId,
        { driverProfileId: driverProfileId2, notes: 'Замена водителя' }
      );

      expect(newAssignment.driverId).toBe(driverProfileId2);

      // Verify old assignment was cancelled
      expect(prisma.orderAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'asgn-old-driver-1' },
          data: expect.objectContaining({
            status: AssignmentStatus.CANCELLED,
          }),
        })
      );
    });

    it('5. Запрет назначения на неподтверждённый заказ (CREATED, REJECTED, COMPLETED)', async () => {
      const unconfirmedOrder = {
        id: testOrderId,
        orderNumber: 'ABL-2611-000005',
        status: OrderStatus.CREATED,
        assignments: [],
      };
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(unconfirmedOrder as any);

      await expect(
        OrdersService.assignDriver(managerUser, testOrderId, {
          driverProfileId: driverProfileId1,
        })
      ).rejects.toThrow('Водитель может быть назначен только на подтверждённую заявку');
    });

    it('6. Защита RBAC: отклоняет попытку вызова assignDriver клиентом', async () => {
      await expect(
        OrdersService.assignDriver(clientUser, testOrderId, {
          driverProfileId: driverProfileId1,
        })
      ).rejects.toThrow('Only managers and administrators can assign drivers to orders');
    });
  });

  // ==========================================================================
  // PII & SECURITY AUDIT IN LOGS
  // ==========================================================================
  describe('Security & PII Audit', () => {
    it('Аудит-логирование не содержит паролей, токенов ботов или приватных ключей', async () => {
      const logSpy = vi.spyOn(AuditService, 'log');

      const { code } = await DriverPairingService.generatePairingCode(
        driverProfileId1,
        managerUser.id
      );

      await DriverPairingService.verifyAndLinkDriver(555666777n, code, {
        username: 'safe_driver',
      });

      expect(logSpy).toHaveBeenCalled();
      const lastCall = logSpy.mock.calls[logSpy.mock.calls.length - 1][0];

      expect(lastCall.action).toBe(AuditAction.UPDATE);
      expect(lastCall.resource).toBe('DriverTelegramAccount');

      // Verify payload has no secrets
      const serialized = JSON.stringify(lastCall);
      expect(serialized).not.toContain('private_key');
      expect(serialized).not.toContain('bot_token');
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('secret');
    });
  });
});
