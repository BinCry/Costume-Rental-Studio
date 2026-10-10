import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './database/prisma.js';
import { startMediaMaintenance } from './modules/uploads/media-maintenance.service.js';

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API server started');
});
const mediaMaintenance = env.BACKGROUND_WORKER_ENABLED ? startMediaMaintenance() : undefined;

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, 'Shutting down API server');
  mediaMaintenance?.stop();

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Failed to close API server');
      process.exitCode = 1;
    }

    void prisma
      .$disconnect()
      .then(() => {
        if (!error) logger.info('API server stopped');
      })
      .catch((disconnectError: unknown) => {
        logger.error({ err: disconnectError }, 'Failed to disconnect from database');
        process.exitCode = 1;
      });
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
