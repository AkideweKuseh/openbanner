import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { getBrowser, closeBrowser } from './browser-pool.js';

const app = createApp();
const server = app.listen(config.port, async () => {
  logger.info(`OpenBanner render API listening on :${config.port}`);
  try {
    await getBrowser();
    logger.info('chromium warmed up');
  } catch (err) {
    logger.error({ err }, 'chromium warmup failed (will retry on first request)');
  }
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, draining...`);
  server.close(async () => {
    await closeBrowser();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), config.shutdownTimeoutMs).unref();
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => shutdown(sig));
}
