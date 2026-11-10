import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/database/prisma';
import { IdempotencyService, computeCanonicalPayloadHash } from '@/lib/security/idempotency.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { AuthenticatedUser } from '@/types/rbac';
import { AssignmentStatus, OrderStatus } from '@prisma/client';

const rawDbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
const isStagingDb = rawDbUrl.includes('alibros_staging');

const describeLive = isStagingDb ? describe : describe.skip;

describeLive('Neon Staging Real PostgreSQL Concurrency & Idempotency Test Suite', { timeout: 25000 }, () => {
  const createdOrderIds: string[] = [];
  const createdOrderNumbers: string[] = [];
  const createdIdempotencyKeys: string[] = [];
  const createdAssignmentIds: string[] = [];

  let clientUser: AuthenticatedUser;
  let clientProfileId: string;
  let warehouseId: string;
  let driverProfileId: string;

  beforeAll(async () => {
    // 1. Safety Checks
    if (!isStagingDb) {
      throw new Error(`[SAFETY GUARD] Test allowed only on 'alibros_staging'.`);
    }
    const u = new URL(rawDbUrl);
    const dbName = u.pathname.replace(/^\//, '');
    if (dbName !== 'alibros_staging') {
      throw new Error(`[SAFETY GUARD] Forbidden database '${dbName}'! Test allowed only on 'alibros_staging'.`);
    }

    process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'false';
    process.env.GOOGLE_SHEETS_SYNC_ENABLED = 'false';

    // 2. Baseline TC-E01 verification
    const tcE01 = await prisma.order.findUnique({
      where: { orderNumber: 'AB-20261109-3783' },
    });
    if (!tcE01) {
      throw new Error("Baseline TC-E01 order 'AB-20261109-3783' not found in Staging!");
    }

    // 3. Load seed entities from Staging
    const clientRecord = await prisma.user.findUnique({
      where: { email: 'client.test@alibros.local' },
      include: { clientProfile: true },
    });
    if (!clientRecord || !clientRecord.clientProfile) {
      throw new Error("Test client 'client.test@alibros.local' not found!");
    }
    clientUser = {
      id: clientRecord.id,
      role: clientRecord.role,
      email: clientRecord.email,
    };
    clientProfileId = clientRecord.clientProfile.id;

    const wh = await prisma.warehouse.findFirst({ where: { code: 'WB_KOLEDINO' } });
    if (!wh) throw new Error("Warehouse 'WB_KOLEDINO' not found!");
    warehouseId = wh.id;

    const drv = await prisma.driverProfile.findFirst();
    if (!drv) throw new Error('Driver profile not found!');
    driverProfileId = drv.id;
  });

  afterAll(async () => {
    // ------------------------------------------------------------------------
    // STRICT SAFE CLEANUP (Only entities created in this test run)
    // ------------------------------------------------------------------------
    // Safety guard: ensure TC-E01 is NOT touched
    const containsTcE01 =
      createdOrderNumbers.includes('AB-20261109-3783') ||
      createdOrderIds.includes('f6d5f9d1-ce06-4fea-8730-351b804e5610');
    if (containsTcE01) {
      throw new Error('CRITICAL SAFETY ALERT: TC-E01 was in cleanup list! Aborting cleanup!');
    }

    if (createdAssignmentIds.length > 0) {
      await prisma.orderAssignment.deleteMany({
        where: { id: { in: createdAssignmentIds } },
      });
    }

    if (createdOrderIds.length > 0) {
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.orderStatusHistory.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { resource: 'Order', resourceId: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
    }

    if (createdIdempotencyKeys.length > 0) {
      await prisma.idempotencyKey.deleteMany({
        where: { key: { in: createdIdempotencyKeys } },
      });
    }

    // Verify TC-E01 is still intact
    const tcE01Post = await prisma.order.findUnique({
      where: { orderNumber: 'AB-20261109-3783' },
    });
    expect(tcE01Post?.status).toBe(OrderStatus.DELIVERED_TO_WAREHOUSE);
  });

  // ==========================================================================
  // SCENARIO A: 5 Concurrent Requests with identical Idempotency-Key
  // ==========================================================================
  it('Scenario A: 5 параллельных запросов — в PostgreSQL создаётся ровно 1 заявка', async () => {
    const key = `ik-live-race-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    createdIdempotencyKeys.push(key);

    const payload = {
      warehouseId,
      deliveryDate: new Date('2026-11-20T10:00:00Z'),
      totalBoxesCount: 3,
      totalPalletsCount: 1,
      clientComment: 'Live PostgreSQL Concurrency Test (Scenario A)',
      idempotencyKey: key,
    };

    // Dispatch 5 concurrent requests simultaneously
    const promises = Array.from({ length: 5 }, (_, idx) =>
      OrdersService.createFromClient(clientUser, payload).then(
        (res) => ({ status: 'fulfilled' as const, idx, orderId: res.id, orderNumber: res.orderNumber }),
        (err) => ({ status: 'rejected' as const, idx, error: err.message, code: err.statusCode || err.code || 'ERR' })
      )
    );

    const outcomes = await Promise.all(promises);
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');

    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // Track created order IDs
    fulfilled.forEach((f) => {
      if ('orderId' in f && !createdOrderIds.includes(f.orderId)) {
        createdOrderIds.push(f.orderId);
        createdOrderNumbers.push(f.orderNumber);
      }
    });

    // Verify in PostgreSQL: exactly 1 order exists for this payload comment
    const ordersInDb = await prisma.order.findMany({
      where: {
        clientId: clientProfileId,
        clientComment: 'Live PostgreSQL Concurrency Test (Scenario A)',
      },
    });

    expect(ordersInDb.length).toBe(1);

    // Verify idempotency record in PostgreSQL
    const idempRecord = await prisma.idempotencyKey.findUnique({ where: { key } });
    expect(idempRecord).not.toBeNull();
    expect(idempRecord?.responseStatus).toBe(200);
    expect(idempRecord?.responseBody).not.toBeNull();
  });

  // ==========================================================================
  // SCENARIO B: Real PostgreSQL Interactive Transaction Rollback
  // ==========================================================================
  it('Scenario B: Реальный откат транзакции — заказ не сохраняется в БД, повтор успешен', async () => {
    const key = `ik-live-rollback-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    createdIdempotencyKeys.push(key);

    const simulatedOrderNumber = `AB-LIVE-ROLL-${Date.now()}`;
    let threw = false;

    // 1. Transaction fails intentionally before commit
    try {
      await IdempotencyService.runWithIdempotency(
        {
          key,
          userId: clientUser.id,
          action: 'CREATE_CLIENT_ORDER',
          payload: { orderNumber: simulatedOrderNumber },
        },
        async (tx) => {
          const ord = await tx.order.create({
            data: {
              orderNumber: simulatedOrderNumber,
              clientId: clientProfileId,
              warehouseId,
              marketplace: 'WILDBERRIES',
              status: OrderStatus.CREATED,
              totalBoxesCount: 1,
              totalPalletsCount: 0,
              clientComment: 'Simulated failure inside transaction',
            },
          });
          createdOrderIds.push(ord.id);
          throw new Error('Simulated crash inside PostgreSQL transaction');
        }
      );
    } catch (err: any) {
      if (err.message.includes('Simulated crash')) {
        threw = true;
      }
    }

    expect(threw).toBe(true);

    // Verify order was rolled back in PostgreSQL
    const rolledBackOrder = await prisma.order.findUnique({
      where: { orderNumber: simulatedOrderNumber },
    });
    expect(rolledBackOrder).toBeNull();

    // Verify key was cleaned up via CAS
    const cleanedKey = await prisma.idempotencyKey.findUnique({ where: { key } });
    expect(cleanedKey).toBeNull();

    // 2. Safe retry with identical key creates exactly 1 order
    const retryRes = await IdempotencyService.runWithIdempotency(
      {
        key,
        userId: clientUser.id,
        action: 'CREATE_CLIENT_ORDER',
        payload: { orderNumber: simulatedOrderNumber },
      },
      async (tx) => {
        const ord = await tx.order.create({
          data: {
            orderNumber: `AB-RETRY-${Date.now()}`,
            clientId: clientProfileId,
            warehouseId,
            marketplace: 'WILDBERRIES',
            status: OrderStatus.CREATED,
            totalBoxesCount: 1,
            totalPalletsCount: 0,
            clientComment: 'Retry after rollback (Scenario B)',
          },
        });
        createdOrderIds.push(ord.id);
        createdOrderNumbers.push(ord.orderNumber);
        return { orderId: ord.id, orderNumber: ord.orderNumber };
      }
    );

    expect(retryRes.fromCache).toBe(false);

    const savedOrder = await prisma.order.findUnique({
      where: { orderNumber: retryRes.result.orderNumber },
    });
    expect(savedOrder).not.toBeNull();

    const savedKey = await prisma.idempotencyKey.findUnique({ where: { key } });
    expect(savedKey?.responseStatus).toBe(200);
  });

  // ==========================================================================
  // SCENARIO C: Lease Takeover & LockToken Protection
  // ==========================================================================
  it('Scenario C: Lease Takeover — новый инстанс атомарно получает блокировку, старый token заблокирован', async () => {
    const key = `ik-live-takeover-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    createdIdempotencyKeys.push(key);

    const payload = { test: 'lease-takeover', timestamp: Date.now() };
    const hash = computeCanonicalPayloadHash(payload);
    const staleToken = 'stale-token-instance-old';

    // Seed a stale key locked 45 seconds ago
    await prisma.idempotencyKey.create({
      data: {
        key,
        userId: clientUser.id,
        action: 'CREATE_CLIENT_ORDER',
        requestHash: hash,
        lockToken: staleToken,
        recoveryAttempts: 0,
        lockedAt: new Date(Date.now() - 45000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Execute via IdempotencyService: should take over the stale lease
    const takeoverRes = await IdempotencyService.runWithIdempotency(
      {
        key,
        userId: clientUser.id,
        action: 'CREATE_CLIENT_ORDER',
        payload,
      },
      async (tx) => {
        const ord = await tx.order.create({
          data: {
            orderNumber: `AB-TAKEOVER-${Date.now()}`,
            clientId: clientProfileId,
            warehouseId,
            marketplace: 'WILDBERRIES',
            status: OrderStatus.CREATED,
            totalBoxesCount: 1,
            totalPalletsCount: 0,
            clientComment: 'Lease takeover test (Scenario C)',
          },
        });
        createdOrderIds.push(ord.id);
        createdOrderNumbers.push(ord.orderNumber);
        return { orderId: ord.id, orderNumber: ord.orderNumber };
      }
    );

    expect(takeoverRes.fromCache).toBe(false);

    const keyInDb = await prisma.idempotencyKey.findUnique({ where: { key } });
    expect(keyInDb?.recoveryAttempts).toBe(1);
    expect(keyInDb?.lockToken).not.toBe(staleToken);
    expect(keyInDb?.responseStatus).toBe(200);

    // Verify that the old token CANNOT delete or modify the key
    const oldDelete = await prisma.idempotencyKey.deleteMany({
      where: {
        key,
        lockToken: staleToken,
      },
    });
    expect(oldDelete.count).toBe(0); // 0 deleted! Old token is powerless
  });

  // ==========================================================================
  // SCENARIO D: Partial Unique Index on order_assignments
  // ==========================================================================
  it('Scenario D: Частичный уникальный индекс — PostgreSQL отклоняет дублирующее активное назначение', async () => {
    // 1. Create a dedicated test order
    const orderD = await prisma.order.create({
      data: {
        orderNumber: `AB-INDEX-${Date.now()}`,
        clientId: clientProfileId,
        warehouseId,
        marketplace: 'WILDBERRIES',
        status: OrderStatus.CONFIRMED,
        totalBoxesCount: 1,
        totalPalletsCount: 0,
        clientComment: 'Index verification test (Scenario D)',
      },
    });
    createdOrderIds.push(orderD.id);
    createdOrderNumbers.push(orderD.orderNumber);

    // 2. Insert first active assignment (ASSIGNED)
    const asgn1 = await prisma.orderAssignment.create({
      data: {
        orderId: orderD.id,
        driverId: driverProfileId,
        status: AssignmentStatus.ASSIGNED,
        notes: 'First active assignment',
      },
    });
    createdAssignmentIds.push(asgn1.id);

    // 3. Attempt to insert second active assignment directly into PostgreSQL via raw SQL
    let pgConstraintError = false;
    const dupAsgnId = `asgn-dup-${Date.now()}`;
    createdAssignmentIds.push(dupAsgnId);

    try {
      await prisma.$queryRawUnsafe(`
        INSERT INTO "order_assignments" ("id", "orderId", "driverId", "status", "assignedAt", "createdAt", "updatedAt")
        VALUES (
          '${dupAsgnId}',
          '${orderD.id}',
          '${driverProfileId}',
          'ASSIGNED',
          NOW(),
          NOW(),
          NOW()
        );
      `);
    } catch (err: any) {
      if (
        err.message.includes('unique_order_active_assignment') ||
        err.message.includes('unique constraint') ||
        err.code === 'P2010'
      ) {
        pgConstraintError = true;
      }
    }

    expect(pgConstraintError).toBe(true);

    // Verify only 1 assignment exists on this order in PostgreSQL
    const assignmentsCount = await prisma.orderAssignment.count({
      where: { orderId: orderD.id },
    });
    expect(assignmentsCount).toBe(1);
  });
});
