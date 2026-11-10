import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { prisma } from '@/database/prisma';
import { OrderStatus, UserRole, PhotoType, AssignmentStatus, MarketplaceType } from '@prisma/client';
import {
  DriverPairingService,
  ClientPairingService,
  ManagerPairingService,
} from '@/modules/telegram/pairing.service';
import { TelegramBotService } from '@/modules/telegram/bot.service';
import { TelegramDeduplicationService } from '@/modules/telegram/deduplication.service';
import { DriverOrderService } from '@/modules/orders/driver-order.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { DriverPhotoService } from '@/modules/telegram/photo.service';
import { DatabaseRateLimiter } from '@/lib/security/rate-limit';
import { getFileStorageProvider } from '@/modules/storage/storage.service';

const require = createRequire(import.meta.url);
const { verifyTargetDatabase } = require('../../scripts/check-db-target.js');

const SUFFIX = Date.now().toString().slice(-6);
const TEST_ORDER_NUMBER = `AB-TG-E2E-${SUFFIX}`;
const TEST_CLIENT_TG_ID = 888000000n + BigInt(SUFFIX);
const TEST_DRIVER_TG_ID = 777000000n + BigInt(SUFFIX);
const TEST_MANAGER_TG_ID = 999000000n + BigInt(SUFFIX);

const TEST_UPDATE_ID_1 = 666000000n + BigInt(SUFFIX);
const TEST_UPDATE_ID_2 = 666000001n + BigInt(SUFFIX);

describe('AliBros Logistics: Complete Telegram Staging E2E Test Suite (Neon Staging)', { timeout: 25000 }, () => {
  let warehouseId: string;
  let testClientUserId: string;
  let testClientProfileId: string;
  let testDriverUserId: string;
  let testDriverProfileId: string;
  let testManagerUserId: string;
  let testManagerProfileId: string;
  let testOrderId: string;
  let uploadedPhotoKey: string | null = null;
  let hasFixtures = false;
  let skipReason = '';

  beforeAll(async () => {
    // 1. Centralized Safety check: Target database must be dedicated Neon Staging
    verifyTargetDatabase(process.env.DATABASE_URL, process.env.DIRECT_URL);

    // 2. Prevent real external notifications during testing
    process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'false';

    // 3. Check for required test fixtures (e.g. active warehouse for order assignment)
    const wh = await prisma.warehouse.findFirst({ where: { isActive: true } });
    if (!wh) {
      hasFixtures = false;
      skipReason = 'Live Telegram E2E test skipped: required test fixture (active warehouse) not present in dedicated Staging DB (neondb).';
      console.warn(`[E2E SKIP] ${skipReason}`);
      return;
    }

    hasFixtures = true;
    warehouseId = wh.id;

    // 5. Create test client user
    const clientUser = await prisma.user.create({
      data: {
        email: `test-client-${SUFFIX}@alibros.test`,
        phone: `+79991${SUFFIX}`,
        role: UserRole.CLIENT,
        isActive: true,
        clientProfile: {
          create: {
            companyName: `ООО Селлер E2E ${SUFFIX}`,
            contactPerson: 'Иван Селлеров',
            contactPhone: `+79991${SUFFIX}`,
          },
        },
      },
      include: { clientProfile: true },
    });
    testClientUserId = clientUser.id;
    testClientProfileId = clientUser.clientProfile!.id;

    // 6. Create test driver user
    const driverUser = await prisma.user.create({
      data: {
        email: `test-driver-${SUFFIX}@alibros.test`,
        phone: `+79992${SUFFIX}`,
        role: UserRole.DRIVER,
        isActive: true,
        driverProfile: {
          create: {
            fullName: `Водитель Тест ${SUFFIX}`,
            vehicleModel: 'ГАЗель Next',
            vehiclePlateNumber: `A${SUFFIX.slice(0, 3)}AA77`,
            isAvailable: true,
          },
        },
      },
      include: { driverProfile: true },
    });
    testDriverUserId = driverUser.id;
    testDriverProfileId = driverUser.driverProfile!.id;

    // 7. Create test manager user
    const managerUser = await prisma.user.create({
      data: {
        email: `test-manager-${SUFFIX}@alibros.test`,
        phone: `+79993${SUFFIX}`,
        role: UserRole.MANAGER,
        isActive: true,
        managerProfile: {
          create: {
            fullName: `Менеджер Тест ${SUFFIX}`,
            workPhone: `+79993${SUFFIX}`,
          },
        },
      },
      include: { managerProfile: true },
    });
    testManagerUserId = managerUser.id;
    testManagerProfileId = managerUser.managerProfile!.id;
  });

  beforeEach((ctx) => {
    if (!hasFixtures) {
      ctx.skip();
    }
  });

  afterAll(async () => {
    if (!hasFixtures) {
      return;
    }

    // Phase 10: Strict, idempotent cleanup
    try {
      if (uploadedPhotoKey) {
        const storage = getFileStorageProvider();
        if (storage.isConfigured()) {
          await storage.deleteFile(uploadedPhotoKey).catch(() => {});
        }
      }

      if (testOrderId) {
        await prisma.orderPhoto.deleteMany({ where: { orderId: testOrderId } }).catch(() => {});
        await prisma.orderStatusHistory.deleteMany({ where: { orderId: testOrderId } }).catch(() => {});
        await prisma.orderAssignment.deleteMany({ where: { orderId: testOrderId } }).catch(() => {});
        await prisma.orderItem.deleteMany({ where: { orderId: testOrderId } }).catch(() => {});
        await prisma.order.deleteMany({ where: { id: testOrderId } }).catch(() => {});
      }

      // Cleanup test pairing codes
      await prisma.telegramPairingCode.deleteMany({
        where: {
          userId: { in: [testClientUserId, testDriverUserId, testManagerUserId] },
        },
      }).catch(() => {});

      // Cleanup test telegram accounts
      await prisma.telegramAccount.deleteMany({
        where: {
          telegramId: { in: [TEST_CLIENT_TG_ID, TEST_DRIVER_TG_ID, TEST_MANAGER_TG_ID] },
        },
      }).catch(() => {});

      // Cleanup test processed updates
      await prisma.telegramProcessedUpdate.deleteMany({
        where: {
          updateId: { in: [TEST_UPDATE_ID_1, TEST_UPDATE_ID_2] },
        },
      }).catch(() => {});

      // Cleanup test rate limit entries
      await prisma.rateLimitEntry.deleteMany({
        where: {
          key: { in: [`tg:user:${TEST_DRIVER_TG_ID}`, `tg:user:${TEST_CLIENT_TG_ID}`] },
        },
      }).catch(() => {});

      // Delete profiles & users
      if (testClientProfileId) {
        await prisma.clientProfile.deleteMany({ where: { id: testClientProfileId } }).catch(() => {});
      }
      if (testDriverProfileId) {
        await prisma.driverProfile.deleteMany({ where: { id: testDriverProfileId } }).catch(() => {});
      }
      if (testManagerProfileId) {
        await prisma.managerProfile.deleteMany({ where: { id: testManagerProfileId } }).catch(() => {});
      }
      await prisma.user.deleteMany({
        where: { id: { in: [testClientUserId, testDriverUserId, testManagerUserId] } },
      }).catch(() => {});
    } catch (err) {
      console.error('Error during cleanup:', err);
    }
  });

  // ============================================================================
  // Step 1: Client Pairing via Pairing Code
  // ============================================================================
  it('Step 1: Client generates pairing code and links Telegram account', async () => {
    const { code, expiresAt, deepLink } = await ClientPairingService.generatePairingCode(
      testClientProfileId,
      testManagerUserId
    );

    expect(code).toMatch(/^ABL-[A-F0-9]{6}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(deepLink).toContain(code);

    // Verify and link Telegram
    const linkRes = await ClientPairingService.verifyAndLinkClient(
      TEST_CLIENT_TG_ID,
      code,
      { username: `seller_${SUFFIX}`, firstName: 'Иван' }
    );

    expect(linkRes.success).toBe(true);
    expect(linkRes.companyName).toBe(`ООО Селлер E2E ${SUFFIX}`);

    // Verify account in DB
    const account = await prisma.telegramAccount.findUnique({
      where: { telegramId: TEST_CLIENT_TG_ID },
    });
    expect(account).not.toBeNull();
    expect(account?.userId).toBe(testClientUserId);
  });

  // ============================================================================
  // Step 2: Driver Pairing via Pairing Code
  // ============================================================================
  it('Step 2: Driver generates pairing code and links Telegram account', async () => {
    const { code } = await DriverPairingService.generatePairingCode(
      testDriverProfileId,
      testManagerUserId
    );

    const linkRes = await DriverPairingService.verifyAndLinkDriver(
      TEST_DRIVER_TG_ID,
      code,
      { username: `driver_${SUFFIX}`, firstName: 'Водитель' }
    );

    expect(linkRes.success).toBe(true);
    expect(linkRes.driverProfileId).toBe(testDriverProfileId);

    const drv = await DriverPairingService.getDriverByTelegramId(TEST_DRIVER_TG_ID);
    expect(drv).not.toBeNull();
    expect(drv?.id).toBe(testDriverProfileId);
  });

  // ============================================================================
  // Step 3: Order Creation & Manager Assignment
  // ============================================================================
  it('Step 3: Create order in Staging and assign to driver', async () => {
    const newOrder = await prisma.order.create({
      data: {
        orderNumber: TEST_ORDER_NUMBER,
        clientId: testClientProfileId,
        warehouseId,
        marketplace: MarketplaceType.WILDBERRIES,
        status: OrderStatus.CONFIRMED,
        pickupAddress: 'г. Москва, ул. Складская, 12',
        pickupCity: 'Москва',
        totalBoxesCount: 10,
        totalPalletsCount: 1,
        scheduledPickupAt: new Date(),
        statusHistory: {
          create: {
            toStatus: OrderStatus.CONFIRMED,
            changedById: testManagerUserId,
            comment: 'Подтверждено в рамках E2E теста',
          },
        },
      },
    });

    testOrderId = newOrder.id;
    expect(testOrderId).toBeDefined();

    // Assign driver
    const assignRes = await OrdersService.assignDriver(
      { id: testManagerUserId, role: UserRole.MANAGER },
      testOrderId,
      { driverProfileId: testDriverProfileId, notes: 'Срочный забор груза' }
    );

    expect(assignRes.orderId).toBe(testOrderId);
    expect(assignRes.driverId).toBe(testDriverProfileId);

    // Verify order status became ASSIGNED_TO_DRIVER
    const updatedOrder = await prisma.order.findUnique({ where: { id: testOrderId } });
    expect(updatedOrder?.status).toBe(OrderStatus.ASSIGNED_TO_DRIVER);
  });

  // ============================================================================
  // Step 4: Driver Bot Processing & Webhook Deduplication
  // ============================================================================
  it('Step 4: Driver accepts order via Bot and verifies PostgreSQL deduplication claim', async () => {
    // 1. Claim update atomically in PostgreSQL
    const claim = await TelegramDeduplicationService.claimUpdate('driver', TEST_UPDATE_ID_1);
    expect(claim.canProcess).toBe(true);
    expect(claim.reason).toBe('CLAIMED');

    // 2. Driver Order Service accepts the order
    const acceptRes = await DriverOrderService.updateDriverOrderStatus(
      testDriverProfileId,
      testOrderId,
      OrderStatus.ACCEPTED_BY_DRIVER
    );
    expect(acceptRes.order.status).toBe(OrderStatus.ACCEPTED_BY_DRIVER);

    // 3. Mark update completed
    await TelegramDeduplicationService.markCompleted('driver', TEST_UPDATE_ID_1);

    // 4. Duplicate webhook delivery test: second attempt with same updateId must be rejected
    const duplicateClaim = await TelegramDeduplicationService.claimUpdate('driver', TEST_UPDATE_ID_1);
    expect(duplicateClaim.canProcess).toBe(false);
    expect(duplicateClaim.reason).toBe('ALREADY_PROCESSED');
  });

  // ============================================================================
  // Step 5: Full Delivery Progression (PICKED_UP -> IN_TRANSIT -> DELIVERED_TO_WAREHOUSE)
  // ============================================================================
  it('Step 5: Driver transitions order through PICKED_UP, IN_TRANSIT, DELIVERED_TO_WAREHOUSE', async () => {
    // 1. PICKED_UP
    const pickedRes = await DriverOrderService.updateDriverOrderStatus(
      testDriverProfileId,
      testOrderId,
      OrderStatus.PICKED_UP
    );
    expect(pickedRes.order.status).toBe(OrderStatus.PICKED_UP);

    // 2. IN_TRANSIT
    const transitRes = await DriverOrderService.updateDriverOrderStatus(
      testDriverProfileId,
      testOrderId,
      OrderStatus.IN_TRANSIT
    );
    expect(transitRes.order.status).toBe(OrderStatus.IN_TRANSIT);

    // 3. DELIVERED_TO_WAREHOUSE
    const deliveredRes = await DriverOrderService.updateDriverOrderStatus(
      testDriverProfileId,
      testOrderId,
      OrderStatus.DELIVERED_TO_WAREHOUSE
    );
    expect(deliveredRes.order.status).toBe(OrderStatus.DELIVERED_TO_WAREHOUSE);

    // Verify in DB
    const finalOrder = await prisma.order.findUnique({
      where: { id: testOrderId },
      include: { statusHistory: true },
    });
    expect(finalOrder?.status).toBe(OrderStatus.DELIVERED_TO_WAREHOUSE);
    expect(finalOrder?.statusHistory.length).toBeGreaterThanOrEqual(4);
  });

  // ============================================================================
  // Step 6: Photo Upload & Cloudflare R2 Association
  // ============================================================================
  it('Step 6: Driver uploads warehouse delivery photo and verifies database association', async () => {
    // Real JPEG header buffer
    const realJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

    const photoRes = await DriverPhotoService.processIncomingPhoto({
      driverProfileId: testDriverProfileId,
      orderId: testOrderId,
      photoType: PhotoType.WAREHOUSE_ACCEPTANCE,
      fileSizeBytes: realJpeg.length,
      mimeType: 'image/jpeg',
      fileUniqueId: `unique_e2e_${SUFFIX}`,
      caption: 'Акт сдачи на воротах 14',
      fileBuffer: realJpeg,
    });

    expect(photoRes.success).toBe(true);
    if (photoRes.fileKey) {
      uploadedPhotoKey = photoRes.fileKey;
    }

    // Verify OrderPhoto record in PostgreSQL
    const savedPhoto = await prisma.orderPhoto.findFirst({
      where: { orderId: testOrderId },
    });
    expect(savedPhoto).not.toBeNull();
    expect(savedPhoto?.type).toBe(PhotoType.WAREHOUSE_ACCEPTANCE);
    expect(savedPhoto?.caption).toBe('Акт сдачи на воротах 14');
  });

  // ============================================================================
  // Step 7: Client Queries Active Orders via Client Bot
  // ============================================================================
  it('Step 7: Client queries orders and verifies order visibility', async () => {
    const client = await ClientPairingService.getClientByTelegramId(TEST_CLIENT_TG_ID);
    expect(client).not.toBeNull();

    // Query active orders for this client
    const clientOrders = await prisma.order.findMany({
      where: {
        clientId: client!.id,
        status: {
          notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REJECTED_BY_MANAGER],
        },
      },
    });

    expect(clientOrders.some((o) => o.id === testOrderId)).toBe(true);
  });

  // ============================================================================
  // Step 8: Rate Limiter Database Persistence in Staging
  // ============================================================================
  it('Step 8: Distributed database rate limiter creates and consumes entries in rate_limit_entries', async () => {
    const key = `tg:user:${TEST_DRIVER_TG_ID}`;
    const firstConsume = await DatabaseRateLimiter.consume(key, 10, 60000);
    expect(firstConsume.allowed).toBe(true);
    expect(firstConsume.remaining).toBe(9);

    const secondConsume = await DatabaseRateLimiter.consume(key, 10, 60000);
    expect(secondConsume.allowed).toBe(true);
    expect(secondConsume.remaining).toBe(8);

    // Verify row in rate_limit_entries table
    const entry = await prisma.rateLimitEntry.findUnique({ where: { key } });
    expect(entry).not.toBeNull();
    expect(entry?.points).toBe(2);
  });
});
