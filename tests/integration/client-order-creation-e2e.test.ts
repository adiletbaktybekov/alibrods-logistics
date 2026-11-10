import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/database/prisma';
import { UserRole, OrderStatus } from '@prisma/client';
import { AuthService } from '@/modules/auth/auth.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { WarehousesService } from '@/modules/warehouses/warehouses.service';
import { createClientOrderSchema } from '@/modules/orders/orders.dto';
import { signAuthToken, verifyAuthToken } from '@/lib/security/jwt';
import { ForbiddenError } from '@/lib/errors';

describe('CRITICAL: Client Order Creation End-to-End on Neon Staging', () => {
  const timestamp = Date.now();
  const testPhone = `+996777${String(timestamp).slice(-6)}`;
  const testEmail = `e2e-seller-${timestamp}@alibros-staging.internal`;

  let createdUserId: string | null = null;
  let createdOrderId: string | null = null;

  afterAll(async () => {
    // Safe cleanup of test artifacts
    if (createdOrderId) {
      await prisma.orderAssignment.deleteMany({ where: { orderId: createdOrderId } }).catch(() => {});
      await prisma.orderPhoto.deleteMany({ where: { orderId: createdOrderId } }).catch(() => {});
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: createdOrderId } }).catch(() => {});
      await prisma.orderItem.deleteMany({ where: { orderId: createdOrderId } }).catch(() => {});
      await prisma.order.delete({ where: { id: createdOrderId } }).catch(() => {});
    }
    if (createdUserId) {
      await prisma.notification.deleteMany({ where: { userId: createdUserId } }).catch(() => {});
      await prisma.idempotencyKey.deleteMany({ where: { userId: createdUserId } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { userId: createdUserId } }).catch(() => {});
      await prisma.clientProfile.delete({ where: { userId: createdUserId } }).catch(() => {});
      await prisma.user.delete({ where: { id: createdUserId } }).catch(() => {});
    }
  });

  it('1. Confirms target database is dedicated Neon Staging', () => {
    const dbUrl = process.env.DATABASE_URL || '';
    expect(dbUrl).toContain('ep-restless-wave-b9k0ye9q');
  });

  it('2. Registers a dedicated test seller with simplified password policy', async () => {
    const reg = await AuthService.registerClient({
      companyName: `ОсОО «Тест Селлер Э2Э ${timestamp}»`,
      contactPerson: 'Адилет Тест',
      phone: testPhone,
      email: testEmail,
      password: 'password8', // >= 8 chars, simplified
      inn: '123456789012',
    });

    expect(reg.user).toBeDefined();
    expect(reg.user.id).toBeDefined();
    expect(reg.user.role).toBe(UserRole.CLIENT);
    createdUserId = reg.user.id;

    const profile = await prisma.clientProfile.findUnique({
      where: { userId: reg.user.id },
    });
    expect(profile).not.toBeNull();
    expect(profile?.companyName).toContain('Тест Селлер Э2Э');
  }, 30000);

  it('3. Generates and verifies client JWT session token', async () => {
    expect(createdUserId).not.toBeNull();
    const token = await signAuthToken({
      userId: createdUserId!,
      role: UserRole.CLIENT,
      phone: testPhone,
      email: testEmail,
      tokenVersion: 1,
    });

    expect(token).toBeDefined();
    const payload = await verifyAuthToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe(createdUserId);
    expect(payload?.role).toBe(UserRole.CLIENT);
  });

  it('4. Loads warehouses catalog and verifies confirmed warehouses in database', async () => {
    const warehouses = await WarehousesService.list();
    expect(warehouses.length).toBeGreaterThanOrEqual(12);

    const koledino = warehouses.find((w) => w.code === 'WB_KOLEDINO');
    expect(koledino).toBeDefined();
    expect(koledino?.id).toBe('c0000001-0000-0000-0000-000000000001');

    // Confirm DB record exists with exact deterministic UUID
    const dbWh = await prisma.warehouse.findUnique({
      where: { id: 'c0000001-0000-0000-0000-000000000001' },
    });
    expect(dbWh).not.toBeNull();
    expect(dbWh?.name).toBe('Коледино');
  }, 30000);

  it('5. Validates order parameters via createClientOrderSchema', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const payload = {
      warehouseId: 'c0000001-0000-0000-0000-000000000001',
      deliveryDate: tomorrow.toISOString().split('T')[0],
      totalBoxesCount: 3,
      totalPalletsCount: 1,
      clientComment: 'Тестовая отгрузка E2E',
      idempotencyKey: `ik-e2e-${timestamp}`,
    };

    const parsed = createClientOrderSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('6. Creates order in Neon Staging via OrdersService.createFromClient', async () => {
    expect(createdUserId).not.toBeNull();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const testUser = {
      id: createdUserId!,
      role: UserRole.CLIENT,
      phone: testPhone,
      email: testEmail,
    };

    const order = await OrdersService.createFromClient(testUser, {
      warehouseId: 'c0000001-0000-0000-0000-000000000001',
      deliveryDate: tomorrow,
      totalBoxesCount: 3,
      totalPalletsCount: 1,
      clientComment: 'Тестовая отгрузка E2E',
      idempotencyKey: `ik-e2e-${timestamp}`,
    });

    expect(order).toBeDefined();
    expect(order.id).toBeDefined();
    expect(order.orderNumber).toMatch(/^ABL-\d{4}-[A-Z0-9]+$/);
    expect(order.status).toBe(OrderStatus.CREATED);
    expect(order.totalBoxesCount).toBe(3);
    expect(order.totalPalletsCount).toBe(1);
    createdOrderId = order.id;

    // Direct Database Verification in Neon Staging
    const dbOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        warehouse: true,
        client: true,
        items: true,
        statusHistory: true,
      },
    });

    expect(dbOrder).not.toBeNull();
    expect(dbOrder?.orderNumber).toBe(order.orderNumber);
    expect(dbOrder?.warehouseId).toBe('c0000001-0000-0000-0000-000000000001');
    expect(dbOrder?.warehouse.name).toBe('Коледино');
    expect(dbOrder?.items).toHaveLength(3);
    expect(dbOrder?.statusHistory).toHaveLength(1);
    expect(dbOrder?.statusHistory[0].toStatus).toBe(OrderStatus.CREATED);
  }, 30000);

  it('7. Verifies created order appears in client order listing (/orders)', async () => {
    expect(createdUserId).not.toBeNull();
    expect(createdOrderId).not.toBeNull();

    const testUser = {
      id: createdUserId!,
      role: UserRole.CLIENT,
    };

    const listing = await OrdersService.list(testUser, { limit: 10 });
    expect(listing.items.length).toBeGreaterThanOrEqual(1);

    const found = listing.items.find((o) => o.id === createdOrderId);
    expect(found).toBeDefined();
    expect(found?.warehouse.name).toBe('Коледино');
  }, 30000);

  it('8. Verifies client dashboard statistics reflect the new order (/dashboard)', async () => {
    expect(createdUserId).not.toBeNull();

    const testUser = {
      id: createdUserId!,
      role: UserRole.CLIENT,
    };

    const stats = await OrdersService.getClientStats(testUser);
    expect(stats.total).toBeGreaterThanOrEqual(1);
    expect(stats.inProcessing).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('9. Verifies order details page retrieval with IDOR protection (/orders/[id])', async () => {
    expect(createdUserId).not.toBeNull();
    expect(createdOrderId).not.toBeNull();

    const testUser = {
      id: createdUserId!,
      role: UserRole.CLIENT,
    };

    // 1. Authorized seller can view their order
    const details = await OrdersService.getById(testUser, createdOrderId!);
    expect(details).toBeDefined();
    expect(details.id).toBe(createdOrderId);
    expect(details.warehouse.name).toBe('Коледино');
    expect(details.items).toHaveLength(3);

    // 2. IDOR Protection: Unauthorized seller with different userId is rejected with ForbiddenError
    const unauthorizedSeller = {
      id: '00000000-0000-0000-0000-000000000999',
      role: UserRole.CLIENT,
    };

    await expect(
      OrdersService.getById(unauthorizedSeller, createdOrderId!)
    ).rejects.toThrow(ForbiddenError);
  }, 30000);
});
