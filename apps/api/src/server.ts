import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './database/prisma.js';
import { startMediaMaintenance } from './modules/uploads/media-maintenance.service.js';
import { startRentalMaintenance } from './modules/rentals/rental-maintenance.service.js';
import { startOverdueRentalDetection } from './modules/rentals/rental-overdue.service.js';
import { startRentalReadinessDetection } from './modules/rentals/rental-readiness.service.js';
import { startOperationalCapacityDetection } from './modules/scheduling/operational-capacity.service.js';

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API server started');
});
const mediaMaintenance = env.BACKGROUND_WORKER_ENABLED ? startMediaMaintenance() : undefined;
const rentalMaintenance = env.BACKGROUND_WORKER_ENABLED ? startRentalMaintenance() : undefined;
const rentalReadinessDetection = env.BACKGROUND_WORKER_ENABLED
  ? startRentalReadinessDetection()
  : undefined;
const overdueRentalDetection = env.BACKGROUND_WORKER_ENABLED
  ? startOverdueRentalDetection()
  : undefined;
const operationalCapacityDetection = env.BACKGROUND_WORKER_ENABLED
  ? startOperationalCapacityDetection()
  : undefined;

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, 'Shutting down API server');
  mediaMaintenance?.stop();
  rentalMaintenance?.stop();
  rentalReadinessDetection?.stop();
  overdueRentalDetection?.stop();
  operationalCapacityDetection?.stop();

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
