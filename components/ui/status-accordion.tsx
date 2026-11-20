'use client';

import * as React from 'react';

export interface StatusAccordionProps {
  title?: string;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  badge?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export function StatusAccordion({
  title = 'Статусы',
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
  badge,
  subtitle,
  children,
  className = '',
}: StatusAccordionProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = controlledIsOpen !== undefined;
  const open = isControlled ? controlledIsOpen : internalOpen;

  const handleToggle = () => {
    const nextState = !open;
    if (!isControlled) {
      setInternalOpen(nextState);
    }
    if (onToggle) {
      onToggle(nextState);
    }
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition-all ${className}`}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-slate-50/80 transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Arrow Triangle: ▶ when closed, ▼ when open */}
          <span
            className="text-xs sm:text-sm font-bold text-brand-600 shrink-0 w-3.5 text-center transition-transform duration-200"
            aria-hidden="true"
          >
            {open ? '▼' : '▶'}
          </span>
          <span className="text-sm font-bold text-slate-900 truncate">
            {title}
          </span>
          {subtitle && (
            <span className="text-xs text-slate-500 hidden sm:inline truncate">
              {subtitle}
            </span>
          )}
        </div>

        {badge && (
          <div className="shrink-0 ml-2">
            {badge}
          </div>
        )}
      </button>

      {/* Collapsible Content */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          open
            ? 'max-h-[1200px] opacity-100 border-t border-slate-100 p-3.5 sm:p-4'
            : 'max-h-0 opacity-0 overflow-hidden py-0 px-3.5 sm:px-4 border-t-0'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
