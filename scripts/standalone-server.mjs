import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';
process.env.PORT = process.env.PORT || '3000';
process.env.KEEP_ALIVE_TIMEOUT = process.env.KEEP_ALIVE_TIMEOUT || '15000';

const GRACEFUL_SHUTDOWN_TIMEOUT_MS =
  parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '15000', 10) || 15000;

let shuttingDown = false;

function onShutdownSignal(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'STANDALONE_SERVER_SHUTDOWN_SIGNAL',
      signal,
      timeoutMs: GRACEFUL_SHUTDOWN_TIMEOUT_MS,
      timestamp: new Date().toISOString(),
    })
  );

  // Safety fallback in case idle keep-alive sockets or external handles stall exit
  const forceExitTimer = setTimeout(() => {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'STANDALONE_SERVER_FORCED_EXIT',
        signal,
        timestamp: new Date().toISOString(),
      })
    );
    process.exit(1);
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();
}

process.on('SIGTERM', () => onShutdownSignal('SIGTERM'));
process.on('SIGINT', () => onShutdownSignal('SIGINT'));

process.on('beforeExit', async () => {
  const prismaClient = globalThis.__globalPrismaClient;
  if (prismaClient && typeof prismaClient.$disconnect === 'function') {
    try {
      await prismaClient.$disconnect();
    } catch {
      // Ignore disconnect errors during final shutdown
    }
  }
});

import fs from 'fs';

// Resolve Next.js standalone server.js relative to app root or inside .next/standalone
let serverEntryPath = path.resolve(__dirname, '..', 'server.js');
if (!fs.existsSync(serverEntryPath)) {
  const localStandalonePath = path.resolve(__dirname, '..', '.next', 'standalone', 'server.js');
  if (fs.existsSync(localStandalonePath)) {
    serverEntryPath = localStandalonePath;
  }
}

console.log(
  JSON.stringify({
    level: 'info',
    event: 'STANDALONE_SERVER_STARTING',
    host: process.env.HOSTNAME,
    port: process.env.PORT,
    gitCommit: process.env.APP_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    timestamp: new Date().toISOString(),
  })
);

require(serverEntryPath);
