export const siteConfig = {
  name: 'AliBros Logistics',
  shortName: 'AliBros',
  description: 'Коммерческая логистическая платформа для доставки товаров на склады Wildberries и Ozon',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
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
