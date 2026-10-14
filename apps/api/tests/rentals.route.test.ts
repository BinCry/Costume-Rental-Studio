import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.JWT_ACCESS_SECRET = 'rental-route-test-key-only-not-for-production-12345';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  list: vi.fn(),
  availability: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  confirm: vi.fn(),
  prepare: vi.fn(),
  ready: vi.fn(),
  pickupCheck: vi.fn(),
  pickup: vi.fn(),
  returned: vi.fn(),
  complete: vi.fn(),
  cancel: vi.fn(),
  reject: vi.fn(),
  noShow: vi.fn(),
  reallocate: vi.fn(),
  extend: vi.fn(),
  amend: vi.fn(),
  events: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { user: { findUnique: mocks.actor }, $queryRaw: vi.fn() },
}));
vi.mock('../src/modules/rentals/rental.service.js', () => ({
  listOrders: mocks.list,
  checkAvailability: mocks.availability,
  getOrder: mocks.get,
  createOrder: mocks.create,
  updateOrder: mocks.update,
  confirmOrder: mocks.confirm,
  prepareOrder: mocks.prepare,
  markOrderReady: mocks.ready,
  validatePickupOrder: mocks.pickupCheck,
  pickupOrder: mocks.pickup,
  returnOrder: mocks.returned,
  completeOrder: mocks.complete,
  cancelOrder: mocks.cancel,
  rejectOrder: mocks.reject,
  markNoShow: mocks.noShow,
  reallocateOrder: mocks.reallocate,
  extendOrder: mocks.extend,
  amendOrderItem: mocks.amend,
  listOrderEvents: mocks.events,
}));

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const actorId = '10000000-0000-4000-8000-000000000001';
const branchId = '10000000-0000-4000-8000-000000000002';
const variantId = '10000000-0000-4000-8000-000000000003';
const orderId = '10000000-0000-4000-8000-000000000004';
const itemId = '10000000-0000-4000-8000-000000000005';
const unitId = '10000000-0000-4000-8000-000000000006';
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
const auth = (value: string) => ({ Authorization: `Bearer ${value}` });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({
    id: actorId,
    status: 'ACTIVE',
    employee: { employmentStatus: 'ACTIVE' },
    roleAssignments: [],
  });
  Object.values(mocks)
    .filter((value) => typeof value === 'function' && value !== mocks.actor)
    .forEach((mock) => mock.mockResolvedValue({ id: orderId }));
});

describe('Rental order HTTP routes', () => {
  it('requires authentication for rental routes', async () => {
    await request(createApp()).get('/api/v1/rentals/orders').expect(401);
    await request(createApp()).post('/api/v1/rentals/orders').send({}).expect(401);
    await request(createApp())
      .post(`/api/v1/rentals/orders/${orderId}/confirm`)
      .send({})
      .expect(401);
  });
  it('wires create, availability, update, and lifecycle actions', async () => {
    const bearer = await token();
    const order = {
      customerUserId: actorId,
      pickupBranchId: branchId,
      plannedStartAt: '2026-10-15T08:00:00.000Z',
      plannedDueAt: '2026-10-17T08:00:00.000Z',
      items: [{ variantId }],
    };
    await request(createApp())
      .get(
        `/api/v1/rentals/availability?variantId=${variantId}&pickupBranchId=${branchId}&plannedStartAt=2026-10-15T08:00:00.000Z&plannedDueAt=2026-10-17T08:00:00.000Z`,
      )
      .set(auth(bearer))
      .expect(200);
    await request(createApp())
      .post('/api/v1/rentals/orders')
      .set(auth(bearer))
      .send(order)
      .expect(201);
    await request(createApp())
      .patch(`/api/v1/rentals/orders/${orderId}`)
      .set(auth(bearer))
      .send({ ...order, expectedVersion: 1 })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/rentals/orders/${orderId}/confirm`)
      .set(auth(bearer))
      .send({ expectedVersion: 1, allocations: [{ orderItemId: itemId, unitId }] })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/rentals/orders/${orderId}/prepare`)
      .set(auth(bearer))
      .send({ expectedVersion: 2 })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/rentals/orders/${orderId}/ready`)
      .set(auth(bearer))
      .send({ expectedVersion: 3 })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/rentals/orders/${orderId}/pickup-check`)
      .set(auth(bearer))
      .send({ expectedVersion: 4 })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/rentals/orders/${orderId}/extend`)
      .set(auth(bearer))
      .send({
        expectedVersion: 4,
        newDueAt: '2026-10-20T08:00:00.000Z',
        reason: 'Customer requested more time',
      })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/rentals/orders/${orderId}/items/${itemId}/amend`)
      .set(auth(bearer))
      .send({
        expectedVersion: 4,
        newVariantId: variantId,
        newUnitId: unitId,
        reason: 'Size exchange',
      })
      .expect(200);
    expect(mocks.availability).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.ready).toHaveBeenCalledOnce();
    expect(mocks.extend).toHaveBeenCalledOnce();
    expect(mocks.amend).toHaveBeenCalledOnce();
  });
});
