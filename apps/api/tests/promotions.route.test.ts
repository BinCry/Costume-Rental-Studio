import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.JWT_ACCESS_SECRET = 'promotion-route-test-key-only-not-for-production-12345';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setStatus: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { user: { findUnique: mocks.actor }, $queryRaw: vi.fn() },
}));
vi.mock('../src/modules/promotions/promotion.service.js', () => ({
  listPromotions: mocks.list,
  createPromotion: mocks.create,
  updatePromotion: mocks.update,
  setPromotionStatus: mocks.setStatus,
}));

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const actorId = '10000000-0000-4000-8000-000000000001';
const promotionId = 'bc4fb65b-fbf2-442b-88ec-313e9959211f';

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
  mocks.update.mockResolvedValue({ id: promotionId });
});

describe('PATCH /api/v1/promotions/:id', () => {
  it('updates only the name without filling defaults', async () => {
    await request(createApp())
      .patch(`/api/v1/promotions/${promotionId}`)
      .set({ Authorization: `Bearer ${await token()}` })
      .send({ name: 'TEST SE100 QA đổi tên' })
      .expect(200);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update.mock.calls[0]?.[2]).toEqual({ name: 'TEST SE100 QA đổi tên' });
  });

  it('updates the validity window', async () => {
    await request(createApp())
      .patch(`/api/v1/promotions/${promotionId}`)
      .set({ Authorization: `Bearer ${await token()}` })
      .send({ startAt: '2026-12-01T03:00:00.000Z', endAt: '2026-12-02T03:00:00.000Z' })
      .expect(200);
    expect(mocks.update.mock.calls[0]?.[2]).toEqual({
      startAt: new Date('2026-12-01T03:00:00.000Z'),
      endAt: new Date('2026-12-02T03:00:00.000Z'),
    });
  });

  it('rejects an end before the start when both are sent', async () => {
    const res = await request(createApp())
      .patch(`/api/v1/promotions/${promotionId}`)
      .set({ Authorization: `Bearer ${await token()}` })
      .send({ startAt: '2026-12-02T03:00:00.000Z', endAt: '2026-12-01T03:00:00.000Z' })
      .expect(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a percent discount above 100', async () => {
    await request(createApp())
      .patch(`/api/v1/promotions/${promotionId}`)
      .set({ Authorization: `Bearer ${await token()}` })
      .send({ discountType: 'PERCENT', discountValue: 150 })
      .expect(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
