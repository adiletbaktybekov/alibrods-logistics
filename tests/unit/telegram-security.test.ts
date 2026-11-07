import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'crypto';
import { validateTelegramInitData } from '@/lib/security/telegram';
import {
  getDriverTelegramBotClient,
  getClientTelegramBotClient,
  getManagerTelegramBotClient,
  resetTelegramBotClient,
} from '@/integrations/telegram/client';

describe('Telegram Security (HMAC-SHA256 initData)', () => {
  const botToken = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_test';

  function createValidInitData(params: Record<string, string>, token: string): string {
    const pairs: string[] = [];
    const searchParams = new URLSearchParams();

    for (const [key, val] of Object.entries(params)) {
      searchParams.set(key, val);
      pairs.push(`${key}=${val}`);
    }

    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    searchParams.set('hash', hash);
    return searchParams.toString();
  }

  it('should validate correctly signed initData', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const userPayload = JSON.stringify({
      id: 987654321,
      first_name: 'Adilet',
      username: 'adilet_test',
    });

    const initData = createValidInitData(
      {
        auth_date: nowSeconds.toString(),
        query_id: 'AAHdF6IQAAAAAN0XohC8xYz0',
        user: userPayload,
      },
      botToken
    );

    const result = validateTelegramInitData(initData, botToken);
    expect(result.isValid).toBe(true);
    expect(result.user?.id).toBe(987654321);
    expect(result.user?.username).toBe('adilet_test');
  });

  it('should reject tampered initData', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const initData = createValidInitData(
      {
        auth_date: nowSeconds.toString(),
        query_id: 'AAHdF6IQAAAAAN0XohC8xYz0',
        user: JSON.stringify({ id: 11111, first_name: 'Hacker' }),
      },
      botToken
    );

    // Tamper with data without recomputing hash
    const tampered = initData.replace('11111', '99999');

    const result = validateTelegramInitData(tampered, botToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('mismatch');
  });

  it('should reject expired initData', () => {
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 100000; // older than 24 hours
    const initData = createValidInitData(
      {
        auth_date: expiredTimestamp.toString(),
      },
      botToken
    );

    const result = validateTelegramInitData(initData, botToken, 86400);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('should reject initData missing hash', () => {
    const result = validateTelegramInitData('auth_date=123456&user={}', botToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Missing hash');
  });

  describe('Multi-Bot Architecture (Client, Driver, Manager)', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
      resetTelegramBotClient();
    });

    it('instantiates dedicated bots from their respective environment variables', async () => {
      process.env.TELEGRAM_DRIVER_BOT_TOKEN = '111:driver_token';
      process.env.TELEGRAM_CLIENT_BOT_TOKEN = '222:client_token';
      process.env.TELEGRAM_MANAGER_BOT_TOKEN = '333:manager_token';
      resetTelegramBotClient();

      const driverBot = getDriverTelegramBotClient();
      const clientBot = getClientTelegramBotClient();
      const managerBot = getManagerTelegramBotClient();

      expect(driverBot).toBeDefined();
      expect(clientBot).toBeDefined();
      expect(managerBot).toBeDefined();

      // Ensure distinct instances
      expect(driverBot).not.toBe(clientBot);
      expect(driverBot).not.toBe(managerBot);
      expect(clientBot).not.toBe(managerBot);
    });

    it('falls back to TELEGRAM_BOT_TOKEN when specific bot token is not defined', () => {
      delete process.env.TELEGRAM_DRIVER_BOT_TOKEN;
      delete process.env.TELEGRAM_CLIENT_BOT_TOKEN;
      delete process.env.TELEGRAM_MANAGER_BOT_TOKEN;
      process.env.TELEGRAM_BOT_TOKEN = '999:default_shared_token';
      resetTelegramBotClient();

      const driverBot = getDriverTelegramBotClient();
      const clientBot = getClientTelegramBotClient();

      expect(driverBot).toBeDefined();
      expect(clientBot).toBeDefined();
    });
  });
});
