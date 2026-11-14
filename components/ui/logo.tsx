import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';

export type LogoVariant = 'full' | 'compact' | 'icon';
export type LogoTheme = 'light' | 'dark';

interface AliBrosLogoProps {
  variant?: LogoVariant;
  theme?: LogoTheme;
  className?: string;
  href?: string;
  priority?: boolean;
}

/**
 * Official AliBros Logistics Brand Logo Component.
 * Supports horizontal full logo with tagline, compact logo, and icon mark.
 * Automatically switches between light (navy text) and dark (white text) themes.
 */
export function AliBrosLogo({
  variant = 'full',
  theme = 'light',
  className = '',
  href,
  priority = false,
}: AliBrosLogoProps) {
  let src = '/logo-full.png';
  let width = 210;
  let height = 64;
  let alt = 'AliBros Logistics — Доставка на маркетплейсы';

  if (variant === 'icon') {
    src = '/logo-icon.png';
    width = 44;
    height = 44;
    alt = 'AliBros Logistics';
  } else if (variant === 'compact') {
    src = '/logo-compact.png';
    width = 170;
    height = 46;
    alt = 'AliBros';
  } else {
    // Full variant
    src = theme === 'dark' ? '/logo-full-dark.png' : '/logo-full.png';
    width = 220;
    height = 68;
    alt = 'AliBros Logistics — Доставка на маркетплейсы';
  }

  const imageElement = (
    <div className={`inline-flex items-center select-none ${className}`}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className="h-auto w-auto max-h-full object-contain"
      />
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center transition-opacity hover:opacity-95 focus:outline-none">
        {imageElement}
      </Link>
    );
  }

  return imageElement;
}
