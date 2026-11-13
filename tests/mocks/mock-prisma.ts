import { vi } from 'vitest';
import { UserRole, OrderStatus, AssignmentStatus } from '@prisma/client';

export function createMockPrisma() {
  const pairingCodes = new Map<string, any>();
  const drivers = new Map<string, any>();
  const telegramAccounts = new Map<string, any>();
  const orders = new Map<string, any>();
  const assignments = new Map<string, any>();
  const statusHistories: any[] = [];
  const idempotencyKeys = new Map<string, any>();
  const telegramProcessedUpdates = new Map<string, any>();
  const rateLimitEntries = new Map<string, any>();
  const driverPhotoSessions = new Map<string, any>();

  // Seed default driver records
  const defaultDriver = {
    id: 'driver-uuid-1',
    userId: '11111111-1111-4111-a111-111111111111',
    fullName: 'Водитель Иванов',
    user: { id: '11111111-1111-4111-a111-111111111111', role: UserRole.DRIVER, isActive: true },
  };
  drivers.set(defaultDriver.id, defaultDriver);
  drivers.set('driver-uuid-2', {
    id: 'driver-uuid-2',
    userId: '22222222-2222-4222-a222-222222222222',
    fullName: 'Водитель Петров',
    user: { id: '22222222-2222-4222-a222-222222222222', role: UserRole.DRIVER, isActive: true },
  });
  drivers.set('mock-driver-1', {
    id: 'mock-driver-1',
    userId: '33333333-3333-4333-a333-333333333333',
    fullName: 'Водитель Сидоров',
    user: { id: '33333333-3333-4333-a333-333333333333', role: UserRole.DRIVER, isActive: true },
  });
  drivers.set('mock-driver-single-use', {
    id: 'mock-driver-single-use',
    userId: '44444444-4444-4444-a444-444444444444',
    fullName: 'Водитель Single',
    user: { id: '44444444-4444-4444-a444-444444444444', role: UserRole.DRIVER, isActive: true },
  });

  const mockClient: any = {
    auditLog: {
      create: vi.fn(async ({ data }: any) => ({ id: `audit-${Date.now()}`, ...data })),
    },
    driverProfile: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (drivers.has(where.id)) return drivers.get(where.id);
        const randomId = '55555555-5555-4555-a555-555555555555';
        return {
          id: where.id,
          userId: randomId,
          fullName: 'Тестовый Водитель',
          user: { id: randomId, role: UserRole.DRIVER, isActive: true },
        };
      }),
    },
    clientProfile: {
      findUnique: vi.fn(async ({ where }: any) => {
        const userId = 'client-user-uuid-1';
        return {
          id: where.id,
          userId,
          companyName: 'ООО Тест Селлер',
          user: { id: userId, role: UserRole.CLIENT, isActive: true },
        };
      }),
    },
    managerProfile: {
      findUnique: vi.fn(async ({ where }: any) => {
        const userId = where?.userId || 'manager-user-uuid-1';
        return {
          id: where.id || `mgr-${userId}`,
          userId,
          fullName: 'Менеджер Анна',
          user: { id: userId, role: UserRole.MANAGER, isActive: true },
        };
      }),
      create: vi.fn(async ({ data }: any) => {
        return {
          id: `mgr-${data.userId}`,
          userId: data.userId,
          fullName: data.fullName,
          department: data.department,
        };
      }),
    },
    telegramPairingCode: {
      findUnique: vi.fn(async ({ where }: any) => {
        const item = pairingCodes.get(where.code);
        if (!item) return null;
        const driver = Array.from(drivers.values()).find((d) => d.userId === item.userId);
        const role = item.userId?.includes('client')
          ? UserRole.CLIENT
          : item.userId?.includes('manager')
          ? UserRole.MANAGER
          : UserRole.DRIVER;

        return {
          ...item,
          user: {
            id: item.userId,
            role,
            isActive: true,
            driverProfile: driver || {
              id: `profile-${item.userId}`,
              fullName: 'Водитель',
            },
            clientProfile: {
              id: `client-prof-${item.userId}`,
              companyName: 'ООО Тест Селлер',
            },
            managerProfile: {
              id: `mgr-prof-${item.userId}`,
              fullName: 'Менеджер Анна',
            },
          },
        };
      }),
      create: vi.fn(async ({ data }: any) => {
        const record = {
          id: `code-id-${Date.now()}-${Math.random()}`,
          code: data.code,
          userId: data.userId,
          expiresAt: data.expiresAt,
          usedAt: null,
          createdAt: new Date(),
        };
        pairingCodes.set(data.code, record);
        return record;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const [code, record] of pairingCodes.entries()) {
          let match = true;
          if (where.id && record.id !== where.id) match = false;
          if (where.code && record.code !== where.code) match = false;
          if (where.userId && record.userId !== where.userId) match = false;
          if (where.usedAt === null && record.usedAt !== null) match = false;
          if (where.expiresAt?.gt && !(record.expiresAt > where.expiresAt.gt)) match = false;

          if (match) {
            if (data.usedAt !== undefined) record.usedAt = data.usedAt;
            if (data.expiresAt !== undefined) record.expiresAt = data.expiresAt;
            count++;
          }
        }
        return { count };
      }),
      deleteMany: vi.fn(async () => {
        pairingCodes.clear();
        return { count: 0 };
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        for (const record of pairingCodes.values()) {
          let match = true;
          if (where?.userId && record.userId !== where.userId) match = false;
          if (where?.usedAt === null && record.usedAt !== null) match = false;
          if (where?.expiresAt?.gt && !(record.expiresAt > where.expiresAt.gt)) match = false;
          if (match) return record;
        }
        return null;
      }),
    },
    telegramAccount: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.telegramId !== undefined) {
          const tid = where.telegramId.toString();
          return telegramAccounts.get(tid) || null;
        }
        if (where.userId !== undefined) {
          return Array.from(telegramAccounts.values()).find((a) => a.userId === where.userId) || null;
        }
        return null;
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const tid = (create?.telegramId || update?.telegramId).toString();
        const existing = Array.from(telegramAccounts.values()).find((a) => a.userId === where.userId);
        const record = {
          id: existing?.id || `tg-${Date.now()}`,
          userId: where.userId,
          telegramId: BigInt(tid),
          username: create?.username || update?.username,
          firstName: create?.firstName || update?.firstName,
          lastName: create?.lastName || update?.lastName,
          languageCode: create?.languageCode || update?.languageCode,
          createdAt: existing?.createdAt || new Date(),
          authDate: existing?.authDate || new Date(),
        };
        telegramAccounts.set(tid, record);
        return record;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        let count = 0;
        for (const [tid, acc] of Array.from(telegramAccounts.entries())) {
          if (!where?.userId || acc.userId === where.userId) {
            telegramAccounts.delete(tid);
            count++;
          }
        }
        return { count };
      }),
    },
    $queryRaw: vi.fn(async (query: any, ...values: any[]) => {
      const queryStr = Array.isArray(query)
        ? query.join(' ')
        : typeof query === 'string'
        ? query
        : (query?.strings || []).join(' ');

      if (queryStr.includes('rate_limit_entries')) {
        return [{ points: 1, expiresAt: new Date(Date.now() + 60000) }];
      }

      if (queryStr.includes('idempotency_keys')) {
        // Match key from template values or query string
        const keyArg = values.find((v) => typeof v === 'string') || '';
        let record = idempotencyKeys.get(keyArg);
        if (!record) {
          for (const [k, rec] of idempotencyKeys.entries()) {
            if (queryStr.includes(k)) {
              record = rec;
              break;
            }
          }
        }
        if (record) {
          return [{ id: record.id, lockToken: record.lockToken, responseBody: record.responseBody }];
        }
        const first = Array.from(idempotencyKeys.values())[0];
        if (first) {
          return [{ id: first.id, lockToken: first.lockToken, responseBody: first.responseBody }];
        }
        return [{ id: 'mock-idemp', lockToken: 'mock-token', responseBody: null }];
      }

      return [{ id: 'order-locked', status: OrderStatus.CONFIRMED }];
    }),
    idempotencyKey: {
      findUnique: vi.fn(async ({ where }: any) => {
        return idempotencyKeys.get(where.key) || null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const record = {
          id: `idemp-${Date.now()}`,
          key: data.key,
          userId: data.userId,
          action: data.action,
          requestHash: data.requestHash,
          lockToken: data.lockToken || null,
          recoveryAttempts: data.recoveryAttempts || 0,
          responseStatus: data.responseStatus || null,
          responseBody: data.responseBody || null,
          lockedAt: data.lockedAt || new Date(),
          expiresAt: data.expiresAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        idempotencyKeys.set(data.key, record);
        return record;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const item = idempotencyKeys.get(where.key);
        if (item) {
          Object.assign(item, data);
          return item;
        }
        return { key: where.key, ...data };
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        const record = idempotencyKeys.get(where.key);
        if (record) {
          let match = true;
          if (where.lockToken !== undefined && record.lockToken !== where.lockToken) match = false;
          if (where.lockedAt !== undefined && record.lockedAt?.getTime() !== where.lockedAt?.getTime()) match = false;
          if (where.responseBody !== undefined && record.responseBody !== null) match = false;
          if (match) {
            if (data.recoveryAttempts?.increment) {
              record.recoveryAttempts = (record.recoveryAttempts || 0) + data.recoveryAttempts.increment;
            } else if (data.recoveryAttempts !== undefined) {
              record.recoveryAttempts = data.recoveryAttempts;
            }
            if (data.lockToken !== undefined) record.lockToken = data.lockToken;
            if (data.lockedAt !== undefined) record.lockedAt = data.lockedAt;
            if (data.updatedAt !== undefined) record.updatedAt = data.updatedAt;
            count = 1;
          }
        }
        return { count };
      }),
      delete: vi.fn(async ({ where }: any) => {
        idempotencyKeys.delete(where.key);
        return { key: where.key };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        let count = 0;
        if (!where || Object.keys(where).length === 0) {
          count = idempotencyKeys.size;
          idempotencyKeys.clear();
          return { count };
        }
        const record = idempotencyKeys.get(where.key);
        if (record) {
          let match = true;
          if (where.lockToken !== undefined && record.lockToken !== where.lockToken) match = false;
          if (where.responseBody !== undefined && record.responseBody !== null) match = false;
          if (where.expiresAt?.lte && record.expiresAt > where.expiresAt.lte) match = false;
          if (match) {
            idempotencyKeys.delete(where.key);
            count = 1;
          }
        }
        return { count };
      }),
    },
    telegramProcessedUpdate: {
      findUnique: vi.fn(async ({ where }: any) => {
        const compositeKey = where.botType_updateId
          ? `${where.botType_updateId.botType}:${where.botType_updateId.updateId.toString()}`
          : null;
        return compositeKey ? telegramProcessedUpdates.get(compositeKey) || null : null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const compositeKey = `${data.botType}:${data.updateId.toString()}`;
        if (telegramProcessedUpdates.has(compositeKey)) {
          const p2002: any = new Error('Unique constraint failed on the fields: (`botType`,`updateId`)');
          p2002.code = 'P2002';
          p2002.name = 'PrismaClientKnownRequestError';
          throw p2002;
        }
        const record = {
          id: `tgup-${Date.now()}-${Math.random()}`,
          botType: data.botType,
          updateId: BigInt(data.updateId.toString()),
          status: data.status,
          attempts: data.attempts || 1,
          error: data.error || null,
          processedAt: data.processedAt || null,
          expiresAt: data.expiresAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        telegramProcessedUpdates.set(compositeKey, record);
        return record;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        for (const [k, v] of telegramProcessedUpdates.entries()) {
          if (v.id === where.id) {
            Object.assign(v, data);
            return v;
          }
        }
        return { ...where, ...data };
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const [k, v] of telegramProcessedUpdates.entries()) {
          let match = true;
          if (where.id && v.id !== where.id) match = false;
          if (where.botType && v.botType !== where.botType) match = false;
          if (where.updateId && v.updateId !== BigInt(where.updateId.toString())) match = false;
          if (where.updatedAt && v.updatedAt?.getTime() !== where.updatedAt?.getTime()) match = false;
          if (match) {
            Object.assign(v, data);
            count++;
          }
        }
        return { count };
      }),
    },
    rateLimitEntry: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    order: {
      findUnique: vi.fn(async ({ where }: any) => {
        return orders.get(where.id) || null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const order = orders.get(where.id);
        if (order) {
          Object.assign(order, data);
          return order;
        }
        return { id: where.id, ...data };
      }),
    },
    orderAssignment: {
      create: vi.fn(async ({ data }: any) => {
        const assignment = {
          id: `asgn-${Date.now()}-${Math.random()}`,
          orderId: data.orderId,
          driverId: data.driverId,
          notes: data.notes,
          status: data.status || AssignmentStatus.ASSIGNED,
          assignedAt: new Date(),
        };
        assignments.set(assignment.id, assignment);
        const order = orders.get(data.orderId);
        if (order) {
          order.assignments = order.assignments || [];
          order.assignments.push(assignment);
        }
        return assignment;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const asgn = assignments.get(where.id);
        if (asgn) {
          Object.assign(asgn, data);
          return asgn;
        }
        return { id: where.id, ...data };
      }),
    },
    orderStatusHistory: {
      create: vi.fn(async ({ data }: any) => {
        const history = {
          id: `hist-${Date.now()}`,
          ...data,
          createdAt: new Date(),
        };
        statusHistories.push(history);
        return history;
      }),
    },
    driverPhotoSession: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = driverPhotoSessions.get(where.driverProfileId);
        const record = existing ? { ...existing, ...update } : { id: `session-${Date.now()}`, ...create };
        driverPhotoSessions.set(record.driverProfileId, record);
        return record;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        return driverPhotoSessions.get(where.driverProfileId) || null;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const item = driverPhotoSessions.get(where.driverProfileId);
        driverPhotoSessions.delete(where.driverProfileId);
        return item;
      }),
      deleteMany: vi.fn(async () => {
        const count = driverPhotoSessions.size;
        driverPhotoSessions.clear();
        return { count };
      }),
    },
    $transaction: vi.fn(async (callback: any) => {
      return await callback(mockClient);
    }),
  };

  return {
    mockClient,
    pairingCodes,
    drivers,
    telegramAccounts,
    orders,
    assignments,
    statusHistories,
    idempotencyKeys,
    telegramProcessedUpdates,
    rateLimitEntries,
    driverPhotoSessions,
  };
}

export const sharedMockPrisma = createMockPrisma();
