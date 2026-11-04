import crypto from 'crypto';

export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface ValidatedTelegramInitData {
  isValid: boolean;
  user?: TelegramUserData;
  authDate?: Date;
  rawParams: Record<string, string>;
  error?: string;
}

/**
 * Validates Telegram Mini App `initData` using HMAC-SHA256
 * Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Algorithm:
 * 1. Parse query string into key-value pairs.
 * 2. Extract `hash` and remove it from pairs.
 * 3. Sort pairs alphabetically: key=value\nkey2=value2...
 * 4. secret_key = HMAC_SHA256("WebAppData", bot_token)
 * 5. calculated_hash = HMAC_SHA256(secret_key, data_check_string).hex()
 * 6. Compare calculated_hash with hash.
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400 // 24 hours
): ValidatedTelegramInitData {
  if (!initData || !botToken) {
    return { isValid: false, rawParams: {}, error: 'Missing initData or botToken' };
  }

  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');

  if (!hash) {
    return { isValid: false, rawParams: {}, error: 'Missing hash parameter' };
  }

  // Remove hash and prepare key-value pairs
  urlParams.delete('hash');

  const pairs: string[] = [];
  const rawParams: Record<string, string> = {};

  urlParams.forEach((value, key) => {
    rawParams[key] = value;
    pairs.push(`${key}=${value}`);
  });

  pairs.sort();
  const dataCheckString = pairs.join('\n');

  // Step 1: secret_key = HMAC_SHA256("WebAppData", bot_token)
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  // Step 2: calculated_hash = HMAC_SHA256(secret_key, dataCheckString).hex()
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Timing safe equality comparison
  const hashBuffer = Buffer.from(hash, 'utf-8');
  const calcBuffer = Buffer.from(calculatedHash, 'utf-8');

  if (hashBuffer.length !== calcBuffer.length || !crypto.timingSafeEqual(hashBuffer, calcBuffer)) {
    return { isValid: false, rawParams, error: 'Cryptographic signature mismatch' };
  }

  // Check auth_date expiration
  const authDateTimestamp = parseInt(rawParams.auth_date || '0', 10);
  if (!authDateTimestamp) {
    return { isValid: false, rawParams, error: 'Missing auth_date' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDateTimestamp > maxAgeSeconds) {
    return { isValid: false, rawParams, error: 'initData has expired' };
  }

  let user: TelegramUserData | undefined;
  if (rawParams.user) {
    try {
      user = JSON.parse(rawParams.user) as TelegramUserData;
    } catch {
      return { isValid: false, rawParams, error: 'Failed to parse user JSON payload' };
    }
  }

  return {
    isValid: true,
    user,
    authDate: new Date(authDateTimestamp * 1000),
    rawParams,
  };
}
