import type { Metadata } from 'next';
import './globals.css';
import { siteConfig } from '@/config/site';

import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#6C38CC',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://www.alibros.ru'),
  title: {
    default: `${siteConfig.name} — Доставка на маркетплейсы Wildberries и Ozon`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: `${siteConfig.name} — Доставка на маркетплейсы Wildberries и Ozon`,
    description: siteConfig.description,
    url: 'https://www.alibros.ru',
    siteName: siteConfig.name,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: `${siteConfig.name} — Доставка на склады Wildberries и Ozon`,
      },
    ],
    locale: 'ru_RU',
    type: 'website',
  },
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
