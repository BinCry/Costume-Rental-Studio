import { randomUUID } from 'node:crypto';

import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';

import { sendError, sendSuccess } from './common/http/response.js';
import { errorHandler } from './common/middleware/error-handler.js';
import { notFoundHandler } from './common/middleware/not-found-handler.js';
import { env, webAllowedOrigins } from './config/env.js';
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
import { uploadRouter } from './modules/uploads/upload.route.js';
import { inventoryRouter } from './modules/inventory/inventory.route.js';
import { transferRouter } from './modules/transfers/transfer.route.js';
import { rentalRouter } from './modules/rentals/rental.route.js';
import { paymentRouter, paymentWebhookRouter } from './modules/payments/payment.route.js';
import { reportRouter } from './modules/reports/report.route.js';
import { crmRouter } from './modules/crm/crm.route.js';
import { schedulingRouter } from './modules/scheduling/scheduling.route.js';
import { publicRouter } from './modules/public/public.route.js';
import { knowledgeRouter } from './modules/knowledge/knowledge.route.js';
import { agentRouter } from './modules/agent/agent.route.js';
import { agentToolsInternalRouter } from './modules/agent-tools/agent-tools.route.js';
import { openApiDocument } from './openapi.js';

export function createApp() {
  const app = express();
  if (env.TRUST_PROXY_HOPS !== undefined) app.set('trust proxy', env.TRUST_PROXY_HOPS);
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
      origin: webAllowedOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use(
    '/api/v1/webhooks/payments',
    rateLimit({
      windowMs: 15 * 60 * 1_000,
      limit: 1_000,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
    paymentWebhookRouter,
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

  app.get('/api/openapi.json', (_request, response) => response.json(openApiDocument));
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { customSiteTitle: 'Costume Rental Studio API' }),
  );

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
  app.use('/api/v1/public', publicRouter);
  app.use('/api/v1/knowledge', knowledgeRouter);
  app.use('/api/v1/agent', agentRouter);
  app.use('/api/v1/internal/agent-tools', agentToolsInternalRouter);
  app.use('/api/v1/branches', branchRouter);
  app.use('/api/v1/catalog', catalogRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/inventory', transferRouter);
  app.use('/api/v1/rentals', rentalRouter);
  app.use('/api/v1/payments', paymentRouter);
  app.use('/api/v1/reports', reportRouter);
  app.use('/api/v1/crm', crmRouter);
  app.use('/api/v1/scheduling', schedulingRouter);
  app.use('/api/v1/uploads', uploadRouter);
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
