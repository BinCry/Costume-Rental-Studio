import { randomUUID } from 'node:crypto';

import express from 'express';
import pinoHttp from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import type { ErrorResponse } from '../src/common/http/response.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';

const { AppError } = await import('../src/common/errors/app-error.js');
const { errorHandler } = await import('../src/common/middleware/error-handler.js');
const { logger } = await import('../src/config/logger.js');

function createErrorTestApp() {
  const app = express();

  app.use(
    pinoHttp({
      logger,
      autoLogging: false,
      genReqId: (_request, response) => {
        const requestId = randomUUID();
        response.setHeader('X-Request-Id', requestId);
        return requestId;
      },
    }),
  );

  app.get('/validation', () => {
    throw new AppError(400, 'VALIDATION_ERROR', 'Validation failed', {
      password: 'Password must contain at least 6 characters',
    });
  });

  app.get('/unexpected', () => {
    throw new Error('Sensitive internal error');
  });

  app.get('/prisma/:code', (request) => {
    throw Object.assign(new Error('Prisma error'), {
      code: request.params.code,
      meta: { target: ['model_code'] },
    });
  });

  app.use(errorHandler);

  return app;
}

describe('error handler', () => {
  it('returns AppError details without reflecting the query string', async () => {
    const response = await request(createErrorTestApp()).get('/validation?token=sensitive');
    const body = response.body as ErrorResponse;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: {
          password: 'Password must contain at least 6 characters',
        },
      },
      statusCode: 400,
      timestamp: body.timestamp,
      path: '/validation',
      requestId: body.requestId,
    });
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId).toBe(response.headers['x-request-id']);
    expect(response.text).not.toContain('sensitive');
  });

  it('does not expose unexpected error details', async () => {
    const response = await request(createErrorTestApp()).get('/unexpected');
    const body = response.body as ErrorResponse;

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
      statusCode: 500,
      timestamp: body.timestamp,
      path: '/unexpected',
      requestId: body.requestId,
    });
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId).toBe(response.headers['x-request-id']);
    expect(response.text).not.toContain('Sensitive internal error');
  });

  it.each([
    ['P2002', 409, 'DUPLICATE_RECORD'],
    ['P2025', 404, 'RECORD_NOT_FOUND'],
    ['P2003', 400, 'INVALID_REFERENCE'],
  ])('maps Prisma %s to HTTP %i', async (prismaCode, status, errorCode) => {
    const response = await request(createErrorTestApp()).get(`/prisma/${prismaCode}`);
    expect(response.status).toBe(status);
    expect((response.body as ErrorResponse).error.code).toBe(errorCode);
  });
});
