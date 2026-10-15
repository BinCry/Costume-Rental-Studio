import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.JWT_ACCESS_SECRET = 'inventory-test-key-only-not-for-production-12345';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  unitFindMany: vi.fn(),
  unitFindUnique: vi.fn(),
  unitFindUniqueOrThrow: vi.fn(),
  unitCount: vi.fn(),
  unitCreate: vi.fn(),
  unitUpdate: vi.fn(),
  eventFindMany: vi.fn(),
  eventCount: vi.fn(),
  eventCreate: vi.fn(),
  orderCount: vi.fn(),
  transferCount: vi.fn(),
  blockCount: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.actor },
    costumeUnit: {
      findMany: mocks.unitFindMany,
      findUnique: mocks.unitFindUnique,
      findUniqueOrThrow: mocks.unitFindUniqueOrThrow,
      count: mocks.unitCount,
      create: mocks.unitCreate,
      update: mocks.unitUpdate,
    },
    unitEvent: {
      findMany: mocks.eventFindMany,
      count: mocks.eventCount,
      create: mocks.eventCreate,
    },
    rentalOrderItem: { count: mocks.orderCount },
    stockTransferItem: { count: mocks.transferCount },
    unitBlock: { count: mocks.blockCount },
    $transaction: mocks.transaction,
  },
}));

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');

const branchId = '10000000-0000-4000-8000-000000000001';
const otherBranchId = '10000000-0000-4000-8000-000000000002';
const variantId = '10000000-0000-4000-8000-000000000003';
const unitId = '10000000-0000-4000-8000-000000000004';
const actorId = '10000000-0000-4000-8000-000000000005';
const unit = {
  id: unitId,
  unitCode: 'UNIT-001',
  variantId,
  currentBranchId: branchId,
  conditionGrade: 'UNINSPECTED',
  conditionNotes: null,
  operationalStatus: 'INBOUND',
  retiredAt: null,
  variant: { id: variantId, model: { id: 'model', category: { id: 'category' } } },
  currentBranch: { id: branchId, status: 'ACTIVE' },
};

interface ErrorResponse {
  error: { code: string };
}

function account(actions = ['read', 'manage'], scope: 'ALL' | 'BRANCH' = 'ALL') {
  return {
    id: actorId,
    status: 'ACTIVE',
    employee: { employmentStatus: 'ACTIVE' },
    roleAssignments: [
      {
        branchId: scope === 'ALL' ? null : branchId,
        branch: scope === 'ALL' ? null : { status: 'ACTIVE' },
        role: {
          isActive: true,
          roleCode: scope === 'ALL' ? 'ADMIN' : 'INVENTORY_STAFF',
          rolePermissions: actions.map((action) => ({
            permission: {
              code: `inventory.${action}.${scope.toLowerCase()}`,
              module: 'inventory',
              action,
              scope,
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
  mocks.unitFindMany.mockResolvedValue([unit]);
  mocks.unitFindUnique.mockResolvedValue(unit);
  mocks.unitFindUniqueOrThrow.mockResolvedValue(unit);
  mocks.unitCount.mockResolvedValue(1);
  mocks.unitCreate.mockImplementation(({ data }: { data: object }) => ({ ...unit, ...data }));
  mocks.unitUpdate.mockImplementation(({ data }: { data: object }) => ({ ...unit, ...data }));
  mocks.eventFindMany.mockResolvedValue([]);
  mocks.eventCount.mockResolvedValue(0);
  mocks.eventCreate.mockResolvedValue({ id: 'event-id' });
  mocks.orderCount.mockResolvedValue(0);
  mocks.transferCount.mockResolvedValue(0);
  mocks.blockCount.mockResolvedValue(0);
  mocks.queryRaw.mockResolvedValue([
    {
      id: unitId,
      status: 'ACTIVE',
      variantStatus: 'ACTIVE',
      modelStatus: 'ACTIVE',
      categoryStatus: 'ACTIVE',
    },
  ]);
  const tx = {
    $queryRaw: mocks.queryRaw,
    costumeUnit: {
      findMany: mocks.unitFindMany,
      findUnique: mocks.unitFindUnique,
      findUniqueOrThrow: mocks.unitFindUniqueOrThrow,
      count: mocks.unitCount,
      create: mocks.unitCreate,
      update: mocks.unitUpdate,
    },
    unitEvent: {
      findMany: mocks.eventFindMany,
      count: mocks.eventCount,
      create: mocks.eventCreate,
    },
    rentalOrderItem: { count: mocks.orderCount },
    stockTransferItem: { count: mocks.transferCount },
    unitBlock: { count: mocks.blockCount },
  };
  mocks.transaction.mockImplementation(
    (work: Promise<unknown>[] | ((transaction: typeof tx) => Promise<unknown>)) =>
      Array.isArray(work) ? Promise.all(work) : work(tx),
  );
});

describe('Inventory unit API', () => {
  it('requires authentication and uses separate read/manage permissions', async () => {
    await request(createApp()).get('/api/v1/inventory/units').expect(401);
    mocks.actor.mockResolvedValue(account(['manage']));
    await request(createApp())
      .get('/api/v1/inventory/units')
      .auth(await token(), { type: 'bearer' })
      .expect(403);
    mocks.actor.mockResolvedValue(account(['read']));
    await request(createApp())
      .post('/api/v1/inventory/units')
      .auth(await token(), { type: 'bearer' })
      .send({ unitCode: 'unit-002', variantId, branchId })
      .expect(403);
    mocks.actor.mockResolvedValue({ ...account(), status: 'INACTIVE' });
    await request(createApp())
      .get('/api/v1/inventory/units')
      .auth(await token(), { type: 'bearer' })
      .expect(401);
  });

  it('lists with filters, pagination, whitelisted sort, and branch scope', async () => {
    mocks.actor.mockResolvedValue(account(['read'], 'BRANCH'));
    await request(createApp())
      .get(
        '/api/v1/inventory/units?search=unit&operationalStatus=READY&page=2&pageSize=5&sortBy=unitCode&sortOrder=asc',
      )
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    expect(mocks.unitFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { currentBranchId: { in: [branchId] }, operationalStatus: 'READY' },
      orderBy: [{ unitCode: 'asc' }, { id: 'asc' }],
      skip: 5,
      take: 5,
    });
    await request(createApp())
      .get('/api/v1/inventory/units?branchId=' + otherBranchId)
      .auth(await token(), { type: 'bearer' })
      .expect(403);
    await request(createApp())
      .get('/api/v1/inventory/units?sortBy=retiredAt')
      .auth(await token(), { type: 'bearer' })
      .expect(400);
  });

  it('creates uppercase inbound units and records acquisition atomically', async () => {
    await request(createApp())
      .post('/api/v1/inventory/units')
      .auth(await token(), { type: 'bearer' })
      .send({ unitCode: 'unit-002', variantId, branchId, acquisitionCostVnd: '150000' })
      .expect(201);
    expect(mocks.unitCreate.mock.calls[0]?.[0]).toMatchObject({
      data: { unitCode: 'UNIT-002', conditionGrade: 'UNINSPECTED', operationalStatus: 'INBOUND' },
    });
    expect(mocks.eventCreate.mock.calls[0]?.[0] as unknown).toMatchObject({
      data: { eventType: 'ACQUIRED', toBranchId: branchId },
    });
    mocks.unitCreate.mockRejectedValueOnce({ code: 'P2002' });
    const duplicate = await request(createApp())
      .post('/api/v1/inventory/units')
      .auth(await token(), { type: 'bearer' })
      .send({ unitCode: 'unit-002', variantId, branchId });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as ErrorResponse).error.code).toBe('UNIT_CODE_CONFLICT');
  });

  it('reads details and allows only acquisition metadata PATCH fields', async () => {
    await request(createApp())
      .get(`/api/v1/inventory/units/${unitId}`)
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    await request(createApp())
      .patch(`/api/v1/inventory/units/${unitId}`)
      .auth(await token(), { type: 'bearer' })
      .send({ conditionNotes: 'relabelled', operationalStatus: 'READY' })
      .expect(400);
    await request(createApp())
      .patch(`/api/v1/inventory/units/${unitId}`)
      .auth(await token(), { type: 'bearer' })
      .send({ conditionNotes: 'relabelled' })
      .expect(200);
  });

  it('inspects inbound units once and records the inspection', async () => {
    await request(createApp())
      .post(`/api/v1/inventory/units/${unitId}/inspect`)
      .auth(await token(), { type: 'bearer' })
      .send({ conditionGrade: 'GOOD', nextStatus: 'READY', notes: 'passed' })
      .expect(200);
    expect(mocks.eventCreate.mock.calls[0]?.[0] as unknown).toMatchObject({
      data: { eventType: 'INSPECTED' },
    });
    mocks.unitFindUniqueOrThrow.mockResolvedValueOnce({ ...unit, operationalStatus: 'READY' });
    await request(createApp())
      .post(`/api/v1/inventory/units/${unitId}/inspect`)
      .auth(await token(), { type: 'bearer' })
      .send({ conditionGrade: 'GOOD', nextStatus: 'READY' })
      .expect(409);
  });

  it('enforces the operational status transition matrix', async () => {
    mocks.unitFindUnique.mockResolvedValue({ ...unit, operationalStatus: 'READY' });
    mocks.unitFindUniqueOrThrow.mockResolvedValue({ ...unit, operationalStatus: 'READY' });
    await request(createApp())
      .post(`/api/v1/inventory/units/${unitId}/status`)
      .auth(await token(), { type: 'bearer' })
      .send({ targetStatus: 'CLEANING' })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/inventory/units/${unitId}/status`)
      .auth(await token(), { type: 'bearer' })
      .send({ targetStatus: 'RETIRED' })
      .expect(400);
  });

  it('retires only units without active operational references', async () => {
    mocks.unitFindUnique.mockResolvedValue({ ...unit, operationalStatus: 'READY' });
    mocks.unitFindUniqueOrThrow.mockResolvedValue({ ...unit, operationalStatus: 'READY' });
    mocks.orderCount.mockResolvedValueOnce(1);
    const blocked = await request(createApp())
      .post(`/api/v1/inventory/units/${unitId}/retire`)
      .auth(await token(), { type: 'bearer' })
      .send({ notes: 'damaged beyond repair' });
    expect(blocked.status).toBe(409);
    expect((blocked.body as ErrorResponse).error.code).toBe('UNIT_IN_USE');
    await request(createApp())
      .post(`/api/v1/inventory/units/${unitId}/retire`)
      .auth(await token(), { type: 'bearer' })
      .send({ notes: 'damaged beyond repair' })
      .expect(200);
  });

  it('lists events without exposing recorder credentials', async () => {
    mocks.eventFindMany.mockResolvedValueOnce([
      {
        id: 'event-id',
        unitId,
        eventType: 'INSPECTED',
        occurredAt: new Date('2026-10-15T10:00:00.000Z'),
        recorder: {
          employeeCode: 'EMP-001',
          user: {
            id: actorId,
            displayName: 'Inventory staff',
            avatarUrl: null,
            passwordHash: 'secret-hash',
            emailVerifiedAt: new Date('2026-10-15T10:00:00.000Z'),
            authIdentities: [{ providerSubject: 'private-subject' }],
          },
        },
      },
    ]);
    const response = await request(createApp())
      .get(`/api/v1/inventory/units/${unitId}/events?page=1&pageSize=10`)
      .auth(await token(), { type: 'bearer' })
      .expect(200);

    const eventResponse = response.body as {
      data: {
        items: {
          recorder: {
            employeeCode: string;
            user: { id: string; displayName: string; avatarUrl: string | null };
          } | null;
        }[];
      };
    };
    expect(eventResponse.data.items[0]?.recorder).toEqual({
      employeeCode: 'EMP-001',
      user: { id: actorId, displayName: 'Inventory staff', avatarUrl: null },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|emailVerifiedAt|authIdentities|secret-hash|private-subject/,
    );
    const query = mocks.eventFindMany.mock.calls[0]?.[0] as {
      include: { recorder: { select: Record<string, unknown> } };
    };
    expect(query).toMatchObject({
      where: { unitId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      include: {
        recorder: {
          select: {
            employeeCode: true,
            user: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });
  });
});
