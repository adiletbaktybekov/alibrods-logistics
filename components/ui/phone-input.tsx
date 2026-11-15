'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import {
  type CountryCode,
  getAllCountries,
  getCountryFlag,
  getCountryCallingCodeSafe,
  normalizePhoneNumber,
  formatNationalDigits,
} from '@/lib/phone';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  required?: boolean;
  error?: string;
  value?: string;
  defaultValue?: string;
  defaultCountry?: CountryCode;
  onChange?: (value: string) => void;
}

interface ParsedInitial {
  country: CountryCode;
  national: string;
}

function parseInitialPhone(raw?: string | null, fallbackCountry: CountryCode = 'KG'): ParsedInitial {
  if (!raw || !raw.trim()) {
    return { country: fallbackCountry, national: '' };
  }
  const trimmed = raw.trim();

  // If starts with +, parse internationally
  if (trimmed.startsWith('+')) {
    const p = parsePhoneNumberFromString(trimmed);
    if (p) {
      return {
        country: p.country || fallbackCountry,
        national: p.nationalNumber || '',
      };
    }
  }

  // Try parsing with fallbackCountry
  const p = parsePhoneNumberFromString(trimmed, fallbackCountry);
  if (p && p.isValid()) {
    return {
      country: p.country || fallbackCountry,
      national: p.nationalNumber || '',
    };
  }

  // Fallback: check if 11 digits starting with 7 or 8 (Russian trunk)
  const clean = trimmed.replace(/\D/g, '');
  if (clean.length === 11 && (clean.startsWith('7') || clean.startsWith('8'))) {
    return {
      country: 'RU',
      national: clean.slice(1),
    };
  }
  if (clean.startsWith('996') && clean.length === 12) {
    return {
      country: 'KG',
      national: clean.slice(3),
    };
  }

  return {
    country: fallbackCountry,
    national: clean,
  };
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      className,
      id = 'phone',
      name = 'phone',
      label = 'Номер Telegram',
      required = false,
      error,
      placeholder,
      defaultValue = '',
      defaultCountry = 'KG',
      value,
      onChange,
      disabled,
      ...props
    },
    ref
  ) => {
    const isControlled = value !== undefined;
    const initial = parseInitialPhone(isControlled ? value : defaultValue, defaultCountry);

    const [country, setCountry] = React.useState<CountryCode>(initial.country);
    const [nationalDigits, setNationalDigits] = React.useState<string>(initial.national);
    const [displayVal, setDisplayVal] = React.useState<string>(() =>
      formatNationalDigits(initial.national, initial.country)
    );
    const [dropdownOpen, setDropdownOpen] = React.useState<boolean>(false);
    const [searchQuery, setSearchQuery] = React.useState<string>('');
    const [localError, setLocalError] = React.useState<string | null>(null);

    const dropdownRef = React.useRef<HTMLDivElement>(null);
    const searchInputRef = React.useRef<HTMLInputElement>(null);
    const inputFieldRef = React.useRef<HTMLInputElement | null>(null);

    // Sync controlled value changes
    React.useEffect(() => {
      if (isControlled) {
        const next = parseInitialPhone(value, country);
        if (next.country !== country && value?.startsWith('+')) {
          setCountry(next.country);
        }
        setNationalDigits(next.national);
        setDisplayVal(formatNationalDigits(next.national, next.country));
      }
    }, [isControlled, value, country]);

    // Close dropdown on outside click
    React.useEffect(() => {
      const handleOutsideClick = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setDropdownOpen(false);
        }
      };
      if (dropdownOpen) {
        document.addEventListener('mousedown', handleOutsideClick);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      return () => {
        document.removeEventListener('mousedown', handleOutsideClick);
      };
    }, [dropdownOpen]);

    const callingCode = getCountryCallingCodeSafe(country);
    const flag = getCountryFlag(country);

    // Compute canonical E.164 value
    const canonicalValue = React.useMemo(() => {
      if (!nationalDigits.trim()) return '';
      const rawWithCode = `${callingCode}${nationalDigits.replace(/\D/g, '')}`;
      return normalizePhoneNumber(rawWithCode, country);
    }, [callingCode, nationalDigits, country]);

    // Calculate dynamic placeholder if not provided
    const dynamicPlaceholder = React.useMemo(() => {
      if (placeholder) return placeholder;
      if (country === 'KG') return '555 123 456';
      if (country === 'RU' || country === 'KZ') return '955 123-45-67';
      if (country === 'UZ') return '90 123 45 67';
      if (country === 'DE') return '151 23456789';
      if (country === 'US') return '(202) 555-0123';
      return '123 456 789';
    }, [placeholder, country]);

    const handleSelectCountry = (newCountry: CountryCode) => {
      setCountry(newCountry);
      setDropdownOpen(false);
      setSearchQuery('');
      setLocalError(null);

      // Reformat current national digits with new country mask
      const nextDisplay = formatNationalDigits(nationalDigits, newCountry);
      setDisplayVal(nextDisplay);

      const nextCalling = getCountryCallingCodeSafe(newCountry);
      const nextCanonical = nationalDigits ? normalizePhoneNumber(`${nextCalling}${nationalDigits}`, newCountry) : '';
      onChange?.(nextCanonical);

      inputFieldRef.current?.focus();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (!raw.trim()) {
        setNationalDigits('');
        setDisplayVal('');
        setLocalError(null);
        onChange?.('');
        return;
      }

      // Check if user typed or pasted with '+'
      if (raw.includes('+')) {
        const parsed = parsePhoneNumberFromString(raw);
        if (parsed) {
          const detectedCountry = parsed.country || country;
          setCountry(detectedCountry);
          setNationalDigits(parsed.nationalNumber);
          setDisplayVal(parsed.formatNational());
          setLocalError(null);
          onChange?.(parsed.number);
          return;
        }
      }

      // Clean digits
      const digitsOnly = raw.replace(/\D/g, '');
      setNationalDigits(digitsOnly);

      const formatted = formatNationalDigits(digitsOnly, country);
      setDisplayVal(formatted);
      setLocalError(null);

      const nextCanonical = digitsOnly ? normalizePhoneNumber(`${callingCode}${digitsOnly}`, country) : '';
      onChange?.(nextCanonical);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData('text').trim();
      if (!pasted) return;

      // Attempt parsing pasted full number
      if (pasted.startsWith('+') || pasted.replace(/\D/g, '').length >= 10) {
        let parsed = parsePhoneNumberFromString(pasted);
        if (!parsed) {
          parsed = parsePhoneNumberFromString(pasted, country);
        }

        if (parsed && parsed.isValid()) {
          e.preventDefault();
          const nextCountry = parsed.country || country;
          setCountry(nextCountry);
          setNationalDigits(parsed.nationalNumber);
          setDisplayVal(parsed.formatNational());
          setLocalError(null);
          onChange?.(parsed.number);
          return;
        }
      }

      // If not fully valid international string, standard handling
      e.preventDefault();
      const clean = pasted.replace(/\D/g, '');
      setNationalDigits(clean);
      const formatted = formatNationalDigits(clean, country);
      setDisplayVal(formatted);
      const nextCanonical = clean ? normalizePhoneNumber(`${callingCode}${clean}`, country) : '';
      onChange?.(nextCanonical);
    };

    const allCountries = React.useMemo(() => getAllCountries(), []);

    const filteredCountries = React.useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return allCountries;
      return allCountries.filter((c) => {
        return (
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          c.callingCode.includes(q)
        );
      });
    }, [allCountries, searchQuery]);

    const displayedError = localError || error;

    return (
      <div className="w-full space-y-1.5" ref={dropdownRef}>
        {label && (
          <Label htmlFor={id} required={required} className="text-xs font-semibold text-slate-700">
            {label}
          </Label>
        )}

        <div
          className={cn(
            'relative flex items-stretch rounded-xl border bg-white shadow-xs transition-colors focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500',
            displayedError
              ? 'border-rose-500 focus-within:ring-rose-500/20 focus-within:border-rose-500'
              : 'border-slate-200 hover:border-slate-300',
            disabled && 'opacity-60 bg-slate-50 cursor-not-allowed'
          )}
        >
          {/* Country Selector Trigger */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-2 border-r border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors rounded-l-xl text-slate-800 font-mono text-sm select-none focus:outline-none focus:bg-slate-100"
            title="Выбрать страну"
            aria-label="Выбрать страну и телефонный код"
            aria-expanded={dropdownOpen}
          >
            <span className="text-lg leading-none" role="img" aria-hidden="true">
              {flag}
            </span>
            <span className="font-semibold text-xs sm:text-sm">{callingCode}</span>
            <svg
              className={cn(
                'w-3.5 h-3.5 text-slate-500 transition-transform duration-200',
                dropdownOpen && 'rotate-180 text-brand-600'
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* National Number Input */}
          <input
            {...props}
            ref={(node) => {
              inputFieldRef.current = node;
              if (typeof ref === 'function') {
                ref(node);
              } else if (ref) {
                (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
              }
            }}
            id={id}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            disabled={disabled}
            value={displayVal}
            onChange={handleInputChange}
            onPaste={handlePaste}
            placeholder={dynamicPlaceholder}
            required={required}
            className={cn(
              'flex-1 h-10 bg-transparent px-3 py-2 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 rounded-r-xl',
              className
            )}
          />

          {/* Country Dropdown Popover */}
          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-72 sm:w-80 max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden text-slate-900 animate-in fade-in-50 zoom-in-95 duration-150">
              {/* Search Box */}
              <div className="p-2 border-b border-slate-100 bg-slate-50/80">
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск страны или кода (+996)..."
                    className="w-full h-8 pl-8 pr-2 text-xs bg-white border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
                  />
                  <svg
                    className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
              </div>

              {/* Countries Scroll List */}
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 text-xs">
                {filteredCountries.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">Страна не найдена</div>
                ) : (
                  filteredCountries.map((c) => {
                    const isSelected = c.code === country;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => handleSelectCountry(c.code)}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50 transition-colors',
                          isSelected && 'bg-brand-50/60 font-semibold text-brand-900'
                        )}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-base leading-none select-none" role="img" aria-hidden="true">
                            {c.flag}
                          </span>
                          <span className="truncate">{c.name}</span>
                        </div>
                        <span className="font-mono text-slate-500 ml-2 shrink-0">{c.callingCode}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Hidden input carries canonical standard E.164 (+XXXXXXXXXXXX) for standard HTML forms */}
        {name && <input type="hidden" name={name} value={canonicalValue} />}

        {displayedError && (
          <p className="text-xs text-rose-600 font-medium">{displayedError}</p>
        )}
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';

