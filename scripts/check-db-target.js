const { URL } = require('url');

function inspectUrl(name, rawUrl) {
  if (!rawUrl) {
    console.error(`[ERROR] ${name} is not set in environment.`);
    process.exit(1);
  }

  try {
    const parsed = new URL(rawUrl);
    const dbName = parsed.pathname.replace(/^\//, '');
    const isStaging = dbName === 'alibros_staging';
    const isNeon = parsed.hostname.includes('neon.tech');
    const isProduction = dbName.toLowerCase().includes('prod') || parsed.hostname.toLowerCase().includes('prod');

    console.log(`[TARGET CHECK] ${name}:`);
    console.log(`  - Host: ${parsed.hostname}`);
    console.log(`  - Database: ${dbName}`);
    console.log(`  - Protocol: ${parsed.protocol}`);
    console.log(`  - Is Neon Tech: ${isNeon ? 'YES' : 'NO'}`);
    console.log(`  - Is Staging Database ('alibros_staging'): ${isStaging ? 'YES' : 'NO'}`);
    console.log(`  - Is Production: ${isProduction ? 'YES (DANGER)' : 'NO (SAFE)'}`);

    if (!isStaging) {
      console.error(`[FATAL] Database name '${dbName}' is NOT 'alibros_staging'! Aborting.`);
      process.exit(1);
    }
    if (isProduction) {
      console.error(`[FATAL] Detected production flag in database URL! Aborting.`);
      process.exit(1);
    }
    if (!isNeon) {
      console.error(`[FATAL] Host '${parsed.hostname}' is not a Neon database! Aborting.`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[ERROR] Failed to parse ${name}: ${err.message}`);
    process.exit(1);
  }
}

console.log('=== Checking Target Database Safety ===');
inspectUrl('DATABASE_URL', process.env.DATABASE_URL);
console.log('');
inspectUrl('DIRECT_URL', process.env.DIRECT_URL);
console.log('\n[SUCCESS] Confirmed target is strictly Neon Staging (alibros_staging).');
