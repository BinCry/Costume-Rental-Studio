import { logger } from './config/logger.js';
import { prisma } from './database/prisma.js';
import { startMediaMaintenance } from './modules/uploads/media-maintenance.service.js';
import { startRentalMaintenance } from './modules/rentals/rental-maintenance.service.js';
import { startOverdueRentalDetection } from './modules/rentals/rental-overdue.service.js';
import { startRentalReadinessDetection } from './modules/rentals/rental-readiness.service.js';
import { startOperationalCapacityDetection } from './modules/scheduling/operational-capacity.service.js';

const mediaMaintenance = startMediaMaintenance();
const rentalMaintenance = startRentalMaintenance();
const rentalReadinessDetection = startRentalReadinessDetection();
const overdueRentalDetection = startOverdueRentalDetection();
const operationalCapacityDetection = startOperationalCapacityDetection();
let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Shutting down background worker');
  mediaMaintenance.stop();
  rentalMaintenance.stop();
  rentalReadinessDetection.stop();
  overdueRentalDetection.stop();
  operationalCapacityDetection.stop();

  void prisma
    .$disconnect()
    .then(() => logger.info('Background worker stopped'))
    .catch((error: unknown) => {
      logger.error({ err: error }, 'Failed to disconnect background worker from database');
      process.exitCode = 1;
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
