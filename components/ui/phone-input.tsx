'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

export interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  required?: boolean;
  error?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}

/**
 * Format digits into Russian mask: +7 9XX XXX-XX-XX
 */
function applyMask(value: string): string {
  // Extract all digits
  let digits = value.replace(/\D/g, '');

  if (!digits) return '';

  // If starts with 8, convert to 7
  if (digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  } else if (!digits.startsWith('7')) {
    // If user starts typing without 7, prepend 7
    digits = '7' + digits;
  }

  // Cap at 11 digits
  digits = digits.slice(0, 11);

  // Format: +7 (XXX) XXX-XX-XX or +7 XXX XXX-XX-XX
  let formatted = '+7';

  if (digits.length > 1) {
    formatted += ' ' + digits.slice(1, 4);
  }
  if (digits.length >= 5) {
    formatted += ' ' + digits.slice(4, 7);
  }
  if (digits.length >= 8) {
    formatted += '-' + digits.slice(7, 9);
  }
  if (digits.length >= 10) {
    formatted += '-' + digits.slice(9, 11);
  }

  return formatted;
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
      placeholder = '+7 955 123-45-67',
      defaultValue = '',
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const [displayVal, setDisplayVal] = React.useState<string>(() => {
      const initial = (value !== undefined ? value : defaultValue) || '';
      return initial ? applyMask(String(initial)) : '';
    });

    React.useEffect(() => {
      if (value !== undefined) {
        setDisplayVal(value ? applyMask(String(value)) : '');
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputVal = e.target.value;
      const formatted = applyMask(inputVal);
      setDisplayVal(formatted);
      onChange?.(formatted);
    };

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <Label htmlFor={id} required={required} className="text-xs font-semibold text-slate-700">
            {label}
          </Label>
        )}
        <input
          {...props}
          ref={ref}
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={displayVal}
          onChange={handleChange}
          placeholder={placeholder}
          required={required}
          className={cn(
            'flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 font-mono shadow-xs transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20 focus-visible:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-rose-500 focus-visible:ring-rose-500/20 focus-visible:border-rose-500',
            className
          )}
        />
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';
