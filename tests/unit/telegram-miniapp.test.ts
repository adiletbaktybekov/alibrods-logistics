import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { validateTelegramInitData } from '@/lib/security/telegram';
import { verifyMiniAppDataAction } from '@/app/actions/miniapp-auth';
import { assertOrderAccess } from '@/server/guards';
import { createClientOrderSchema } from '@/modules/orders/orders.dto';
import {
  WarehousesService,
  CONFIRMED_WAREHOUSES,
  isWarehouseOpenOnDate,
} from '@/modules/warehouses/warehouses.service';
import { AuthenticatedUser } from '@/types/rbac';

// Helper to generate a valid Telegram initData query string for testing
function generateValidInitData(
  botToken: string,
  user: { id: number; first_name: string; username?: string },
  authDate: number = Math.floor(Date.now() / 1000)
): string {
  const params: Record<string, string> = {
    auth_date: authDate.toString(),
    query_id: 'AAHdF6IQAAAAAN0XohD12345',
    user: JSON.stringify(user),
  };

  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    urlParams.set(key, value);
  }
  urlParams.set('hash', hash);

  return urlParams.toString();
}

describe('Telegram Mini App for Clients', () => {
  const TEST_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';

  describe('1. Telegram initData Cryptographic Validation', () => {
    it('should validate correctly signed initData', () => {
      const initData = generateValidInitData(TEST_BOT_TOKEN, {
        id: 99887766,
        first_name: 'Adilet',
        username: 'adilet_seller',
      });

      const result = validateTelegramInitData(initData, TEST_BOT_TOKEN);
      expect(result.isValid).toBe(true);
      expect(result.user?.id).toBe(99887766);
      expect(result.user?.username).toBe('adilet_seller');
    });

    it('should reject initData if signature is tampered', () => {
      const initData = generateValidInitData(TEST_BOT_TOKEN, {
        id: 99887766,
        first_name: 'Adilet',
      });

      // Tamper user ID in payload
      const tampered = initData.replace('99887766', '11111111');
      const result = validateTelegramInitData(tampered, TEST_BOT_TOKEN);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('mismatch');
    });

    it('should reject initData signed by a different bot token', () => {
      const initData = generateValidInitData(TEST_BOT_TOKEN, { id: 99887766, first_name: 'Adilet' });
      const result = validateTelegramInitData(initData, 'wrong:token');
      expect(result.isValid).toBe(false);
    });

    it('should reject expired initData older than 24 hours', () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 25 * 3600; // 25 hours ago
      const expiredInitData = generateValidInitData(
        TEST_BOT_TOKEN,
        { id: 99887766, first_name: 'Adilet' },
        expiredTimestamp
      );

      const result = validateTelegramInitData(expiredInitData, TEST_BOT_TOKEN);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  describe('2. Client Account Linking & IDOR Protection', () => {
    it('verifyMiniAppDataAction should reject completely invalid initData', async () => {
      const res = await verifyMiniAppDataAction('invalid_init_data_string');
      // When not in session and invalid initData
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('should strictly enforce that Client A cannot access Client B orders (IDOR protection)', () => {
      const clientA: AuthenticatedUser = {
        id: 'client-user-aaa',
        role: 'CLIENT',
      };

      const clientBOrder = {
        clientId: 'client-user-bbb',
        assignments: [],
      };

      expect(() => assertOrderAccess(clientA, clientBOrder)).toThrow(
        'only view and manage their own'
      );
    });
  });

  describe('3. Mini App Order Creation & Schedule Validation', () => {
    it('validates mandatory fields: deliveryDate, warehouseId, totalBoxesCount >= 1', () => {
      const valid = createClientOrderSchema.safeParse({
        warehouseId: 'c0000001-0000-0000-0000-000000000001',
        deliveryDate: '2026-06-15',
        totalBoxesCount: 5,
        totalPalletsCount: 0,
      });
      expect(valid.success).toBe(true);

      const invalidBoxes = createClientOrderSchema.safeParse({
        warehouseId: 'c0000001-0000-0000-0000-000000000001',
        deliveryDate: '2026-06-15',
        totalBoxesCount: 0, // must be >= 1
      });
      expect(invalidBoxes.success).toBe(false);
    });

    it('should respect 12 confirmed warehouses schedule in Mini App', () => {
      // 2026-06-14 is Sunday (0)
      const sundayDate = '2026-06-14';

      // 2026-06-15 is Monday (1)
      const mondayDate = '2026-06-15';

      // 2026-06-16 is Tuesday (2)
      const tuesdayDate = '2026-06-16';

      const radumlya = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Радумля')!; // MWF
      const chashnikovo = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Чашниково')!; // TTS
      const koledino = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Коледино')!; // DAILY

      // Sunday: only DAILY
      expect(isWarehouseOpenOnDate(koledino, sundayDate)).toBe(true);
      expect(isWarehouseOpenOnDate(radumlya, sundayDate)).toBe(false);
      expect(isWarehouseOpenOnDate(chashnikovo, sundayDate)).toBe(false);

      // Monday: DAILY + MWF
      expect(isWarehouseOpenOnDate(koledino, mondayDate)).toBe(true);
      expect(isWarehouseOpenOnDate(radumlya, mondayDate)).toBe(true);
      expect(isWarehouseOpenOnDate(chashnikovo, mondayDate)).toBe(false);

      // Tuesday: DAILY + TTS
      expect(isWarehouseOpenOnDate(koledino, tuesdayDate)).toBe(true);
      expect(isWarehouseOpenOnDate(radumlya, tuesdayDate)).toBe(false);
      expect(isWarehouseOpenOnDate(chashnikovo, tuesdayDate)).toBe(true);

      // Server assertion throws when warehouse is closed
      expect(() =>
        WarehousesService.assertWarehouseAvailable(radumlya, sundayDate)
      ).toThrow('не работает в воскресенье');
    });
  });
});
