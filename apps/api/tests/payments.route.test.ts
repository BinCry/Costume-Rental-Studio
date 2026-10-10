import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.JWT_ACCESS_SECRET = 'payment-route-test-key-only-not-for-production-12345';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  summary: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  cash: vi.fn(),
  checkout: vi.fn(),
  webhook: vi.fn(),
  cancel: vi.fn(),
  refunds: vi.fn(),
  createRefund: vi.fn(),
  completeRefund: vi.fn(),
  failRefund: vi.fn(),
  settlement: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: { user: { findUnique: mocks.actor }, $queryRaw: vi.fn() },
}));
vi.mock('../src/modules/payments/payment.service.js', () => ({
  getSettlement: mocks.summary,
  listPayments: mocks.list,
  getPayment: mocks.get,
  createCashPayment: mocks.cash,
  createCheckout: mocks.checkout,
  handlePayosWebhook: mocks.webhook,
  cancelPayment: mocks.cancel,
  listRefunds: mocks.refunds,
  createRefund: mocks.createRefund,
  completeRefund: mocks.completeRefund,
  failRefund: mocks.failRefund,
  prepareSettlement: mocks.settlement,
}));

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const actorId = '10000000-0000-4000-8000-000000000001';
const orderId = '10000000-0000-4000-8000-000000000002';
const paymentId = '10000000-0000-4000-8000-000000000003';
const refundId = '10000000-0000-4000-8000-000000000004';

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
  for (const mock of [
    mocks.summary,
    mocks.list,
    mocks.get,
    mocks.cash,
    mocks.checkout,
    mocks.webhook,
    mocks.cancel,
    mocks.refunds,
    mocks.createRefund,
    mocks.completeRefund,
    mocks.failRefund,
    mocks.settlement,
  ])
    mock.mockResolvedValue({ id: paymentId });
});

describe('Payment HTTP routes', () => {
  it('requires authentication for payment routes', async () => {
    await request(createApp()).get(`/api/v1/payments/orders/${orderId}/summary`).expect(401);
    await request(createApp()).post(`/api/v1/payments/orders/${orderId}/cash`).send({}).expect(401);
    await request(createApp())
      .post(`/api/v1/payments/orders/${orderId}/checkout`)
      .send({})
      .expect(401);
  });

  it('wires payment and refund lifecycle actions to their services', async () => {
    const bearer = await token();
    const auth = { Authorization: `Bearer ${bearer}` };
    await request(createApp())
      .get(`/api/v1/payments/orders/${orderId}/summary`)
      .set(auth)
      .expect(200);
    await request(createApp())
      .post(`/api/v1/payments/orders/${orderId}/cash`)
      .set(auth)
      .send({
        purpose: 'DEPOSIT',
        amountVnd: '1000000',
        idempotencyKey: 'payment-1',
      })
      .expect(201);
    await request(createApp())
      .post(`/api/v1/payments/orders/${orderId}/settlement`)
      .set(auth)
      .send({ expectedVersion: 5, otherFeeVnd: '0', depositDeductionVnd: '0' })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/payments/orders/${orderId}/checkout`)
      .set(auth)
      .send({ purpose: 'RENTAL', amountVnd: '500000', idempotencyKey: 'checkout-1' })
      .expect(201);
    await request(createApp())
      .post(`/api/v1/payments/${paymentId}/refunds`)
      .set(auth)
      .send({ amountVnd: '500000', reason: 'Remaining deposit', idempotencyKey: 'refund-1' })
      .expect(201);
    await request(createApp())
      .post(`/api/v1/payments/refunds/${refundId}/complete`)
      .set(auth)
      .send({ transactionReference: 'REF-001' })
      .expect(200);
    expect(mocks.summary).toHaveBeenCalledOnce();
    expect(mocks.cash).toHaveBeenCalledOnce();
    expect(mocks.checkout).toHaveBeenCalledOnce();
    expect(mocks.settlement).toHaveBeenCalledOnce();
    expect(mocks.createRefund).toHaveBeenCalledOnce();
    expect(mocks.completeRefund).toHaveBeenCalledOnce();
  });

  it('accepts payOS webhooks without user authentication', async () => {
    await request(createApp())
      .post('/api/v1/webhooks/payments/payos')
      .send({ code: '00', signature: 'signed', data: {} })
      .expect(200);
    expect(mocks.webhook).toHaveBeenCalledOnce();
  });
});
