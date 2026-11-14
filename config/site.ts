export function getCanonicalAppUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl && !envUrl.includes('alibros.com')) {
    return envUrl.replace(/\/+$/, '');
  }
  return 'https://www.alibros.ru';
}

export const siteConfig = {
  name: 'AliBros Logistics',
  shortName: 'AliBros',
  description: 'Коммерческая логистическая платформа для доставки товаров на склады Wildberries и Ozon',
  url: getCanonicalAppUrl(),
  orderPrefix: 'ABL',
  support: {
    email: 'support@alibros.kg',
    telegram: '@alibros_support',
  },
  marketplaces: {
    WILDBERRIES: 'Wildberries',
    OZON: 'Ozon',
  },
} as const;
