import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API server started');
});

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, 'Shutting down API server');

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Failed to close API server');
      process.exitCode = 1;
      return;
    }

    logger.info('API server stopped');
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
