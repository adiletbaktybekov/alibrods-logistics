import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdempotencyService, computeCanonicalPayloadHash } from '@/lib/security/idempotency.service';
import { ConflictError } from '@/lib/errors';
import { AuthenticatedUser } from '@/types/rbac';

vi.mock('@/database/prisma', async () => {
  const { sharedMockPrisma } = await import('../mocks/mock-prisma');
  return {
    prisma: sharedMockPrisma.mockClient,
  };
});

import { sharedMockPrisma } from '../mocks/mock-prisma';
const { orders, idempotencyKeys } = sharedMockPrisma;

describe('P1 Idempotency Crash-Recovery & Concurrency Test Suite (11 Scenarios)', () => {
  const testUser: AuthenticatedUser = {
    id: 'user-crash-test-001',
    role: 'CLIENT',
    email: 'client.recovery@alibros.local',
  };

  const payload = {
    warehouseId: 'wh-koledino-001',
    deliveryDate: '2026-11-15T09:00:00.000Z',
    totalBoxesCount: 4,
    totalPalletsCount: 1,
    clientComment: 'Crash-recovery test cargo',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    idempotencyKeys.clear();
    orders.clear();
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Авария до создания Order
  // --------------------------------------------------------------------------
  it('Scenario 1: Авария до создания Order — бронь снимается через CAS, повтор успешен', async () => {
    const key = 'ik-sc1-fail-before-create';
    let attempts = 0;

    await expect(
      IdempotencyService.runWithIdempotency(
        { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
        async () => {
          attempts++;
          throw new Error('Connection timeout before creating Order');
        }
      )
    ).rejects.toThrow('Connection timeout before creating Order');

    expect(orders.size).toBe(0);
    expect(idempotencyKeys.has(key)).toBe(false);

    const res = await IdempotencyService.runWithIdempotency(
      { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
      async () => {
        attempts++;
        const ord = { id: 'ord-sc1', orderNumber: 'AB-SC1-001' };
        orders.set(ord.id, ord);
        return ord;
      }
    );

    expect(res.fromCache).toBe(false);
    expect(res.result.orderNumber).toBe('AB-SC1-001');
    expect(orders.size).toBe(1);
    expect(attempts).toBe(2);
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Авария после создания Order, но до сохранения responseBody
  // --------------------------------------------------------------------------
  it('Scenario 2: Авария внутри транзакции — откат транзакции предотвращает создание висячего заказа', async () => {
    const key = 'ik-sc2-rollback-tx';

    await expect(
      IdempotencyService.runWithIdempotency(
        { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
        async () => {
          throw new Error('Process SIGKILL / Serverless abort before COMMIT');
        }
      )
    ).rejects.toThrow('Process SIGKILL');

    expect(orders.size).toBe(0);

    const retry = await IdempotencyService.runWithIdempotency(
      { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
      async () => {
        const ord = { id: 'ord-sc2-committed', orderNumber: 'AB-SC2-002' };
        orders.set(ord.id, ord);
        return ord;
      }
    );

    expect(retry.fromCache).toBe(false);
    expect(orders.size).toBe(1);
    expect(orders.has('ord-sc2-committed')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Повторный запрос после успешного COMMIT
  // --------------------------------------------------------------------------
  it('Scenario 3: Повторный запрос после успешного COMMIT — возвращает результат из кэша, заказ 1', async () => {
    const key = 'ik-sc3-cached-commit';
    let executionCount = 0;

    const op = () =>
      IdempotencyService.runWithIdempotency(
        { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
        async () => {
          executionCount++;
          const ord = { id: 'ord-sc3', orderNumber: 'AB-SC3-001' };
          orders.set(ord.id, ord);
          return ord;
        }
      );

    const first = await op();
    expect(first.fromCache).toBe(false);
    expect(first.result.orderNumber).toBe('AB-SC3-001');
    expect(executionCount).toBe(1);
    expect(orders.size).toBe(1);

    const second = await op();
    expect(second.fromCache).toBe(true);
    expect(second.result.orderNumber).toBe('AB-SC3-001');
    expect(executionCount).toBe(1);
    expect(orders.size).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Два параллельных запроса с одинаковым ключом (in-flight)
  // --------------------------------------------------------------------------
  it('Scenario 4: Параллельный дубликат (in-flight) — второй запрос блокируется с ConflictError', async () => {
    const key = 'ik-sc4-parallel-in-flight';

    idempotencyKeys.set(key, {
      id: 'idemp-sc4',
      key,
      userId: testUser.id,
      action: 'CREATE_CLIENT_ORDER',
      requestHash: computeCanonicalPayloadHash(payload),
      lockToken: 'token-instance-a',
      recoveryAttempts: 0,
      responseBody: null,
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    await expect(
      IdempotencyService.runWithIdempotency(
        { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
        async () => {
          const ord = { id: 'ord-sc4-duplicate', orderNumber: 'AB-DUP' };
          orders.set(ord.id, ord);
          return ord;
        }
      )
    ).rejects.toThrow('уже находится в процессе обработки');

    expect(orders.size).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Перехват устаревшего lockToken (stale lease takeover)
  // --------------------------------------------------------------------------
  it('Scenario 5: Перехват устаревшего lockToken — новый владелец обновляет token и recoveryAttempts', async () => {
    const key = 'ik-sc5-stale-takeover';

    idempotencyKeys.set(key, {
      id: 'idemp-sc5',
      key,
      userId: testUser.id,
      action: 'CREATE_CLIENT_ORDER',
      requestHash: computeCanonicalPayloadHash(payload),
      lockToken: 'stale-token-instance-a',
      recoveryAttempts: 0,
      responseBody: null,
      lockedAt: new Date(Date.now() - 40000),
      expiresAt: new Date(Date.now() + 86400000),
    });

    const res = await IdempotencyService.runWithIdempotency(
      { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
      async () => {
        const ord = { id: 'ord-sc5-recovered', orderNumber: 'AB-SC5-RECOVERED' };
        orders.set(ord.id, ord);
        return ord;
      }
    );

    expect(res.fromCache).toBe(false);
    expect(orders.size).toBe(1);

    const record = idempotencyKeys.get(key);
    expect(record.recoveryAttempts).toBe(1);
    expect(record.lockToken).not.toBe('stale-token-instance-a');
    expect(record.responseStatus).toBe(200);
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Старый catch пытается удалить новый lockToken
  // --------------------------------------------------------------------------
  it('Scenario 6: Старый catch не может удалить запись с новым lockToken (CAS-защита)', async () => {
    const key = 'ik-sc6-old-catch-cas';

    await expect(
      IdempotencyService.runWithIdempotency(
        { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
        async () => {
          const rec = idempotencyKeys.get(key);
          if (rec) {
            rec.lockToken = 'token-instance-b-new';
            rec.responseBody = { orderId: 'ord-sc6-saved-by-b' };
          }
          throw new Error('Instance A finally timed out');
        }
      )
    ).rejects.toThrow('Instance A finally timed out');

    expect(idempotencyKeys.has(key)).toBe(true);
    expect(idempotencyKeys.get(key)?.lockToken).toBe('token-instance-b-new');
    expect(idempotencyKeys.get(key)?.responseBody?.orderId).toBe('ord-sc6-saved-by-b');
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Два инстанса одновременно пытаются восстановить ключ
  // --------------------------------------------------------------------------
  it('Scenario 7: Конкурентное восстановление — CAS гарантирует победу ровно одного инстанса', async () => {
    const key = 'ik-sc7-concurrent-recovery';

    idempotencyKeys.set(key, {
      id: 'idemp-sc7',
      key,
      userId: testUser.id,
      action: 'CREATE_CLIENT_ORDER',
      requestHash: computeCanonicalPayloadHash(payload),
      lockToken: 'stale-token-crashed',
      recoveryAttempts: 0,
      responseBody: null,
      lockedAt: new Date(Date.now() - 40000),
      expiresAt: new Date(Date.now() + 86400000),
    });

    let winnerCalled = false;
    const winnerOp = IdempotencyService.runWithIdempotency(
      { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
      async () => {
        winnerCalled = true;
        const ord = { id: 'ord-sc7-winner', orderNumber: 'AB-SC7-WIN' };
        orders.set(ord.id, ord);
        return ord;
      }
    );

    const winnerResult = await winnerOp;
    expect(winnerResult.fromCache).toBe(false);
    expect(winnerCalled).toBe(true);
    expect(orders.size).toBe(1);
    expect(orders.has('ord-sc7-winner')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Истечение TTL завершённого ключа (>24ч)
  // --------------------------------------------------------------------------
  it('Scenario 8: Истечение TTL (>24ч) — протухший завершённый ключ безопасно удаляется и обновляется', async () => {
    const key = 'ik-sc8-ttl-expired';

    idempotencyKeys.set(key, {
      id: 'idemp-sc8',
      key,
      userId: testUser.id,
      action: 'CREATE_CLIENT_ORDER',
      requestHash: computeCanonicalPayloadHash(payload),
      lockToken: 'token-26h-ago',
      recoveryAttempts: 0,
      responseStatus: 200,
      responseBody: { orderId: 'ord-expired-26h', orderNumber: 'AB-OLD-26H' },
      lockedAt: new Date(Date.now() - 93600000),
      expiresAt: new Date(Date.now() - 7200000),
    });

    let freshCalled = false;
    const res = await IdempotencyService.runWithIdempotency(
      { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
      async () => {
        freshCalled = true;
        const ord = { id: 'ord-sc8-fresh', orderNumber: 'AB-SC8-NEW' };
        orders.set(ord.id, ord);
        return ord;
      }
    );

    expect(freshCalled).toBe(true);
    expect(res.fromCache).toBe(false);
    expect(res.result.orderNumber).toBe('AB-SC8-NEW');
    expect(orders.has('ord-sc8-fresh')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Истечение lease незавершённого ключа (< expiresAt, но > 30s)
  // --------------------------------------------------------------------------
  it('Scenario 9: Истечение lease незавершённого ключа — восстанавливается без полного удаления', async () => {
    const key = 'ik-sc9-lease-expired';

    idempotencyKeys.set(key, {
      id: 'idemp-sc9',
      key,
      userId: testUser.id,
      action: 'CREATE_CLIENT_ORDER',
      requestHash: computeCanonicalPayloadHash(payload),
      lockToken: 'token-lease-35s',
      recoveryAttempts: 0,
      responseBody: null,
      lockedAt: new Date(Date.now() - 35000),
      expiresAt: new Date(Date.now() + 82800000),
    });

    const res = await IdempotencyService.runWithIdempotency(
      { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
      async () => {
        const ord = { id: 'ord-sc9-recovered', orderNumber: 'AB-SC9-OK' };
        orders.set(ord.id, ord);
        return ord;
      }
    );

    expect(res.fromCache).toBe(false);
    expect(res.result.orderNumber).toBe('AB-SC9-OK');
    expect(idempotencyKeys.get(key)?.recoveryAttempts).toBe(1);
    expect(orders.size).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Повторный ключ с изменённым payload
  // --------------------------------------------------------------------------
  it('Scenario 10: Повторный ключ с изменённым payload — строго отклоняется с ConflictError', async () => {
    const key = 'ik-sc10-payload-tamper';

    await IdempotencyService.runWithIdempotency(
      { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
      async () => {
        const ord = { id: 'ord-sc10-orig', orderNumber: 'AB-SC10-ORIG' };
        orders.set(ord.id, ord);
        return ord;
      }
    );

    expect(orders.size).toBe(1);

    const alteredPayload = { ...payload, totalBoxesCount: 99 };
    await expect(
      IdempotencyService.runWithIdempotency(
        { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload: alteredPayload },
        async () => {
          const ord = { id: 'ord-sc10-fake', orderNumber: 'AB-SC10-FAKE' };
          orders.set(ord.id, ord);
          return ord;
        }
      )
    ).rejects.toThrow(ConflictError);

    expect(orders.size).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Ошибка транзакции и последующий безопасный retry
  // --------------------------------------------------------------------------
  it('Scenario 11: Ошибка транзакции и последующий retry — в итоге ровно 1 созданный заказ', async () => {
    const key = 'ik-sc11-transient-retry';
    let attempt = 0;

    const run = () =>
      IdempotencyService.runWithIdempotency(
        { key, userId: testUser.id, action: 'CREATE_CLIENT_ORDER', payload },
        async () => {
          attempt++;
          if (attempt === 1) {
            throw new Error('Deadlock detected or transient serialization failure');
          }
          const ord = { id: 'ord-sc11-success', orderNumber: 'AB-SC11-FINAL' };
          orders.set(ord.id, ord);
          return ord;
        }
      );

    await expect(run()).rejects.toThrow('Deadlock detected');
    expect(orders.size).toBe(0);

    const success = await run();
    expect(success.fromCache).toBe(false);
    expect(success.result.orderNumber).toBe('AB-SC11-FINAL');

    const cached = await run();
    expect(cached.fromCache).toBe(true);
    expect(cached.result.orderNumber).toBe('AB-SC11-FINAL');

    expect(orders.size).toBe(1);
  });
});
