import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdempotencyService, computeCanonicalPayloadHash } from '@/lib/security/idempotency.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { OrderStatus, AssignmentStatus, UserRole } from '@prisma/client';
import { ConflictError, ValidationError, ForbiddenError } from '@/lib/errors';
import { AuthenticatedUser } from '@/types/rbac';

vi.mock('@/database/prisma', async () => {
  const { sharedMockPrisma } = await import('../mocks/mock-prisma');
  return {
    prisma: sharedMockPrisma.mockClient,
  };
});

import { sharedMockPrisma } from '../mocks/mock-prisma';
const { mockClient, orders, assignments, statusHistories, idempotencyKeys } = sharedMockPrisma;


vi.mock('@/modules/notifications/dispatcher.service', () => ({
  NotificationDispatcherService: {
    notifyOrderCreated: vi.fn().mockResolvedValue(undefined),
    notifyStatusChanged: vi.fn().mockResolvedValue(undefined),
    notifyDriverOrderAssigned: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/modules/audit/audit.service', () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('P1 Reliability Fixes: Idempotency & Driver Assignment Concurrency', () => {
  const clientUser: AuthenticatedUser = {
    id: '11111111-1111-4111-a111-111111111111',
    role: 'CLIENT',
    email: 'client@test.local',
  };

  const managerUser: AuthenticatedUser = {
    id: '22222222-2222-4222-a222-222222222222',
    role: 'MANAGER',
    email: 'manager@test.local',
  };

  const driverProfileId = 'driver-uuid-1';
  const driverProfileId2 = 'driver-uuid-2';
  const testOrderId = 'order-uuid-100';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    idempotencyKeys.clear();
    orders.clear();
    assignments.clear();
    statusHistories.length = 0;
  });

  // ==========================================================================
  // P1-1: Idempotency Service & Order Creation Tests
  // ==========================================================================
  describe('P1-1: Server-Side Order Creation Idempotency', () => {
    const payload = {
      warehouseId: 'wh-uuid-1',
      deliveryDate: '2026-11-10T10:00:00.000Z',
      totalBoxesCount: 5,
      totalPalletsCount: 1,
      clientComment: 'Поставка на Коледино',
    };

    it('1. Детерминированный хеш: одинаковые объекты с разным порядком ключей дают одинаковый SHA-256', () => {
      const hashA = computeCanonicalPayloadHash({ a: 1, b: 2, c: { x: 'foo', y: 'bar' } });
      const hashB = computeCanonicalPayloadHash({ b: 2, c: { y: 'bar', x: 'foo' }, a: 1 });
      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64);
    });

    it('2. Первый запрос: успешно выполняет операцию и сохраняет результат в БД', async () => {
      let executionCount = 0;
      const key = 'ik-test-first-001';

      const res = await IdempotencyService.runWithIdempotency(
        {
          key,
          userId: clientUser.id,
          action: 'CREATE_CLIENT_ORDER',
          payload,
        },
        async () => {
          executionCount++;
          return { orderId: 'ord-123', orderNumber: 'AB-2026-001' };
        }
      );

      expect(res.fromCache).toBe(false);
      expect(res.result.orderNumber).toBe('AB-2026-001');
      expect(executionCount).toBe(1);

      // Verify stored in DB
      const stored = idempotencyKeys.get(key);
      expect(stored).toBeDefined();
      expect(stored.responseStatus).toBe(200);
      expect(stored.responseBody.orderNumber).toBe('AB-2026-001');
    });

    it('3. Повторный запрос с тем же ключом: не выполняет операцию снова и возвращает первоначальный результат из кэша', async () => {
      let executionCount = 0;
      const key = 'ik-test-retry-002';

      const executeOp = () =>
        IdempotencyService.runWithIdempotency(
          {
            key,
            userId: clientUser.id,
            action: 'CREATE_CLIENT_ORDER',
            payload,
          },
          async () => {
            executionCount++;
            return { orderId: 'ord-123', orderNumber: 'AB-2026-002' };
          }
        );

      const first = await executeOp();
      expect(first.fromCache).toBe(false);
      expect(first.result.orderNumber).toBe('AB-2026-002');
      expect(executionCount).toBe(1);

      // Re-send with identical key and payload
      const second = await executeOp();
      expect(second.fromCache).toBe(true);
      expect(second.result.orderNumber).toBe('AB-2026-002');
      expect(executionCount).toBe(1); // Crucial: business logic was NOT called a second time
    });

    it('4. Повторный ключ с другим содержимым: строго отклоняется с ConflictError', async () => {
      const key = 'ik-test-conflict-003';

      // 1. First request with payload A
      await IdempotencyService.runWithIdempotency(
        {
          key,
          userId: clientUser.id,
          action: 'CREATE_CLIENT_ORDER',
          payload,
        },
        async () => ({ orderId: 'ord-1' })
      );

      // 2. Second request with same key but altered payload B
      const alteredPayload = { ...payload, totalBoxesCount: 999 };

      await expect(
        IdempotencyService.runWithIdempotency(
          {
            key,
            userId: clientUser.id,
            action: 'CREATE_CLIENT_ORDER',
            payload: alteredPayload,
          },
          async () => ({ orderId: 'ord-2' })
        )
      ).rejects.toThrow(ConflictError);
    });

    it('5. Повторный ключ от другого пользователя: отклоняется с ConflictError', async () => {
      const key = 'ik-test-user-hijack-004';

      await IdempotencyService.runWithIdempotency(
        {
          key,
          userId: clientUser.id,
          action: 'CREATE_CLIENT_ORDER',
          payload,
        },
        async () => ({ orderId: 'ord-1' })
      );

      await expect(
        IdempotencyService.runWithIdempotency(
          {
            key,
            userId: '33333333-3333-4333-a333-333333333333', // other user
            action: 'CREATE_CLIENT_ORDER',
            payload,
          },
          async () => ({ orderId: 'ord-other' })
        )
      ).rejects.toThrow(ConflictError);
    });

    it('6. Параллельный запрос с тем же ключом (in-flight): блокируется с понятной ошибкой', async () => {
      const key = 'ik-test-inflight-005';

      // Simulate record locked by another concurrent process (responseBody is not set yet)
      idempotencyKeys.set(key, {
        key,
        userId: clientUser.id,
        action: 'CREATE_CLIENT_ORDER',
        requestHash: computeCanonicalPayloadHash(payload),
        responseBody: null,
        lockedAt: new Date(), // locked just now
      });

      await expect(
        IdempotencyService.runWithIdempotency(
          {
            key,
            userId: clientUser.id,
            action: 'CREATE_CLIENT_ORDER',
            payload,
          },
          async () => ({ orderId: 'ord-parallel' })
        )
      ).rejects.toThrow('уже находится в процессе обработки');
    });

    it('7. Откат транзакции при ошибке: бронь ключа удаляется для возможности безопасного ретрая', async () => {
      const key = 'ik-test-rollback-006';

      await expect(
        IdempotencyService.runWithIdempotency(
          {
            key,
            userId: clientUser.id,
            action: 'CREATE_CLIENT_ORDER',
            payload,
          },
          async () => {
            throw new Error('Database connection timeout during order save');
          }
        )
      ).rejects.toThrow('Database connection timeout during order save');

      // Verify reservation was deleted so client can retry
      expect(idempotencyKeys.has(key)).toBe(false);
    });

    it('8. Защита CAS: старый catch не удаляет ключ, если lockToken изменился (перехвачен другим процессом)', async () => {
      const key = 'ik-test-cas-token-007';

      await expect(
        IdempotencyService.runWithIdempotency(
          {
            key,
            userId: clientUser.id,
            action: 'CREATE_CLIENT_ORDER',
            payload,
          },
          async () => {
            // Simulate that while this operation was running, another instance took over the lock
            const record = idempotencyKeys.get(key);
            if (record) {
              record.lockToken = 'new-owner-token-uuid';
            }
            throw new Error('Slow worker timed out');
          }
        )
      ).rejects.toThrow('Slow worker timed out');

      // Crucial: The key must NOT be deleted because lockToken was changed by the new owner!
      expect(idempotencyKeys.has(key)).toBe(true);
      expect(idempotencyKeys.get(key)?.lockToken).toBe('new-owner-token-uuid');
    });

    it('9. Защита CAS: старый catch не удаляет ключ, если responseBody уже успешно сохранён', async () => {
      const key = 'ik-test-cas-response-008';

      await expect(
        IdempotencyService.runWithIdempotency(
          {
            key,
            userId: clientUser.id,
            action: 'CREATE_CLIENT_ORDER',
            payload,
          },
          async () => {
            // Simulate that another instance completed and committed responseBody
            const record = idempotencyKeys.get(key);
            if (record) {
              record.responseBody = { orderId: 'ord-completed-by-other' };
            }
            throw new Error('Transient network error');
          }
        )
      ).rejects.toThrow('Transient network error');

      // Crucial: Completed responseBody must be protected from deletion!
      expect(idempotencyKeys.has(key)).toBe(true);
      expect(idempotencyKeys.get(key)?.responseBody?.orderId).toBe('ord-completed-by-other');
    });

    it('10. Перехват устаревшей блокировки (>30s): генерирует новый lockToken и инкрементирует recoveryAttempts', async () => {
      const key = 'ik-test-stale-takeover-009';

      // Seed a stale lock from 45 seconds ago
      idempotencyKeys.set(key, {
        id: 'rec-stale',
        key,
        userId: clientUser.id,
        action: 'CREATE_CLIENT_ORDER',
        requestHash: computeCanonicalPayloadHash(payload),
        lockToken: 'initial-stale-token',
        recoveryAttempts: 0,
        responseBody: null,
        lockedAt: new Date(Date.now() - 45000), // 45 seconds ago
        expiresAt: new Date(Date.now() + 86400000),
      });

      const res = await IdempotencyService.runWithIdempotency(
        {
          key,
          userId: clientUser.id,
          action: 'CREATE_CLIENT_ORDER',
          payload,
        },
        async () => ({ orderId: 'ord-recovered', orderNumber: 'AB-2026-RECOVERED' })
      );

      expect(res.fromCache).toBe(false);
      expect(res.result.orderNumber).toBe('AB-2026-RECOVERED');

      const updated = idempotencyKeys.get(key);
      expect(updated.recoveryAttempts).toBe(1);
      expect(updated.lockToken).not.toBe('initial-stale-token');
      expect(updated.responseStatus).toBe(200);
    });

    it('11. Превышение лимита recoveryAttempts (3): блокирует дальнейшие ретраи с понятной ошибкой', async () => {
      const key = 'ik-test-recovery-exhausted-010';

      // Seed key with recoveryAttempts = 3
      idempotencyKeys.set(key, {
        id: 'rec-exhausted',
        key,
        userId: clientUser.id,
        action: 'CREATE_CLIENT_ORDER',
        requestHash: computeCanonicalPayloadHash(payload),
        lockToken: 'exhausted-token',
        recoveryAttempts: 3,
        responseBody: null,
        lockedAt: new Date(Date.now() - 45000),
        expiresAt: new Date(Date.now() + 86400000),
      });

      await expect(
        IdempotencyService.runWithIdempotency(
          {
            key,
            userId: clientUser.id,
            action: 'CREATE_CLIENT_ORDER',
            payload,
          },
          async () => ({ orderId: 'ord-should-not-run' })
        )
      ).rejects.toThrow('Превышено максимальное количество попыток восстановления');
    });

    it('12. Истечение TTL завершённого ключа (>24ч): удаляет протухшую запись и позволяет выполнить новую операцию', async () => {
      const key = 'ik-test-ttl-expired-011';

      // Seed a completed key that expired 2 hours ago
      idempotencyKeys.set(key, {
        id: 'rec-expired',
        key,
        userId: clientUser.id,
        action: 'CREATE_CLIENT_ORDER',
        requestHash: computeCanonicalPayloadHash(payload),
        lockToken: 'old-token',
        recoveryAttempts: 0,
        responseStatus: 200,
        responseBody: { orderId: 'ord-old-expired', orderNumber: 'AB-OLD-001' },
        lockedAt: new Date(Date.now() - 90000000),
        expiresAt: new Date(Date.now() - 7200000), // expired 2 hours ago
      });

      // Now request with same key should NOT return the stale cached response, but execute fresh
      let freshExecuted = false;
      const res = await IdempotencyService.runWithIdempotency(
        {
          key,
          userId: clientUser.id,
          action: 'CREATE_CLIENT_ORDER',
          payload,
        },
        async () => {
          freshExecuted = true;
          return { orderId: 'ord-fresh', orderNumber: 'AB-FRESH-002' };
        }
      );

      expect(freshExecuted).toBe(true);
      expect(res.fromCache).toBe(false);
      expect(res.result.orderNumber).toBe('AB-FRESH-002');
    });
  });

  // ==========================================================================
  // P1-2: Driver Assignment Concurrency & Row Locking Tests
  // ==========================================================================
  describe('P1-2: Concurrency & Row-Level Lock in assignDriver', () => {
    it('1. Блокировка строки FOR UPDATE: выполняет SELECT FOR UPDATE перед модификацией', async () => {
      orders.set(testOrderId, {
        id: testOrderId,
        orderNumber: 'AB-2026-101',
        status: OrderStatus.CONFIRMED,
        assignments: [],
      });

      await OrdersService.assignDriver(managerUser, testOrderId, {
        driverProfileId,
        notes: 'Срочный выезд',
      });

      // Verify row-level lock query was dispatched
      expect(mockClient.$queryRaw).toHaveBeenCalled();
    });

    it('2. Дублирующее назначение одного водителя: отклоняется', async () => {
      orders.set(testOrderId, {
        id: testOrderId,
        orderNumber: 'AB-2026-102',
        status: OrderStatus.ASSIGNED_TO_DRIVER,
        assignments: [
          {
            id: 'asgn-1',
            orderId: testOrderId,
            driverId: driverProfileId,
            status: AssignmentStatus.ASSIGNED,
          },
        ],
      });

      await expect(
        OrdersService.assignDriver(managerUser, testOrderId, {
          driverProfileId,
        })
      ).rejects.toThrow('Этот водитель уже назначен на данную заявку');
    });

    it('3. Повторное назначение другого водителя (Reassignment): корректно отменяет предыдущее активное назначение', async () => {
      const oldAssignment = {
        id: 'asgn-prev',
        orderId: testOrderId,
        driverId: driverProfileId,
        status: AssignmentStatus.ASSIGNED,
        notes: 'Старое назначение',
      };
      assignments.set(oldAssignment.id, oldAssignment);

      orders.set(testOrderId, {
        id: testOrderId,
        orderNumber: 'AB-2026-103',
        status: OrderStatus.ASSIGNED_TO_DRIVER,
        assignments: [oldAssignment],
      });

      const res = await OrdersService.assignDriver(managerUser, testOrderId, {
        driverProfileId: driverProfileId2,
        notes: 'Замена водителя диспетчером',
      });

      expect(res.driverId).toBe(driverProfileId2);
      expect(oldAssignment.status).toBe(AssignmentStatus.CANCELLED);
    });

    it('4. Защита активных статусов: учитывает IN_PROGRESS как активное назначение', async () => {
      orders.set(testOrderId, {
        id: testOrderId,
        orderNumber: 'AB-2026-104',
        status: OrderStatus.ASSIGNED_TO_DRIVER,
        assignments: [
          {
            id: 'asgn-in-prog',
            orderId: testOrderId,
            driverId: driverProfileId,
            status: AssignmentStatus.IN_PROGRESS,
          },
        ],
      });

      await expect(
        OrdersService.assignDriver(managerUser, testOrderId, {
          driverProfileId,
        })
      ).rejects.toThrow('Этот водитель уже назначен на данную заявку');
    });

    it('5. RBAC: Клиент не имеет права назначать водителя', async () => {
      await expect(
        OrdersService.assignDriver(clientUser, testOrderId, {
          driverProfileId,
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
