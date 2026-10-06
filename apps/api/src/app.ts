import { randomUUID } from 'node:crypto';

import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { sendError, sendSuccess } from './common/http/response.js';
import { errorHandler } from './common/middleware/error-handler.js';
import { notFoundHandler } from './common/middleware/not-found-handler.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './database/prisma.js';
import { authRouter } from './modules/auth/auth.route.js';
import { customerRouter } from './modules/customers/customer.route.js';
import { branchRouter } from './modules/branches/branch.route.js';
import { catalogRouter } from './modules/catalog/catalog.route.js';
import { promotionRouter } from './modules/promotions/promotion.route.js';
import { policyRouter } from './modules/policies/policy.route.js';
import { staffRouter } from './modules/staff/staff.route.js';
import { rbacRouter } from './modules/rbac/rbac.route.js';

export function createApp() {
  const app = express();
  app.set('json replacer', (_key: string, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );

  app.disable('x-powered-by');
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.NODE_ENV !== 'test',
      genReqId: (_request, response) => {
        const requestId = randomUUID();
        response.setHeader('X-Request-Id', requestId);
        return requestId;
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_URL,
      credentials: true,
    }),
  );

  app.use(
    '/api/v1',
    rateLimit({
      windowMs: 15 * 60 * 1_000,
      limit: 100,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (request, response) => {
        sendError(request, response, 429, 'RATE_LIMITED', 'Too many requests');
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => {
    sendSuccess(
      response,
      {
        status: 'ok',
        service: 'costume-api',
      },
      'API is healthy',
    );
  });

  app.get('/health/ready', async (request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      return sendSuccess(
        response,
        {
          status: 'ready',
          service: 'costume-api',
          database: 'connected',
        },
        'API is ready',
      );
    } catch (error: unknown) {
      request.log.warn({ err: error }, 'Database readiness check failed');

      return sendError(request, response, 503, 'DATABASE_UNAVAILABLE', 'Database is not ready');
    }
  });

  app.use('/api/v1/customers', customerRouter);
  app.use('/api/v1/branches', branchRouter);
  app.use('/api/v1/catalog', catalogRouter);
  app.use('/api/v1/promotions', promotionRouter);
  app.use('/api/v1/rental-policies', policyRouter);
  app.use('/api/v1/staff', staffRouter);
  app.use('/api/v1/rbac', rbacRouter);
  app.use('/api/v1/auth', authRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
