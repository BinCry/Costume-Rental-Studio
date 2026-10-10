import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.JWT_ACCESS_SECRET = 'crm-route-test-key-only-not-for-production-12345';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  listCases: vi.fn(),
  createCase: vi.fn(),
  getCase: vi.fn(),
  updateCase: vi.fn(),
  assignCase: vi.fn(),
  changeCaseStatus: vi.fn(),
  listCaseHistory: vi.fn(),
  listCaseInteractions: vi.fn(),
  listCustomerInteractions: vi.fn(),
  createInteraction: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { user: { findUnique: mocks.actor }, $queryRaw: vi.fn() },
}));
vi.mock('../src/modules/crm/crm.service.js', () => ({
  listCases: mocks.listCases,
  createCase: mocks.createCase,
  getCase: mocks.getCase,
  updateCase: mocks.updateCase,
  assignCase: mocks.assignCase,
  changeCaseStatus: mocks.changeCaseStatus,
  listCaseHistory: mocks.listCaseHistory,
  listCaseInteractions: mocks.listCaseInteractions,
  listCustomerInteractions: mocks.listCustomerInteractions,
  createInteraction: mocks.createInteraction,
}));

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const actorId = '10000000-0000-4000-8000-000000000001';
const caseId = '10000000-0000-4000-8000-000000000002';

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
  for (const method of [
    mocks.listCases,
    mocks.createCase,
    mocks.getCase,
    mocks.updateCase,
    mocks.assignCase,
    mocks.changeCaseStatus,
    mocks.listCaseHistory,
    mocks.listCaseInteractions,
    mocks.listCustomerInteractions,
    mocks.createInteraction,
  ])
    method.mockResolvedValue({});
});

describe('CRM HTTP routes', () => {
  it('requires authentication', async () => {
    await request(createApp()).get('/api/v1/crm/cases').expect(401);
  });
  it('wires the CRM endpoint surface and validates payloads', async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    await request(createApp()).get('/api/v1/crm/cases').set(auth).expect(200);
    await request(createApp())
      .post('/api/v1/crm/cases')
      .set(auth)
      .send({ customerUserId: actorId, branchId: caseId, subject: 'Help', caseType: 'SUPPORT' })
      .expect(201);
    await request(createApp()).get(`/api/v1/crm/cases/${caseId}`).set(auth).expect(200);
    await request(createApp())
      .patch(`/api/v1/crm/cases/${caseId}`)
      .set(auth)
      .send({ priority: 'HIGH' })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/crm/cases/${caseId}/assign`)
      .set(auth)
      .send({ ownerUserId: actorId })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/crm/cases/${caseId}/status`)
      .set(auth)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    await request(createApp()).get(`/api/v1/crm/cases/${caseId}/history`).set(auth).expect(200);
    await request(createApp())
      .get(`/api/v1/crm/cases/${caseId}/interactions`)
      .set(auth)
      .expect(200);
    await request(createApp())
      .get(`/api/v1/crm/customers/${actorId}/interactions`)
      .set(auth)
      .expect(200);
    await request(createApp())
      .post(`/api/v1/crm/customers/${actorId}/interactions`)
      .set(auth)
      .send({
        branchId: caseId,
        interactionType: 'NOTE',
        channel: 'PHONE',
        summary: 'Called customer',
      })
      .expect(201);
    await request(createApp()).post('/api/v1/crm/cases').set(auth).send({}).expect(400);
    expect(mocks.listCases).toHaveBeenCalledOnce();
    expect(mocks.createInteraction).toHaveBeenCalledOnce();
  });
});
