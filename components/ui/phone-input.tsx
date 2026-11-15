'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { formatNationalDigits } from '@/lib/phone';

export interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  required?: boolean;
  error?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}

/**
 * Extracts the 10 national digits from any raw phone representation.
 */
function extractNational(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const cleanDigits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+7')) {
    return cleanDigits.slice(1, 11);
  }
  if (cleanDigits.length === 11 && (cleanDigits.startsWith('7') || cleanDigits.startsWith('8'))) {
    return cleanDigits.slice(1, 11);
  }
  if (cleanDigits.length === 10) {
    return cleanDigits;
  }
  return cleanDigits.slice(0, 10);
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
      placeholder = '955 123-45-67',
      defaultValue = '',
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const isControlled = value !== undefined;
    const initialDigits = extractNational(isControlled ? value : defaultValue);

    const [digits, setDigits] = React.useState<string>(initialDigits);
    const [displayVal, setDisplayVal] = React.useState<string>(() =>
      formatNationalDigits(initialDigits)
    );
    const [localError, setLocalError] = React.useState<string | null>(null);

    React.useEffect(() => {
      if (isControlled) {
        const nextDigits = extractNational(value);
        setDigits(nextDigits);
        setDisplayVal(formatNationalDigits(nextDigits));
      }
    }, [isControlled, value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (!raw.trim()) {
        setDigits('');
        setDisplayVal('');
        setLocalError(null);
        onChange?.('');
        return;
      }

      const rawDigits = raw.replace(/\D/g, '');

      if (rawDigits.startsWith('0')) {
        setLocalError('Номер не может начинаться с 0. Введите 10 цифр после +7');
        const sanitized = rawDigits.replace(/^0+/, '').slice(0, 10);
        setDigits(sanitized);
        setDisplayVal(formatNationalDigits(sanitized));
        const canonical = sanitized ? `+7${sanitized}` : '';
        onChange?.(canonical);
        return;
      }

      setLocalError(null);
      const national = rawDigits.slice(0, 10);
      setDigits(national);
      setDisplayVal(formatNationalDigits(national));
      const canonical = national ? `+7${national}` : '';
      onChange?.(canonical);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData('text').trim();
      if (!pasted) return;

      const cleanDigits = pasted.replace(/\D/g, '');

      // Explicitly reject +996 / 996 without silently rewriting
      if (pasted.startsWith('+996') || cleanDigits.startsWith('996')) {
        e.preventDefault();
        setLocalError('Номера с кодом +996 не поддерживаются. Пожалуйста, укажите российский номер (+7)');
        return;
      }

      // Explicitly reject leading 0
      if (pasted.startsWith('0') || (cleanDigits.startsWith('0') && !cleanDigits.startsWith('7') && !cleanDigits.startsWith('8'))) {
        e.preventDefault();
        setLocalError('Номер не может начинаться с 0. Введите 10 цифр после +7');
        return;
      }

      let national = '';
      if (pasted.startsWith('+7')) {
        national = cleanDigits.slice(1);
      } else if (cleanDigits.length === 11 && (cleanDigits.startsWith('7') || cleanDigits.startsWith('8'))) {
        national = cleanDigits.slice(1);
      } else if (cleanDigits.length === 10) {
        national = cleanDigits;
      } else if (cleanDigits.length > 10) {
        if (cleanDigits.startsWith('77') || cleanDigits.startsWith('78')) {
          e.preventDefault();
          setLocalError('Обнаружен лишний префикс кода страны. Введите 10 цифр номера.');
          return;
        }
        national = cleanDigits.slice(0, 10);
      } else {
        national = cleanDigits;
      }

      if (national.startsWith('0')) {
        e.preventDefault();
        setLocalError('Номер не может начинаться с 0. Введите 10 цифр после +7');
        return;
      }

      e.preventDefault();
      setLocalError(null);
      const trimmedNational = national.slice(0, 10);
      setDigits(trimmedNational);
      setDisplayVal(formatNationalDigits(trimmedNational));
      const canonical = trimmedNational ? `+7${trimmedNational}` : '';
      onChange?.(canonical);
    };

    const canonicalValue = digits ? `+7${digits}` : '';
    const displayedError = localError || error;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <Label htmlFor={id} required={required} className="text-xs font-semibold text-slate-700">
            {label}
          </Label>
        )}
        <div
          className={cn(
            'flex items-stretch rounded-xl border bg-white shadow-xs overflow-hidden transition-colors focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500',
            displayedError
              ? 'border-rose-500 focus-within:ring-rose-500/20 focus-within:border-rose-500'
              : 'border-slate-200'
          )}
        >
          {/* Static fixed addon for country code +7 */}
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center px-3.5 border-r border-slate-200 bg-slate-50 text-slate-700 font-mono font-semibold text-sm select-none"
          >
            +7
          </span>

          {/* National 10-digits input */}
          <input
            {...props}
            ref={ref}
            id={id}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={displayVal}
            onChange={handleInputChange}
            onPaste={handlePaste}
            placeholder={placeholder}
            required={required}
            className={cn(
              'flex-1 h-10 bg-transparent px-3 py-2 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
              className
            )}
          />
        </div>

        {/* Hidden input carries the full canonical +7XXXXXXXXXX for standard HTML forms */}
        {name && <input type="hidden" name={name} value={canonicalValue} />}

        {displayedError && (
          <p className="text-xs text-rose-600 font-medium">{displayedError}</p>
        )}
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';
