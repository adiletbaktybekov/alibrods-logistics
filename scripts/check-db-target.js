const { URL } = require('url');

const ALLOWED_ENDPOINT_ID = 'ep-restless-wave-b9k0ye9q';
const ALLOWED_POOLED_HOST = `${ALLOWED_ENDPOINT_ID}-pooler.c-7.eu-central-1.aws.neon.tech`;
const ALLOWED_DIRECT_HOST = `${ALLOWED_ENDPOINT_ID}.c-7.eu-central-1.aws.neon.tech`;
const ALLOWED_DATABASE_NAME = 'neondb';
const OLD_ENDPOINT_ID = 'ep-dawn-wildflower-b98aa1ax';

/**
 * Validates a single PostgreSQL connection URL for safety and compliance with the dedicated Staging branch.
 * @param {'DATABASE_URL' | 'DIRECT_URL'} name 
 * @param {string} rawUrl 
 * @param {boolean} isDirect 
 * @returns {{ host: string, database: string, isPooled: boolean }}
 */
function inspectUrl(name, rawUrl, isDirect = false) {
  if (!rawUrl) {
    throw new Error(`[FATAL] ${name} is not set in environment.`);
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new Error(`[FATAL] Failed to parse ${name}: ${err.message}`);
  }

  const hostname = parsed.hostname;
  const dbName = parsed.pathname.replace(/^\//, '');
  const searchParams = parsed.searchParams;
  const sslMode = searchParams.get('sslmode');

  // 1. Explicitly detect and block old endpoint
  if (hostname.includes(OLD_ENDPOINT_ID)) {
    throw new Error(
      `[FATAL] ${name} points to OLD staging endpoint ('${OLD_ENDPOINT_ID}'). ` +
      `This instance is preserved as an immutable backup. ` +
      `You must use the new dedicated staging endpoint '${ALLOWED_ENDPOINT_ID}'.`
    );
  }

  // 2. Explicitly detect and block production
  const isProduction =
    dbName.toLowerCase().includes('prod') ||
    hostname.toLowerCase().includes('prod');
  if (isProduction) {
    throw new Error(
      `[FATAL] ${name} contains production flags in hostname or database name! Aborting.`
    );
  }

  // 3. Must be Neon Cloud
  if (!hostname.includes('neon.tech')) {
    throw new Error(`[FATAL] ${name} host '${hostname}' is not a Neon Cloud database! Aborting.`);
  }

  // 4. Must match exactly the new staging endpoint ID
  if (!hostname.startsWith(ALLOWED_ENDPOINT_ID)) {
    throw new Error(
      `[FATAL] ${name} host '${hostname}' does not match the allowed staging endpoint '${ALLOWED_ENDPOINT_ID}'.`
    );
  }

  // 5. Check host type (pooled vs direct)
  const expectedHost = isDirect ? ALLOWED_DIRECT_HOST : ALLOWED_POOLED_HOST;
  if (hostname !== expectedHost) {
    throw new Error(
      `[FATAL] ${name} hostname mismatch. Expected '${expectedHost}', but received '${hostname}'.`
    );
  }

  // 6. Database name must match neondb
  if (dbName !== ALLOWED_DATABASE_NAME) {
    throw new Error(
      `[FATAL] ${name} database name '${dbName}' is invalid. Expected '${ALLOWED_DATABASE_NAME}'.`
    );
  }

  // 7. SSL mode must be require
  if (sslMode !== 'require') {
    throw new Error(
      `[FATAL] ${name} missing mandatory 'sslmode=require' query parameter.`
    );
  }

  return {
    host: hostname,
    database: dbName,
    isPooled: hostname.includes('-pooler'),
  };
}

/**
 * Validates both DATABASE_URL and DIRECT_URL for the dedicated Neon Staging branch.
 * @param {string} databaseUrl 
 * @param {string} directUrl 
 */
function verifyTargetDatabase(databaseUrl, directUrl) {
  const dbResult = inspectUrl('DATABASE_URL', databaseUrl, false);
  const directResult = inspectUrl('DIRECT_URL', directUrl, true);

  return {
    success: true,
    endpointId: ALLOWED_ENDPOINT_ID,
    database: ALLOWED_DATABASE_NAME,
    pooledHost: dbResult.host,
    directHost: directResult.host,
  };
}

function runCliCheck() {
  console.log(`=== Checking Target Database Safety (Neon Staging ${ALLOWED_ENDPOINT_ID}) ===`);

  try {
    const res = verifyTargetDatabase(process.env.DATABASE_URL, process.env.DIRECT_URL);
    console.log(`[TARGET CHECK] DATABASE_URL:`);
    console.log(`  - Host: ${res.pooledHost}`);
    console.log(`  - Database: ${res.database}`);
    console.log(`  - Is Pooled: YES`);
    console.log(`  - Is Allowed Staging Endpoint: YES`);
    console.log(`  - Is Production: NO (SAFE)`);

    console.log(`\n[TARGET CHECK] DIRECT_URL:`);
    console.log(`  - Host: ${res.directHost}`);
    console.log(`  - Database: ${res.database}`);
    console.log(`  - Is Direct: YES`);
    console.log(`  - Is Allowed Staging Endpoint: YES`);
    console.log(`  - Is Production: NO (SAFE)`);

    console.log(`\n[SUCCESS] Confirmed target is strictly Neon Staging (${ALLOWED_ENDPOINT_ID}/${ALLOWED_DATABASE_NAME}).`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runCliCheck();
}

module.exports = {
  ALLOWED_ENDPOINT_ID,
  ALLOWED_POOLED_HOST,
  ALLOWED_DIRECT_HOST,
  ALLOWED_DATABASE_NAME,
  OLD_ENDPOINT_ID,
  inspectUrl,
  verifyTargetDatabase,
};
