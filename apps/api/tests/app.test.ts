import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { ErrorResponse } from '../src/common/http/response.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';

const queryRawMock = vi.hoisted(() => vi.fn());

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');

describe('Express HTTP foundation', () => {
  it('returns service health and security headers', async () => {
    const app = createApp();
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'ok',
        service: 'costume-api',
      },
      message: 'API is healthy',
    });
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('returns readiness when the database is reachable', async () => {
    queryRawMock.mockResolvedValueOnce([{ result: 1 }]);

    const app = createApp();
    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'ready',
        service: 'costume-api',
        database: 'connected',
      },
      message: 'API is ready',
    });
    expect(queryRawMock).toHaveBeenCalledOnce();
  });

  it('returns 503 readiness without exposing database errors', async () => {
    queryRawMock.mockRejectedValueOnce(new Error('sensitive database connection details'));

    const app = createApp();
    const response = await request(app).get('/health/ready');
    const body = response.body as ErrorResponse;

    expect(response.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is not ready',
      },
      statusCode: 503,
      timestamp: body.timestamp,
      path: '/health/ready',
      requestId: body.requestId,
    });
    expect(response.text).not.toContain('sensitive database connection details');
  });

  it('returns the JSON error contract for an unknown route', async () => {
    const app = createApp();
    const response = await request(app).get('/does-not-exist');
    const body = response.body as ErrorResponse;

    expect(response.status).toBe(404);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
      statusCode: 404,
      timestamp: body.timestamp,
      path: '/does-not-exist',
      requestId: body.requestId,
    });
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId).toBe(response.headers['x-request-id']);
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('allows requests from the configured web origin', async () => {
    const app = createApp();
    const response = await request(app).get('/health').set('Origin', env.WEB_URL);

    expect(response.headers['access-control-allow-origin']).toBe(env.WEB_URL);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('returns 429 after the API rate limit is exceeded', async () => {
    const app = createApp();

    for (let requestNumber = 0; requestNumber < 100; requestNumber += 1) {
      await request(app).get('/api/v1/unknown').expect(404);
    }

    const response = await request(app).get('/api/v1/unknown');
    const body = response.body as ErrorResponse;

    expect(response.status).toBe(429);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
      },
      statusCode: 429,
      timestamp: body.timestamp,
      path: '/api/v1/unknown',
      requestId: body.requestId,
    });
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.requestId).toBe('string');
  });

  it('returns a safe error for malformed JSON', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/v1/unknown')
      .set('Content-Type', 'application/json')
      .send('{invalid');
    const body = response.body as ErrorResponse;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
      },
      statusCode: 400,
      timestamp: body.timestamp,
      path: '/api/v1/unknown',
      requestId: body.requestId,
    });
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.requestId).toBe('string');
    expect(response.text).not.toContain('{invalid');
  });

  it('rejects a JSON body larger than 1 MB', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/v1/unknown')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(1_048_576) }));
    const body = response.body as ErrorResponse;

    expect(response.status).toBe(413);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large',
      },
      statusCode: 413,
      timestamp: body.timestamp,
      path: '/api/v1/unknown',
      requestId: body.requestId,
    });
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.requestId).toBe('string');
  });
});
