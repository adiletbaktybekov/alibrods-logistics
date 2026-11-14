import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Migration: order_destinations, sequence, and backfill ---');

  // 1. Create table order_destinations if not exists
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "order_destinations" (
      "id" TEXT NOT NULL,
      "orderId" TEXT NOT NULL,
      "warehouseId" TEXT,
      "isCustomWarehouse" BOOLEAN NOT NULL DEFAULT false,
      "customWarehouseName" TEXT,
      "deliveryDate" TIMESTAMP(3),
      "boxesCount" INTEGER NOT NULL DEFAULT 0,
      "palletsCount" INTEGER NOT NULL DEFAULT 0,
      "comment" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "order_destinations_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "order_destinations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "order_destinations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  console.log('✓ Table order_destinations created or verified.');

  // Create indexes one by one
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "order_destinations_orderId_idx" ON "order_destinations"("orderId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "order_destinations_warehouseId_idx" ON "order_destinations"("warehouseId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "order_destinations_deliveryDate_idx" ON "order_destinations"("deliveryDate");
  `);
  console.log('✓ Indexes for order_destinations created.');

  // 2. Make warehouseId on orders nullable
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "orders" ALTER COLUMN "warehouseId" DROP NOT NULL;
  `);
  console.log('✓ Column orders.warehouseId is now nullable.');

  // 3. Create sequence order_number_seq
  await prisma.$executeRawUnsafe(`
    CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1 INCREMENT BY 1;
  `);
  console.log('✓ Sequence order_number_seq created or verified.');

  // 4. Backfill existing orders into order_destinations
  const backfillResult = await prisma.$executeRawUnsafe(`
    INSERT INTO "order_destinations" (
      "id",
      "orderId",
      "warehouseId",
      "isCustomWarehouse",
      "customWarehouseName",
      "deliveryDate",
      "boxesCount",
      "palletsCount",
      "comment",
      "createdAt",
      "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      o."id",
      o."warehouseId",
      false,
      NULL,
      o."scheduledPickupAt",
      o."totalBoxesCount",
      o."totalPalletsCount",
      NULL,
      o."createdAt",
      o."updatedAt"
    FROM "orders" o
    WHERE NOT EXISTS (
      SELECT 1 FROM "order_destinations" od WHERE od."orderId" = o."id"
    );
  `);
  console.log(`✓ Backfilled ${backfillResult} existing orders into order_destinations.`);

  // 5. Verification
  const totalDestinations = await prisma.orderDestination.count();
  const totalOrders = await prisma.order.count();
  console.log(`Verification: total orders = ${totalOrders}, total destinations = ${totalDestinations}`);

  // Test sequence nextval and reset
  const seqVal = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`;
  console.log('Sequence test nextval:', seqVal[0].nextval);
  // Reset sequence back to 1 for clean start
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE order_number_seq RESTART WITH 1;`);
  console.log('Sequence reset to 1 for production release.');

  console.log('--- Migration completed successfully ---');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
