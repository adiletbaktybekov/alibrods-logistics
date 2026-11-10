/**
 * AliBros Logistics — Controlled PostgreSQL Concurrency & Idempotency Test
 *
 * Scope: Strictly Neon Staging (alibros_staging)
 * Safety: Isolation from Production, preservation of TC-E01, strict cleanup of created test entities.
 */

const { PrismaClient, AssignmentStatus, OrderStatus } = require('@prisma/client');
const crypto = require('crypto');

// Enforce Safety Variables
process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'false';
process.env.GOOGLE_SHEETS_SYNC_ENABLED = 'false';

function assertDatabaseSafety(name, rawUrl) {
  if (!rawUrl) throw new Error(`[SAFETY GUARD] ${name} is not set.`);
  const u = new URL(rawUrl);
  const dbName = u.pathname.replace(/^\//, '');
  if (dbName !== 'alibros_staging') {
    throw new Error(`[SAFETY GUARD] Forbidden target database '${dbName}'! Only 'alibros_staging' allowed.`);
  }
  if (!u.hostname.includes('neon.tech')) {
    throw new Error(`[SAFETY GUARD] Target host '${u.hostname}' is not Neon Tech.`);
  }
}

async function main() {
  assertDatabaseSafety('DATABASE_URL', process.env.DATABASE_URL);
  assertDatabaseSafety('DIRECT_URL', process.env.DIRECT_URL);

  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  const createdOrderIds = [];
  const createdOrderNumbers = [];
  const createdIdempotencyKeys = [];
  const createdAssignmentIds = [];

  const results = {
    scenarioA: { status: 'NOT TESTED', details: {} },
    scenarioB: { status: 'NOT TESTED', details: {} },
    scenarioC: { status: 'NOT TESTED', details: {} },
    scenarioD: { status: 'NOT TESTED', details: {} },
  };

  try {
    console.log('=== Starting Controlled PostgreSQL Concurrency Test on Neon Staging ===\n');

    // 0. Verify Database Identity & TC-E01 baseline
    const dbInfo = await prisma.$queryRawUnsafe('SELECT current_database(), current_user');
    console.log(`[TARGET CONFIRMED] Database: ${dbInfo[0].current_database}, User: ${dbInfo[0].current_user}`);

    const tcE01Baseline = await prisma.order.findUnique({
      where: { orderNumber: 'AB-20261109-3783' },
    });
    if (!tcE01Baseline) {
      throw new Error("TC-E01 order 'AB-20261109-3783' must exist as baseline!");
    }
    console.log(`[BASELINE CONFIRMED] TC-E01 Order: ${tcE01Baseline.orderNumber} (Status: ${tcE01Baseline.status})\n`);

    // Fetch test client and warehouse for test operations
    const clientUser = await prisma.user.findUnique({
      where: { email: 'client.test@alibros.local' },
      include: { clientProfile: true },
    });
    if (!clientUser || !clientUser.clientProfile) {
      throw new Error("Required test client 'client.test@alibros.local' not found!");
    }

    const warehouse = await prisma.warehouse.findFirst({
      where: { code: 'WB_KOLEDINO' },
    });
    if (!warehouse) {
      throw new Error("Required warehouse 'WB_KOLEDINO' not found!");
    }

    const driver = await prisma.driverProfile.findFirst({
      include: { user: true },
    });
    if (!driver) {
      throw new Error('Required driver profile not found!');
    }

    const authenticatedClient = {
      id: clientUser.id,
      role: clientUser.role,
      email: clientUser.email,
    };

    // Load compiled IdempotencyService and OrdersService
    const { IdempotencyService, computeCanonicalPayloadHash } = require('../lib/security/idempotency.service');
    const { OrdersService } = require('../modules/orders/orders.service');

    // ========================================================================
    // SCENARIO A: 5 Concurrent Requests with Identical Idempotency-Key
    // ========================================================================
    console.log('--- SCENARIO A: 5 Concurrent Requests with Identical Idempotency-Key ---');
    const keyA = `ik-live-race-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    createdIdempotencyKeys.push(keyA);

    const payloadA = {
      warehouseId: warehouse.id,
      deliveryDate: new Date('2026-11-20T10:00:00Z'),
      totalBoxesCount: 3,
      totalPalletsCount: 1,
      clientComment: 'Controlled Race Test (Scenario A)',
      idempotencyKey: keyA,
    };

    console.log(`Dispatching 5 parallel promises with key: ${keyA}...`);
    const promisesA = Array.from({ length: 5 }, (_, idx) =>
      OrdersService.createFromClient(authenticatedClient, payloadA).then(
        (res) => ({ status: 'fulfilled', idx, orderId: res.id, orderNumber: res.orderNumber }),
        (err) => ({ status: 'rejected', idx, error: err.message, code: err.statusCode || err.code || 'ERR' })
      )
    );

    const outcomesA = await Promise.all(promisesA);
    const fulfilledA = outcomesA.filter((o) => o.status === 'fulfilled');
    const rejectedA = outcomesA.filter((o) => o.status === 'rejected');

    console.log(`  - Fulfilled requests: ${fulfilledA.length}`);
    console.log(`  - Rejected requests: ${rejectedA.length}`);
    outcomesA.forEach((o) => {
      if (o.status === 'fulfilled') {
        console.log(`    [#${o.idx + 1}] FULFILLED: Order ${o.orderNumber} (ID: ${o.orderId})`);
        if (!createdOrderIds.includes(o.orderId)) {
          createdOrderIds.push(o.orderId);
          createdOrderNumbers.push(o.orderNumber);
        }
      } else {
        console.log(`    [#${o.idx + 1}] REJECTED: ${o.error}`);
      }
    });

    // PostgreSQL Verification for Scenario A
    const idempRowA = await prisma.idempotencyKey.findUnique({ where: { key: keyA } });
    const ordersA = await prisma.order.findMany({
      where: {
        clientId: clientUser.clientProfile.id,
        clientComment: 'Controlled Race Test (Scenario A)',
      },
    });

    console.log(`  - PostgreSQL Orders created with Scenario A comment: ${ordersA.length}`);
    console.log(`  - PostgreSQL IdempotencyKey status: ${idempRowA ? idempRowA.responseStatus : 'NOT FOUND'}`);

    if (ordersA.length === 1 && idempRowA && idempRowA.responseStatus === 200 && fulfilledA.length >= 1) {
      results.scenarioA = {
        status: 'PASS',
        details: {
          ordersCreated: ordersA.length,
          orderNumber: ordersA[0].orderNumber,
          fulfilledCount: fulfilledA.length,
          rejectedCount: rejectedA.length,
          idempotencyStatus: idempRowA.responseStatus,
        },
      };
      console.log('  [PASS] Scenario A: Exactly 1 order created, 0 duplicates, idempotency key recorded.\n');
    } else {
      results.scenarioA = {
        status: 'FAIL',
        details: { ordersCreated: ordersA.length, outcomes: outcomesA },
      };
      throw new Error(`Scenario A Failed: Expected 1 order, found ${ordersA.length}`);
    }

    // ========================================================================
    // SCENARIO B: Real PostgreSQL Transaction Rollback
    // ========================================================================
    console.log('--- SCENARIO B: Real PostgreSQL Interactive Transaction Rollback ---');
    const keyB = `ik-live-rollback-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    createdIdempotencyKeys.push(keyB);

    const payloadB = {
      warehouseId: warehouse.id,
      deliveryDate: new Date('2026-11-20T10:00:00Z'),
      totalBoxesCount: 2,
      totalPalletsCount: 0,
      clientComment: 'Controlled Rollback Test (Scenario B)',
      idempotencyKey: keyB,
    };

    let simulatedOrderNumberB = `AB-ROLL-${Date.now()}`;
    let threwRollback = false;

    try {
      await IdempotencyService.runWithIdempotency(
        {
          key: keyB,
          userId: clientUser.id,
          action: 'CREATE_CLIENT_ORDER',
          payload: { ...payloadB, keyB },
        },
        async (tx) => {
          // Create order inside tx
          const ord = await tx.order.create({
            data: {
              orderNumber: simulatedOrderNumberB,
              clientId: clientUser.clientProfile.id,
              warehouseId: warehouse.id,
              marketplace: warehouse.marketplace,
              status: OrderStatus.CREATED,
              totalBoxesCount: 2,
              totalPalletsCount: 0,
              clientComment: 'Simulated failure order before commit',
            },
          });
          createdOrderIds.push(ord.id);
          // Simulate crash/error inside transaction before commit
          throw new Error('Simulated crash / error inside transaction before COMMIT');
        }
      );
    } catch (err) {
      if (err.message.includes('Simulated crash')) {
        threwRollback = true;
      } else {
        throw err;
      }
    }

    // Verify order was rolled back in PostgreSQL
    const orderCheckB1 = await prisma.order.findUnique({ where: { orderNumber: simulatedOrderNumberB } });
    const keyCheckB1 = await prisma.idempotencyKey.findUnique({ where: { key: keyB } });

    console.log(`  - Exception caught during transaction: ${threwRollback}`);
    console.log(`  - Order in PostgreSQL after rollback: ${orderCheckB1 ? 'FOUND (FAIL)' : 'NULL (ROLLED BACK - PASS)'}`);
    console.log(`  - IdempotencyKey in PostgreSQL after CAS cleanup: ${keyCheckB1 ? 'FOUND (FAIL)' : 'NULL (CLEANED UP - PASS)'}`);

    // Retry with the exact same key: must succeed and create exactly 1 order
    console.log('  Executing safe retry with the same key...');
    const retryResultB = await IdempotencyService.runWithIdempotency(
      {
        key: keyB,
        userId: clientUser.id,
        action: 'CREATE_CLIENT_ORDER',
        payload: { ...payloadB, keyB },
      },
      async (tx) => {
        const ord = await tx.order.create({
          data: {
            orderNumber: `AB-RETRY-OK-${Date.now()}`,
            clientId: clientUser.clientProfile.id,
            warehouseId: warehouse.id,
            marketplace: warehouse.marketplace,
            status: OrderStatus.CREATED,
            totalBoxesCount: 2,
            totalPalletsCount: 0,
            clientComment: 'Controlled Rollback Retry (Scenario B)',
          },
        });
        createdOrderIds.push(ord.id);
        createdOrderNumbers.push(ord.orderNumber);
        return { orderId: ord.id, orderNumber: ord.orderNumber };
      }
    );

    const orderCheckB2 = await prisma.order.findUnique({ where: { orderNumber: retryResultB.result.orderNumber } });
    const keyCheckB2 = await prisma.idempotencyKey.findUnique({ where: { key: keyB } });

    if (!orderCheckB1 && !keyCheckB1 && orderCheckB2 && keyCheckB2 && keyCheckB2.responseStatus === 200) {
      results.scenarioB = {
        status: 'PASS',
        details: {
          rollbackConfirmed: true,
          casCleanupConfirmed: true,
          retryCreatedOrder: retryResultB.result.orderNumber,
          idempotencyStatus: keyCheckB2.responseStatus,
        },
      };
      console.log('  [PASS] Scenario B: Transaction rollback verified, CAS cleaned up, retry created 1 order.\n');
    } else {
      results.scenarioB = { status: 'FAIL', details: { orderCheckB1, keyCheckB1, retryResultB } };
      throw new Error('Scenario B Failed!');
    }

    // ========================================================================
    // SCENARIO C: Lease Takeover & LockToken Protection
    // ========================================================================
    console.log('--- SCENARIO C: Lease Takeover & LockToken Protection ---');
    const keyC = `ik-live-takeover-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    createdIdempotencyKeys.push(keyC);

    const payloadC = {
      warehouseId: warehouse.id,
      deliveryDate: new Date('2026-11-20T10:00:00Z'),
      totalBoxesCount: 1,
      totalPalletsCount: 0,
      clientComment: 'Controlled Lease Takeover (Scenario C)',
    };
    const hashC = computeCanonicalPayloadHash(payloadC);

    // Seed a stale lock created 45 seconds ago
    const staleLockToken = 'stale-owner-token-1111';
    await prisma.idempotencyKey.create({
      data: {
        key: keyC,
        userId: clientUser.id,
        action: 'CREATE_CLIENT_ORDER',
        requestHash: hashC,
        lockToken: staleLockToken,
        recoveryAttempts: 0,
        responseStatus: null,
        responseBody: undefined,
        lockedAt: new Date(Date.now() - 45000), // 45 seconds ago
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    console.log(`  Seeded stale key ${keyC} with lockedAt 45s ago and lockToken: ${staleLockToken}`);

    // Now execute via IdempotencyService: it should detect stale lock and take it over
    const takeoverResultC = await IdempotencyService.runWithIdempotency(
      {
        key: keyC,
        userId: clientUser.id,
        action: 'CREATE_CLIENT_ORDER',
        payload: payloadC,
      },
      async (tx) => {
        const ord = await tx.order.create({
          data: {
            orderNumber: `AB-TAKEOVER-${Date.now()}`,
            clientId: clientUser.clientProfile.id,
            warehouseId: warehouse.id,
            marketplace: warehouse.marketplace,
            status: OrderStatus.CREATED,
            totalBoxesCount: 1,
            totalPalletsCount: 0,
            clientComment: 'Controlled Lease Takeover (Scenario C)',
          },
        });
        createdOrderIds.push(ord.id);
        createdOrderNumbers.push(ord.orderNumber);
        return { orderId: ord.id, orderNumber: ord.orderNumber };
      }
    );

    const keyCheckC = await prisma.idempotencyKey.findUnique({ where: { key: keyC } });

    console.log(`  - New lockToken in PostgreSQL: ${keyCheckC.lockToken}`);
    console.log(`  - Recovery attempts count: ${keyCheckC.recoveryAttempts}`);
    console.log(`  - responseStatus: ${keyCheckC.responseStatus}`);

    // Verify old lockToken cannot delete the key
    const oldDeleteAttempt = await prisma.idempotencyKey.deleteMany({
      where: {
        key: keyC,
        lockToken: staleLockToken, // Outdated token!
      },
    });
    console.log(`  - Rows deleted by outdated lockToken: ${oldDeleteAttempt.count} (Must be 0)`);

    if (
      keyCheckC.lockToken !== staleLockToken &&
      keyCheckC.recoveryAttempts === 1 &&
      keyCheckC.responseStatus === 200 &&
      oldDeleteAttempt.count === 0
    ) {
      results.scenarioC = {
        status: 'PASS',
        details: {
          staleToken: staleLockToken,
          newToken: keyCheckC.lockToken,
          recoveryAttempts: keyCheckC.recoveryAttempts,
          oldDeleteCount: oldDeleteAttempt.count,
        },
      };
      console.log('  [PASS] Scenario C: Lease taken over, recoveryAttempts incremented, old token locked out.\n');
    } else {
      results.scenarioC = { status: 'FAIL', details: { keyCheckC, oldDeleteAttempt } };
      throw new Error('Scenario C Failed!');
    }

    // ========================================================================
    // SCENARIO D: Partial Unique Index on order_assignments
    // ========================================================================
    console.log('--- SCENARIO D: Partial Unique Index (unique_order_active_assignment) ---');
    const orderD = await prisma.order.create({
      data: {
        orderNumber: `AB-INDEX-${Date.now()}`,
        clientId: clientUser.clientProfile.id,
        warehouseId: warehouse.id,
        marketplace: warehouse.marketplace,
        status: OrderStatus.CONFIRMED,
        totalBoxesCount: 1,
        totalPalletsCount: 0,
        clientComment: 'Controlled Index Test (Scenario D)',
      },
    });
    createdOrderIds.push(orderD.id);
    createdOrderNumbers.push(orderD.orderNumber);

    // 1. Insert first active assignment (ASSIGNED)
    const asgn1 = await prisma.orderAssignment.create({
      data: {
        orderId: orderD.id,
        driverId: driver.id,
        status: AssignmentStatus.ASSIGNED,
        notes: 'First active assignment',
      },
    });
    createdAssignmentIds.push(asgn1.id);
    console.log(`  Created 1st active assignment: ID ${asgn1.id} (Status: ASSIGNED)`);

    // 2. Attempt to insert 2nd active assignment directly via raw SQL
    console.log('  Attempting to insert duplicate active assignment via PostgreSQL...');
    let threwUniqueConstraint = false;
    let pgErrorCode = null;

    try {
      const secondAsgnId = `asgn-dup-${Date.now()}`;
      createdAssignmentIds.push(secondAsgnId);
      await prisma.$queryRawUnsafe(`
        INSERT INTO "order_assignments" ("id", "orderId", "driverId", "status", "assignedAt", "createdAt", "updatedAt")
        VALUES (
          '${secondAsgnId}',
          '${orderD.id}',
          '${driver.id}',
          'ASSIGNED',
          NOW(),
          NOW(),
          NOW()
        );
      `);
    } catch (err) {
      if (err.message.includes('unique_order_active_assignment') || err.message.includes('unique constraint') || err.code === 'P2010') {
        threwUniqueConstraint = true;
        pgErrorCode = err.code || '23505';
        console.log(`  [POSTGRESQL REJECTION CAUGHT]: ${err.meta?.message || err.message}`);
      } else {
        throw err;
      }
    }

    // Verify only 1 assignment exists in PostgreSQL
    const totalAssignmentsD = await prisma.orderAssignment.findMany({
      where: { orderId: orderD.id },
    });

    console.log(`  - Total assignments in PostgreSQL for this order: ${totalAssignmentsD.length}`);

    if (threwUniqueConstraint && totalAssignmentsD.length === 1) {
      results.scenarioD = {
        status: 'PASS',
        details: {
          indexName: 'unique_order_active_assignment',
          rejectedWithConstraint: true,
          totalActiveAssignments: totalAssignmentsD.length,
          pgErrorCode,
        },
      };
      console.log('  [PASS] Scenario D: Partial unique index strictly rejected duplicate active assignment.\n');
    } else {
      results.scenarioD = { status: 'FAIL', details: { threwUniqueConstraint, count: totalAssignmentsD.length } };
      throw new Error('Scenario D Failed!');
    }

  } catch (testError) {
    console.error('\n[FATAL TEST ERROR]:', testError);
  } finally {
    // ========================================================================
    // SAFE CLEANUP (Explicit IDs only)
    // ========================================================================
    console.log('--- EXECUTING SAFE CLEANUP OF TEST ENTITIES ---');
    console.log(`Entities to clean up:`);
    console.log(`  - Orders: ${createdOrderIds.length} (${createdOrderNumbers.join(', ')})`);
    console.log(`  - Idempotency Keys: ${createdIdempotencyKeys.length}`);
    console.log(`  - Assignments: ${createdAssignmentIds.length}`);

    // Safety guard: Ensure TC-E01 is NOT in cleanup list
    const containsTcE01 = createdOrderNumbers.some((n) => n === 'AB-20261109-3783') ||
      createdOrderIds.some((id) => id === 'f6d5f9d1-ce06-4fea-8730-351b804e5610');
    if (containsTcE01) {
      console.error('CRITICAL SAFETY ALERT: TC-E01 order found in cleanup list! Aborting cleanup to protect data!');
      process.exit(1);
    }

    let cleanedOrders = 0;
    let cleanedKeys = 0;
    let cleanedAssignments = 0;

    // 1. Delete assignments created by test
    if (createdAssignmentIds.length > 0) {
      const res = await prisma.orderAssignment.deleteMany({
        where: { id: { in: createdAssignmentIds } },
      });
      cleanedAssignments = res.count;
    }

    // 2. Delete order children and orders
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
      const res = await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
      cleanedOrders = res.count;
    }

    // 3. Delete idempotency keys created by test
    if (createdIdempotencyKeys.length > 0) {
      const res = await prisma.idempotencyKey.deleteMany({
        where: { key: { in: createdIdempotencyKeys } },
      });
      cleanedKeys = res.count;
    }

    console.log(`[CLEANUP COMPLETED]:`);
    console.log(`  - Cleaned Orders: ${cleanedOrders}`);
    console.log(`  - Cleaned Assignments: ${cleanedAssignments}`);
    console.log(`  - Cleaned Idempotency Keys: ${cleanedKeys}\n`);

    // 4. Verify TC-E01 Integrity after cleanup
    const tcE01Check = await prisma.order.findUnique({
      where: { orderNumber: 'AB-20261109-3783' },
      include: { assignments: true, photos: true, statusHistory: true },
    });

    if (tcE01Check && tcE01Check.status === 'DELIVERED_TO_WAREHOUSE') {
      console.log(`[POST-TEST VERIFICATION] TC-E01 Order 'AB-20261109-3783' is 100% INTACT:`);
      console.log(`  - Status: ${tcE01Check.status}`);
      console.log(`  - Assignments: ${tcE01Check.assignments.length}`);
      console.log(`  - Photos: ${tcE01Check.photos.length}`);
      console.log(`  - Status History: ${tcE01Check.statusHistory.length} events\n`);
    } else {
      console.error('CRITICAL: TC-E01 order verification failed post-test!');
    }

    await prisma.$disconnect();

    // Output final JSON results
    console.log('=== TEST_SUMMARY_JSON_START ===');
    console.log(JSON.stringify(results, null, 2));
    console.log('=== TEST_SUMMARY_JSON_END ===');
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
