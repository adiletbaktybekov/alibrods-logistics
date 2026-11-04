import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { validateTelegramInitData } from '@/lib/security/telegram';

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
});
