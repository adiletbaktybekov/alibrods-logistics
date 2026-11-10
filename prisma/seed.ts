import { PrismaClient, MarketplaceType } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedWarehouse {
  id: string;
  name: string;
  code: string;
  marketplace: MarketplaceType;
  operatingHours: string;
  isActive: boolean;
}

const CONFIRMED_WAREHOUSES: SeedWarehouse[] = [
  // Ежедневно
  {
    id: 'c0000001-0000-0000-0000-000000000001',
    name: 'Коледино',
    code: 'WB_KOLEDINO',
    marketplace: 'WILDBERRIES',
    operatingHours: 'Ежедневно',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000002',
    name: 'СК Вешки',
    code: 'WB_VESHKI',
    marketplace: 'WILDBERRIES',
    operatingHours: 'Ежедневно',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000003',
    name: 'Подольск',
    code: 'WB_PODOLSK',
    marketplace: 'WILDBERRIES',
    operatingHours: 'Ежедневно',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000004',
    name: 'Подольск 4',
    code: 'WB_PODOLSK_4',
    marketplace: 'WILDBERRIES',
    operatingHours: 'Ежедневно',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000005',
    name: 'ВБ Щербинка',
    code: 'WB_SCHERBINKA',
    marketplace: 'WILDBERRIES',
    operatingHours: 'Ежедневно',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000006',
    name: 'Озон Щербинка',
    code: 'OZON_SCHERBINKA',
    marketplace: 'OZON',
    operatingHours: 'Ежедневно',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000007',
    name: 'Озон Гривно',
    code: 'OZON_GRIVNO',
    marketplace: 'OZON',
    operatingHours: 'Ежедневно',
    isActive: true,
  },
  // Понедельник / Среда / Пятница (MWF)
  {
    id: 'c0000001-0000-0000-0000-000000000008',
    name: 'Радумля',
    code: 'WB_RADUMLYA',
    marketplace: 'WILDBERRIES',
    operatingHours: 'Понедельник / среда / пятница',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000009',
    name: 'Обухово',
    code: 'WB_OBUKHOVO',
    marketplace: 'WILDBERRIES',
    operatingHours: 'Понедельник / среда / пятница',
    isActive: true,
  },
  // Вторник / Четверг / Суббота (TTS)
  {
    id: 'c0000001-0000-0000-0000-000000000010',
    name: 'Чашниково',
    code: 'WB_CHASHNIKOVO',
    marketplace: 'WILDBERRIES',
    operatingHours: 'Вторник / четверг / суббота',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000011',
    name: 'Чехов 1',
    code: 'WB_CHEKHOV_1',
    marketplace: 'WILDBERRIES',
    operatingHours: 'Вторник / четверг / суббота',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000012',
    name: 'Чехов 2',
    code: 'WB_CHEKHOV_2',
    marketplace: 'WILDBERRIES',
    operatingHours: 'Вторник / четверг / суббота',
    isActive: true,
  },
];

/**
 * 12 подтверждённых складов AliBros Logistics
 * В Production и Staging сидируются ИСКЛЮЧИТЕЛЬНО системные справочники складов с детерминированными UUID.
 * Никакие тестовые селлеры, водители или заявки в Production не создаются!
 */
async function main() {
  console.log('Seeding confirmed warehouse catalog (12 warehouses)...');

  for (const wh of CONFIRMED_WAREHOUSES) {
    await prisma.warehouse.upsert({
      where: { code: wh.code },
      update: {
        name: wh.name,
        marketplace: wh.marketplace,
        operatingHours: wh.operatingHours,
        isActive: wh.isActive,
      },
      create: {
        id: wh.id,
        name: wh.name,
        code: wh.code,
        marketplace: wh.marketplace,
        operatingHours: wh.operatingHours,
        address: wh.name,
        city: 'Москва и МО',
        isActive: wh.isActive,
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
