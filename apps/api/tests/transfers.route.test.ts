import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.JWT_ACCESS_SECRET = 'transfer-route-test-key-only-not-for-production-12345';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  approve: vi.fn(),
  end: vi.fn(),
  ship: vi.fn(),
  receive: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: { user: { findUnique: mocks.actor }, $queryRaw: vi.fn() },
}));
vi.mock('../src/modules/transfers/transfer.service.js', () => ({
  listTransfers: mocks.list,
  getTransfer: mocks.get,
  createTransfer: mocks.create,
  updateTransfer: mocks.update,
  approveTransfer: mocks.approve,
  endTransfer: mocks.end,
  shipTransfer: mocks.ship,
  receiveTransfer: mocks.receive,
}));

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');

const sourceBranchId = '10000000-0000-4000-8000-000000000001';
const destinationBranchId = '10000000-0000-4000-8000-000000000002';
const unitId = '10000000-0000-4000-8000-000000000003';
const transferId = '10000000-0000-4000-8000-000000000004';
const actorId = '10000000-0000-4000-8000-000000000005';

function actor() {
  return {
    id: actorId,
    status: 'ACTIVE',
    employee: { employmentStatus: 'ACTIVE' },
    roleAssignments: [
      {
        branchId: null,
        branch: null,
        role: { isActive: true, roleCode: 'ADMIN', rolePermissions: [] },
      },
    ],
  };
}
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
function auth(value: string) {
  return { Authorization: `Bearer ${value}` };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue(actor());
  for (const mock of [
    mocks.list,
    mocks.get,
    mocks.create,
    mocks.update,
    mocks.approve,
    mocks.end,
    mocks.ship,
    mocks.receive,
  ])
    mock.mockResolvedValue({ id: transferId });
});

describe('Stock Transfer HTTP routes', () => {
  it('requires authentication for every transfer route', async () => {
    await request(createApp()).get('/api/v1/inventory/transfers').expect(401);
    await request(createApp()).post('/api/v1/inventory/transfers').send({}).expect(401);
    await request(createApp())
      .post(`/api/v1/inventory/transfers/${transferId}/approve`)
      .send({})
      .expect(401);
  });

  it('wires list, detail, create, and patch to their services', async () => {
    const bearer = await token();
    await request(createApp())
      .get('/api/v1/inventory/transfers?status=REQUESTED')
      .set(auth(bearer))
      .expect(200);
    await request(createApp())
      .get(`/api/v1/inventory/transfers/${transferId}`)
      .set(auth(bearer))
      .expect(200);
    await request(createApp())
      .post('/api/v1/inventory/transfers')
      .set(auth(bearer))
      .send({ fromBranchId: sourceBranchId, toBranchId: destinationBranchId, unitIds: [unitId] })
      .expect(201);
    await request(createApp())
      .patch(`/api/v1/inventory/transfers/${transferId}`)
      .set(auth(bearer))
      .send({ expectedVersion: 1, requestNote: 'Corrected note' })
      .expect(200);
    expect(mocks.list).toHaveBeenCalledOnce();
    expect(mocks.get).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it('wires all lifecycle actions and validates their payloads before calling services', async () => {
    const bearer = await token();
    const unitItems = [{ unitId, conditionOut: 'GOOD' }];
    await request(createApp())
      .post(`/api/v1/inventory/transfers/${transferId}/approve`)
      .set(auth(bearer))
      .send({ expectedVersion: 1 })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/inventory/transfers/${transferId}/reject`)
      .set(auth(bearer))
      .send({ expectedVersion: 1, reason: 'No capacity' })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/inventory/transfers/${transferId}/cancel`)
      .set(auth(bearer))
      .send({ expectedVersion: 1, reason: 'No longer needed' })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/inventory/transfers/${transferId}/ship`)
      .set(auth(bearer))
      .send({ expectedVersion: 1, items: unitItems })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/inventory/transfers/${transferId}/receive`)
      .set(auth(bearer))
      .send({
        expectedVersion: 1,
        items: [{ unitId, conditionIn: 'GOOD', receivedOperationalStatus: 'READY' }],
      })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/inventory/transfers/${transferId}/receive`)
      .set(auth(bearer))
      .send({
        expectedVersion: 1,
        items: [{ unitId, conditionIn: 'DAMAGED', receivedOperationalStatus: 'READY' }],
      })
      .expect(400);
    expect(mocks.approve).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledTimes(2);
    expect(mocks.ship).toHaveBeenCalledOnce();
    expect(mocks.receive).toHaveBeenCalledOnce();
  });
});
