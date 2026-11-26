import type { CountryCode } from 'libphonenumber-js';

export type { CountryCode };

export interface CountryInfo {
  code: CountryCode;
  name: string;
  callingCode: string;
  flag: string;
}

/**
 * Returns flag emoji for ISO-3166-1 alpha-2 country code.
 */
export function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

/**
 * Popular countries shown at the top of the country selector.
 */
export const POPULAR_COUNTRIES: CountryInfo[] = [
  { code: 'KG', name: 'Кыргызстан', callingCode: '+996', flag: '🇰🇬' },
  { code: 'RU', name: 'Россия', callingCode: '+7', flag: '🇷🇺' },
  { code: 'KZ', name: 'Казахстан', callingCode: '+7', flag: '🇰🇿' },
  { code: 'UZ', name: 'Узбекистан', callingCode: '+998', flag: '🇺🇿' },
  { code: 'BY', name: 'Беларусь', callingCode: '+375', flag: '🇧🇾' },
  { code: 'TR', name: 'Турция', callingCode: '+90', flag: '🇹🇷' },
  { code: 'CN', name: 'Китай', callingCode: '+86', flag: '🇨🇳' },
  { code: 'AE', name: 'ОАЭ', callingCode: '+971', flag: '🇦🇪' },
  { code: 'DE', name: 'Германия', callingCode: '+49', flag: '🇩🇪' },
  { code: 'US', name: 'США', callingCode: '+1', flag: '🇺🇸' },
  { code: 'TJ', name: 'Таджикистан', callingCode: '+992', flag: '🇹🇯' },
  { code: 'AM', name: 'Армения', callingCode: '+374', flag: '🇦🇲' },
  { code: 'AZ', name: 'Азербайджан', callingCode: '+994', flag: '🇦🇿' },
  { code: 'GE', name: 'Грузия', callingCode: '+995', flag: '🇬🇪' },
  { code: 'GB', name: 'Великобритания', callingCode: '+44', flag: '🇬🇧' },
  { code: 'PL', name: 'Польша', callingCode: '+48', flag: '🇵🇱' },
  { code: 'LT', name: 'Литва', callingCode: '+370', flag: '🇱🇹' },
  { code: 'LV', name: 'Латвия', callingCode: '+371', flag: '🇱🇻' },
  { code: 'EE', name: 'Эстония', callingCode: '+372', flag: '🇪🇪' },
  { code: 'UA', name: 'Украина', callingCode: '+380', flag: '🇺🇦' },
];

/**
 * Russian country names dictionary for all other countries.
 */
export const RUSSIAN_COUNTRY_NAMES: Partial<Record<CountryCode, string>> = {
  AT: 'Австрия',
  AU: 'Австралия',
  BE: 'Бельгия',
  BG: 'Болгария',
  BR: 'Бразилия',
  CA: 'Канада',
  CH: 'Швейцария',
  CY: 'Кипр',
  CZ: 'Чехия',
  DK: 'Дания',
  ES: 'Испания',
  FI: 'Финляндия',
  FR: 'Франция',
  GR: 'Греция',
  HR: 'Хорватия',
  HU: 'Венгрия',
  ID: 'Индонезия',
  IE: 'Ирландия',
  IL: 'Израиль',
  IN: 'Индия',
  IT: 'Италия',
  JP: 'Япония',
  KR: 'Южная Корея',
  MD: 'Молдова',
  MN: 'Монголия',
  MY: 'Малайзия',
  NL: 'Нидерланды',
  NO: 'Норвегия',
  NZ: 'Новая Зеландия',
  PT: 'Португалия',
  QA: 'Катар',
  RO: 'Румыния',
  RS: 'Сербия',
  SA: 'Саудовская Аравия',
  SE: 'Швеция',
  SG: 'Сингапур',
  SK: 'Словакия',
  TH: 'Таиланд',
  TM: 'Туркменистан',
  VN: 'Вьетнам',
};

const POPULAR_BY_CODE = new Map<CountryCode, CountryInfo>(
  POPULAR_COUNTRIES.map((c) => [c.code, c])
);

const POPULAR_BY_CALLING_CODE_DESC = [...POPULAR_COUNTRIES].sort(
  (a, b) => b.callingCode.length - a.callingCode.length
);

export function getPopularCallingCode(country: CountryCode): string {
  return POPULAR_BY_CODE.get(country)?.callingCode || '+996';
}

/**
 * Fast synchronous digit formatter used before libphonenumber-js is dynamically loaded.
 */
export function formatNationalDigitsLite(digits: string, country: CountryCode = 'KG'): string {
  const clean = digits.replace(/\D/g, '');
  if (!clean) return '';

  if (country === 'KG') {
    const p1 = clean.slice(0, 3);
    const p2 = clean.slice(3, 6);
    const p3 = clean.slice(6, 9);
    const rest = clean.slice(9);
    return [p1, p2, p3, rest].filter(Boolean).join(' ');
  }

  if (country === 'RU' || country === 'KZ') {
    const p1 = clean.slice(0, 3);
    const p2 = clean.slice(3, 6);
    const p3 = clean.slice(6, 8);
    const p4 = clean.slice(8, 10);
    const rest = clean.slice(10);
    let out = p1;
    if (p2) out += ` ${p2}`;
    if (p3) out += `-${p3}`;
    if (p4) out += `-${p4}`;
    if (rest) out += rest;
    return out;
  }

  if (country === 'UZ') {
    const p1 = clean.slice(0, 2);
    const p2 = clean.slice(2, 5);
    const p3 = clean.slice(5, 7);
    const p4 = clean.slice(7, 9);
    const rest = clean.slice(9);
    return [p1, p2, p3, p4, rest].filter(Boolean).join(' ');
  }

  return clean;
}

/**
 * Lightweight synchronous E.164 normalization fallback before libphonenumber-js resolves.
 */
export function normalizePhoneNumberLite(
  raw?: string | null,
  defaultCountry: CountryCode = 'KG'
): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const cleanDigits = trimmed.replace(/\D/g, '');
  if (!cleanDigits) return '';

  if (trimmed.startsWith('+')) {
    return `+${cleanDigits}`;
  }
  if (cleanDigits.startsWith('996') && cleanDigits.length === 12) {
    return `+${cleanDigits}`;
  }
  if (cleanDigits.length === 11 && (cleanDigits.startsWith('7') || cleanDigits.startsWith('8'))) {
    return `+7${cleanDigits.slice(1)}`;
  }

  const callingCode = getPopularCallingCode(defaultCountry).replace('+', '');
  if (defaultCountry === 'KG' && cleanDigits.length === 10 && cleanDigits.startsWith('0')) {
    return `+996${cleanDigits.slice(1)}`;
  }

  return `+${callingCode}${cleanDigits}`;
}

export interface ParsedInitialPhone {
  country: CountryCode;
  national: string;
}

/**
 * Lightweight synchronous initial phone parser (zero libphonenumber-js dependency).
 */
export function parseInitialPhoneLite(
  raw?: string | null,
  fallbackCountry: CountryCode = 'KG'
): ParsedInitialPhone {
  if (!raw || !raw.trim()) {
    return { country: fallbackCountry, national: '' };
  }
  const trimmed = raw.trim();
  const clean = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+')) {
    const plusClean = `+${clean}`;
    for (const item of POPULAR_BY_CALLING_CODE_DESC) {
      if (plusClean.startsWith(item.callingCode)) {
        // Disambiguate +7 between KZ (77x/70x/747/775-778) and RU
        if (item.callingCode === '+7') {
          const nat = plusClean.slice(2);
          const isKz = /^(70|747|77)/.test(nat);
          return {
            country: isKz ? 'KZ' : 'RU',
            national: nat,
          };
        }
        return {
          country: item.code,
          national: plusClean.slice(item.callingCode.length),
        };
      }
    }
  }

  if (clean.length === 11 && (clean.startsWith('7') || clean.startsWith('8'))) {
    return { country: 'RU', national: clean.slice(1) };
  }
  if (clean.startsWith('996') && clean.length === 12) {
    return { country: 'KG', national: clean.slice(3) };
  }

  return { country: fallbackCountry, national: clean };
}

export interface FullPhoneUtils {
  getAllCountries: () => CountryInfo[];
  getCountryCallingCodeSafe: (country: CountryCode) => string;
  formatNationalDigits: (digits: string, country?: CountryCode) => string;
  normalizePhoneNumber: (raw?: string | null, defaultCountry?: CountryCode) => string;
  parsePhone: (
    raw: string,
    defaultCountry?: CountryCode
  ) => {
    country?: CountryCode;
    nationalNumber: string;
    number: string;
    isValid: boolean;
    formatNational: () => string;
  } | null;
}

let fullUtilsPromise: Promise<FullPhoneUtils> | null = null;

/**
 * Dynamically imports libphonenumber-js on demand (cached singleton promise),
 * keeping the initial /login JS bundle free of ~160 KB of phone metadata and zod.
 */
export function loadFullPhoneUtils(): Promise<FullPhoneUtils> {
  if (!fullUtilsPromise) {
    fullUtilsPromise = import('libphonenumber-js')
      .then((mod) => {
        let cachedCountries: CountryInfo[] | null = null;

        const getAllCountries = (): CountryInfo[] => {
          if (cachedCountries) return cachedCountries;
          const popularCodes = new Set(POPULAR_COUNTRIES.map((c) => c.code));
          const remainingCodes = mod.getCountries().filter((c) => !popularCodes.has(c));

          const remaining: CountryInfo[] = remainingCodes.map((c) => {
            let callingCode = '';
            try {
              callingCode = `+${mod.getCountryCallingCode(c)}`;
            } catch {
              callingCode = '';
            }
            return {
              code: c,
              name: RUSSIAN_COUNTRY_NAMES[c] || c,
              callingCode,
              flag: getCountryFlag(c),
            };
          });

          remaining.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
          cachedCountries = [...POPULAR_COUNTRIES, ...remaining];
          return cachedCountries;
        };

        const getCountryCallingCodeSafe = (country: CountryCode): string => {
          try {
            return `+${mod.getCountryCallingCode(country)}`;
          } catch {
            return getPopularCallingCode(country);
          }
        };

        const formatNationalDigits = (digits: string, country: CountryCode = 'KG'): string => {
          if (!digits) return '';
          const ayt = new mod.AsYouType(country);
          return ayt.input(digits);
        };

        const parsePhone: FullPhoneUtils['parsePhone'] = (raw, defaultCountry) => {
          const parsed = defaultCountry
            ? mod.parsePhoneNumberFromString(raw, defaultCountry)
            : mod.parsePhoneNumberFromString(raw);
          if (!parsed) return null;
          return {
            country: parsed.country,
            nationalNumber: parsed.nationalNumber,
            number: parsed.number,
            isValid: parsed.isValid(),
            formatNational: () => parsed.formatNational(),
          };
        };

        const normalizePhoneNumber = (
          raw?: string | null,
          defaultCountry: CountryCode = 'KG'
        ): string => {
          if (!raw) return '';
          const trimmed = raw.trim();
          if (!trimmed) return '';
          const parsed = trimmed.startsWith('+')
            ? mod.parsePhoneNumberFromString(trimmed)
            : mod.parsePhoneNumberFromString(trimmed, defaultCountry);
          if (parsed && parsed.isValid()) {
            return parsed.number;
          }
          return normalizePhoneNumberLite(trimmed, defaultCountry);
        };

        return {
          getAllCountries,
          getCountryCallingCodeSafe,
          formatNationalDigits,
          normalizePhoneNumber,
          parsePhone,
        };
      })
      .catch((err) => {
        fullUtilsPromise = null;
        throw err;
      });
  }
  return fullUtilsPromise;
}
