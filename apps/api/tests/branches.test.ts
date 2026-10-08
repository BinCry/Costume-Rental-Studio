import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.JWT_ACCESS_SECRET = 'branch-test-key-only-not-for-production-12345';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  branchCount: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  orderCount: vi.fn(),
  transferCount: vi.fn(),
  unitCount: vi.fn(),
  assignmentCount: vi.fn(),
  crmCaseCount: vi.fn(),
  eventCount: vi.fn(),
  customerCount: vi.fn(),
  interactionCount: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.actor },
    branch: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      count: mocks.branchCount,
      create: mocks.create,
      update: mocks.update,
      delete: mocks.remove,
    },
    rentalOrder: { count: mocks.orderCount },
    stockTransfer: { count: mocks.transferCount },
    costumeUnit: { count: mocks.unitCount },
    userRoleAssignment: { count: mocks.assignmentCount },
    crmCase: { count: mocks.crmCaseCount },
    unitEvent: { count: mocks.eventCount },
    customer: { count: mocks.customerCount },
    customerInteraction: { count: mocks.interactionCount },
    $transaction: mocks.transaction,
  },
}));

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');

const branchId = '10000000-0000-4000-8000-000000000001';
const actorId = '10000000-0000-4000-8000-000000000002';
const input = {
  branchCode: 'hcm-q1',
  name: 'District 1',
  address: '1 Main Street',
  timezone: 'Asia/Ho_Chi_Minh',
};
const branch = { id: branchId, ...input, branchCode: 'HCM-Q1', status: 'ACTIVE' };

interface ErrorResponse {
  error: { code: string };
}
interface ListResponse {
  data: { pagination: { page: number; pageSize: number; totalItems: number } };
}

function account(permissions = ['read', 'manage']) {
  return {
    id: actorId,
    status: 'ACTIVE',
    employee: { employmentStatus: 'ACTIVE' },
    roleAssignments: [
      {
        branchId: null,
        branch: null,
        role: {
          isActive: true,
          roleCode: 'ADMIN',
          rolePermissions: permissions.map((action) => ({
            permission: {
              code: `branches.${action}.all`,
              module: 'branches',
              action,
              scope: 'ALL',
            },
          })),
        },
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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue(account());
  mocks.findMany.mockResolvedValue([branch]);
  mocks.findUnique.mockResolvedValue(branch);
  mocks.branchCount.mockResolvedValue(1);
  mocks.create.mockImplementation(({ data }: { data: object }) => ({ id: branchId, ...data }));
  mocks.update.mockImplementation(({ data }: { data: object }) => ({ ...branch, ...data }));
  mocks.remove.mockResolvedValue(branch);
  mocks.queryRaw.mockResolvedValue([{ id: branchId, status: 'ACTIVE' }]);
  for (const count of [
    mocks.orderCount,
    mocks.transferCount,
    mocks.unitCount,
    mocks.assignmentCount,
    mocks.crmCaseCount,
    mocks.eventCount,
    mocks.customerCount,
    mocks.interactionCount,
  ])
    count.mockResolvedValue(0);
  const tx = {
    $queryRaw: mocks.queryRaw,
    branch: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      count: mocks.branchCount,
      create: mocks.create,
      update: mocks.update,
      delete: mocks.remove,
    },
    rentalOrder: { count: mocks.orderCount },
    stockTransfer: { count: mocks.transferCount },
    costumeUnit: { count: mocks.unitCount },
    userRoleAssignment: { count: mocks.assignmentCount },
    crmCase: { count: mocks.crmCaseCount },
    unitEvent: { count: mocks.eventCount },
    customer: { count: mocks.customerCount },
    customerInteraction: { count: mocks.interactionCount },
  };
  mocks.transaction.mockImplementation(
    (work: Promise<unknown>[] | ((transaction: typeof tx) => Promise<unknown>)) =>
      Array.isArray(work) ? Promise.all(work) : work(tx),
  );
});

describe('Branch API', () => {
  it('rejects unauthenticated requests', async () => {
    await request(createApp()).get('/api/v1/branches').expect(401);
    expect(mocks.actor).not.toHaveBeenCalled();
  });

  it('lists with search, status, pagination, and whitelisted sorting', async () => {
    const response = await request(createApp())
      .get(
        '/api/v1/branches?search=district&status=ACTIVE&page=2&pageSize=5&sortBy=name&sortOrder=asc',
      )
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    expect((response.body as ListResponse).data.pagination).toMatchObject({
      page: 2,
      pageSize: 5,
      totalItems: 1,
    });
    const listCall = mocks.findMany.mock.calls[0]?.[0] as unknown as {
      orderBy: unknown;
      skip: number;
      take: number;
      where: { status?: string };
    };
    expect(listCall).toMatchObject({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 5,
      take: 5,
      where: { status: 'ACTIVE' },
    });
  });

  it('rejects a non-whitelisted sort and invalid IANA timezone', async () => {
    await request(createApp())
      .get('/api/v1/branches?sortBy=deletedAt')
      .auth(await token(), { type: 'bearer' })
      .expect(400);
    await request(createApp())
      .post('/api/v1/branches')
      .auth(await token(), { type: 'bearer' })
      .send({ ...input, timezone: 'abc/xyz' })
      .expect(400);
  });

  it('uses read permission for GET and manage permission for writes', async () => {
    mocks.actor.mockResolvedValue(account(['manage']));
    await request(createApp())
      .get('/api/v1/branches')
      .auth(await token(), { type: 'bearer' })
      .expect(403);
    mocks.actor.mockResolvedValue(account(['read']));
    await request(createApp())
      .post('/api/v1/branches')
      .auth(await token(), { type: 'bearer' })
      .send(input)
      .expect(403);
  });

  it('creates uppercase codes and returns 409 for duplicate codes', async () => {
    await request(createApp())
      .post('/api/v1/branches')
      .auth(await token(), { type: 'bearer' })
      .send(input)
      .expect(201);
    expect(mocks.create.mock.calls[0]?.[0] as unknown).toMatchObject({
      data: { branchCode: 'HCM-Q1' },
    });
    mocks.create.mockRejectedValueOnce({ code: 'P2002' });
    const response = await request(createApp())
      .post('/api/v1/branches')
      .auth(await token(), { type: 'bearer' })
      .send(input)
      .expect(409);
    expect((response.body as ErrorResponse).error.code).toBe('BRANCH_CODE_CONFLICT');
  });

  it('updates branches and returns 404 when absent', async () => {
    await request(createApp())
      .patch(`/api/v1/branches/${branchId}`)
      .auth(await token(), { type: 'bearer' })
      .send({ name: 'New name' })
      .expect(200);
    mocks.findUnique.mockResolvedValueOnce(null);
    await request(createApp())
      .patch(`/api/v1/branches/${branchId}`)
      .auth(await token(), { type: 'bearer' })
      .send({ name: 'New name' })
      .expect(404);
  });

  it('activates an eligible branch inside the lock transaction', async () => {
    await request(createApp())
      .post(`/api/v1/branches/${branchId}/activate`)
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    expect(mocks.queryRaw).toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE' } }),
    );
  });

  it.each([
    ['active rental order', mocks.orderCount],
    ['active stock transfer', mocks.transferCount],
    ['non-retired costume unit', mocks.unitCount],
    ['role assignment', mocks.assignmentCount],
    ['open CRM case', mocks.crmCaseCount],
  ])('blocks deactivation with %s', async (_name, count) => {
    count.mockResolvedValueOnce(1);
    const response = await request(createApp())
      .post(`/api/v1/branches/${branchId}/deactivate`)
      .auth(await token(), { type: 'bearer' })
      .expect(409);
    expect((response.body as ErrorResponse).error.code).toBe('BRANCH_IN_USE');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    ['role assignment', mocks.assignmentCount],
    ['costume unit', mocks.unitCount],
    ['unit event', mocks.eventCount],
    ['stock transfer', mocks.transferCount],
    ['rental order', mocks.orderCount],
    ['preferred customer', mocks.customerCount],
    ['customer interaction', mocks.interactionCount],
    ['CRM case', mocks.crmCaseCount],
  ])('blocks deletion with %s', async (_name, count) => {
    count.mockResolvedValueOnce(1);
    const response = await request(createApp())
      .delete(`/api/v1/branches/${branchId}`)
      .auth(await token(), { type: 'bearer' })
      .expect(409);
    expect((response.body as ErrorResponse).error.code).toBe('BRANCH_IN_USE');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('deletes only an unused branch and returns 404 when absent', async () => {
    await request(createApp())
      .delete(`/api/v1/branches/${branchId}`)
      .auth(await token(), { type: 'bearer' })
      .expect(204);
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: branchId } });
    mocks.queryRaw.mockResolvedValueOnce([]);
    await request(createApp())
      .delete(`/api/v1/branches/${branchId}`)
      .auth(await token(), { type: 'bearer' })
      .expect(404);
  });
});
