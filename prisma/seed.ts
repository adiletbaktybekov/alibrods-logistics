import { PrismaClient, MarketplaceType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 12 подтверждённых складов AliBros Logistics
 * В Production сидируются ИСКЛЮЧИТЕЛЬНО системные справочники складов.
 * Никакие тестовые селлеры, водители или заявки в Production не создаются!
 */
const CONFIRMED_WAREHOUSES = [
  // Ежедневно
  {
    name: 'Коледино',
    code: 'WB_KOLEDINO',
    marketplace: MarketplaceType.WILDBERRIES,
    operatingHours: 'Ежедневно',
  },
  {
    name: 'СК Вешки',
    code: 'WB_VESHKI',
    marketplace: MarketplaceType.WILDBERRIES,
    operatingHours: 'Ежедневно',
  },
  {
    name: 'Подольск',
    code: 'WB_PODOLSK',
    marketplace: MarketplaceType.WILDBERRIES,
    operatingHours: 'Ежедневно',
  },
  {
    name: 'Подольск 4',
    code: 'WB_PODOLSK_4',
    marketplace: MarketplaceType.WILDBERRIES,
    operatingHours: 'Ежедневно',
  },
  {
    name: 'ВБ Щербинка',
    code: 'WB_SCHERBINKA',
    marketplace: MarketplaceType.WILDBERRIES,
    operatingHours: 'Ежедневно',
  },
  {
    name: 'Озон Щербинка',
    code: 'OZON_SCHERBINKA',
    marketplace: MarketplaceType.OZON,
    operatingHours: 'Ежедневно',
  },
  {
    name: 'Озон Гривно',
    code: 'OZON_GRIVNO',
    marketplace: MarketplaceType.OZON,
    operatingHours: 'Ежедневно',
  },
  // Понедельник / среда / пятница
  {
    name: 'Радумля',
    code: 'WB_RADUMLYA',
    marketplace: MarketplaceType.WILDBERRIES,
    operatingHours: 'Понедельник / Среда / Пятница',
  },
  {
    name: 'Обухово',
    code: 'WB_OBUKHOVO',
    marketplace: MarketplaceType.WILDBERRIES,
    operatingHours: 'Понедельник / Среда / Пятница',
  },
  // Вторник / четверг / суббота
  {
    name: 'Чашниково',
    code: 'WB_CHASHNIKOVO',
    marketplace: MarketplaceType.WILDBERRIES,
    operatingHours: 'Вторник / Четверг / Суббота',
  },
  {
    name: 'Чехов 1',
    code: 'WB_CHEKHOV_1',
    marketplace: MarketplaceType.WILDBERRIES,
    operatingHours: 'Вторник / Четверг / Суббота',
  },
  {
    name: 'Чехов 2',
    code: 'WB_CHEKHOV_2',
    marketplace: MarketplaceType.WILDBERRIES,
    operatingHours: 'Вторник / Четверг / Суббота',
  },
];

async function main() {
  console.log('Seeding confirmed warehouse catalog (12 warehouses)...');

  for (const wh of CONFIRMED_WAREHOUSES) {
    await prisma.warehouse.upsert({
      where: { code: wh.code },
      update: {
        name: wh.name,
        marketplace: wh.marketplace,
        operatingHours: wh.operatingHours,
        isActive: true,
      },
      create: {
        name: wh.name,
        code: wh.code,
        marketplace: wh.marketplace,
        operatingHours: wh.operatingHours,
        address: wh.name,
        city: 'Москва и МО',
        isActive: true,
      },
    });
  }

  console.log('✅ Warehouse catalog successfully seeded.');
  console.log('ℹ️ NOTE: For initial administrator creation, use: npm run admin:init');
}

main()
  .catch((e) => {
    console.error('Seed execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
