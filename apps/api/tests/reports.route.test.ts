import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.JWT_ACCESS_SECRET = 'report-route-test-key-only-not-for-production-12345';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  overview: vi.fn(),
  revenue: vi.fn(),
  rentals: vi.fn(),
  payments: vi.fn(),
  inventory: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { user: { findUnique: mocks.actor }, $queryRaw: vi.fn() },
}));
vi.mock('../src/modules/reports/report.service.js', () => ({
  getOverview: mocks.overview,
  getRevenue: mocks.revenue,
  getRentals: mocks.rentals,
  getPayments: mocks.payments,
  getInventory: mocks.inventory,
}));

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const actorId = '10000000-0000-4000-8000-000000000001';

async function token() {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(actorId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({
    id: actorId,
    status: 'ACTIVE',
    employee: { employmentStatus: 'ACTIVE' },
    roleAssignments: [],
  });
  for (const service of [
    mocks.overview,
    mocks.revenue,
    mocks.rentals,
    mocks.payments,
    mocks.inventory,
  ])
    service.mockResolvedValue({});
});

describe('Report HTTP routes', () => {
  it('requires authentication', async () => {
    await request(createApp()).get('/api/v1/reports/overview').expect(401);
  });

  it('wires all reports and validates shared query parameters', async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    for (const path of ['overview', 'revenue', 'rentals', 'payments', 'inventory'])
      await request(createApp()).get(`/api/v1/reports/${path}?groupBy=month`).set(auth).expect(200);
    await request(createApp())
      .get('/api/v1/reports/revenue?from=2026-10-10T00:00:00.000Z&to=2026-10-10T00:00:00.000Z')
      .set(auth)
      .expect(400);
    expect(mocks.overview).toHaveBeenCalledOnce();
    expect(mocks.revenue).toHaveBeenCalledOnce();
    expect(mocks.rentals).toHaveBeenCalledOnce();
    expect(mocks.payments).toHaveBeenCalledOnce();
    expect(mocks.inventory).toHaveBeenCalledOnce();
  });
});
