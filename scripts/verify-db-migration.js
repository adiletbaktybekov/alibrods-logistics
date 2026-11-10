const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Step 7: Verifying telegram_pairing_codes in PostgreSQL ===');
  
  // 1. Table existence and columns
  const columns = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'telegram_pairing_codes'
    ORDER BY ordinal_position;
  `;
  console.log('Table columns:', columns);

  // 2. Indexes
  const indexes = await prisma.$queryRaw`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'telegram_pairing_codes'
    ORDER BY indexname;
  `;
  console.log('\nTable indexes:');
  indexes.forEach(idx => console.log(`  - ${idx.indexname}: ${idx.indexdef}`));

  // 3. Foreign Keys
  const foreignKeys = await prisma.$queryRaw`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'telegram_pairing_codes';
  `;
  console.log('\nForeign Keys:');
  foreignKeys.forEach(fk => console.log(`  - ${fk.constraint_name}: ${fk.column_name} -> ${fk.foreign_table_name}(${fk.foreign_column_name}) [ON DELETE ${fk.delete_rule}]`));

  console.log('\n=== Step 8: Verifying existing Staging data preservation ===');
  const userCount = await prisma.user.count();
  const driverCount = await prisma.driverProfile.count();
  const clientCount = await prisma.clientProfile.count();
  const warehouseCount = await prisma.warehouse.count();
  const orderCount = await prisma.order.count();
  const assignmentCount = await prisma.orderAssignment.count();

  console.log(`  - Users count: ${userCount}`);
  console.log(`  - Driver profiles count: ${driverCount}`);
  console.log(`  - Client profiles count: ${clientCount}`);
  console.log(`  - Warehouses count: ${warehouseCount}`);
  console.log(`  - Orders count: ${orderCount}`);
  console.log(`  - Order assignments count: ${assignmentCount}`);

  // Check specific test driver
  const testDrivers = await prisma.user.findMany({
    where: { role: 'DRIVER' },
    select: { id: true, phone: true, role: true, isActive: true, driverProfile: { select: { fullName: true } } }
  });
  console.log('\nExisting Driver Accounts in Staging:');
  testDrivers.forEach(d => console.log(`  - ID: ${d.id}, Phone: ${d.phone}, Name: ${d.driverProfile?.fullName || 'N/A'}, Active: ${d.isActive}`));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
