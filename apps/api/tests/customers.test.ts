import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.JWT_ACCESS_SECRET = 'customer-test-key-only-not-for-production-12345';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  transaction: vi.fn(),
  branch: vi.fn(),
  queryRaw: vi.fn(),
  findUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  updateCustomer: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.actor },
    $transaction: mocks.transaction,
  },
}));
const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const branchId = '10000000-0000-4000-8000-000000000001';
const actorId = '10000000-0000-4000-8000-000000000002';
const userId = '10000000-0000-4000-8000-000000000003';
const input = {
  branchId,
  displayName: ' Customer ',
  phone: '0901234567',
  email: 'CUSTOMER@EXAMPLE.COM',
};
const existing = {
  id: userId,
  status: 'ACTIVE',
  displayName: 'Original name',
  phone: '+84901234567',
  email: 'customer@example.com',
  customer: { customerCode: 'CUS-001', preferredBranchId: branchId },
};

interface ResultBody {
  data: { created: boolean; customer: { displayName: string } };
}
interface MockTransaction {
  $queryRaw: typeof mocks.queryRaw;
  branch: { findUnique: typeof mocks.branch };
  user: {
    findUnique: typeof mocks.findUser;
    create: typeof mocks.createUser;
    update: typeof mocks.updateUser;
  };
  customer: { update: typeof mocks.updateCustomer };
}

async function token(options: { expired?: boolean; secret?: string; audience?: string } = {}) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(actorId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(options.audience ?? env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expired ? '0s' : '15m')
    .sign(new TextEncoder().encode(options.secret ?? env.JWT_ACCESS_SECRET));
}
function actor(
  roleCode = 'SALES_STAFF',
  scope = 'BRANCH',
  assignedBranch: string | null = branchId,
) {
  return {
    id: actorId,
    status: 'ACTIVE',
    employee: { employmentStatus: 'ACTIVE' },
    roleAssignments: [
      {
        branchId: assignedBranch,
        branch: { status: 'ACTIVE' },
        role: {
          isActive: true,
          roleCode,
          rolePermissions: [{ permission: { module: 'customers', action: 'create', scope } }],
        },
      },
    ],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue(actor());
  mocks.branch.mockResolvedValue({ id: branchId, status: 'ACTIVE' });
  mocks.queryRaw.mockImplementation(async () => {
    const branch = (await mocks.branch()) as unknown as { id: string; status: string } | null;
    return branch ? [branch] : [];
  });
  mocks.findUser.mockResolvedValue(null);
  mocks.createUser.mockResolvedValue({ ...existing, displayName: 'Customer' });
  mocks.updateUser.mockResolvedValue({ ...existing, displayName: 'Updated name' });
  mocks.updateCustomer.mockResolvedValue(existing.customer);
  mocks.transaction.mockImplementation((callback: (tx: MockTransaction) => Promise<unknown>) =>
    callback({
      $queryRaw: mocks.queryRaw,
      branch: { findUnique: mocks.branch },
      user: { findUnique: mocks.findUser, create: mocks.createUser, update: mocks.updateUser },
      customer: { update: mocks.updateCustomer },
    }),
  );
});

describe('POST /api/v1/customers', () => {
  it('rejects unauthenticated callers without accessing the database', async () => {
    await request(createApp()).post('/api/v1/customers').send(input).expect(401);
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([
    { expired: true },
    { secret: 'different-secret-key-for-test-only-12345' },
    { audience: 'other-app' },
  ])('rejects invalid JWT %j', async (options) => {
    await request(createApp())
      .post('/api/v1/customers')
      .auth(await token(options), { type: 'bearer' })
      .send(input)
      .expect(401);
    expect(mocks.actor).not.toHaveBeenCalled();
  });
  it('creates a customer while normalizing contacts', async () => {
    const response = await request(createApp())
      .post('/api/v1/customers')
      .auth(await token(), { type: 'bearer' })
      .send(input)
      .expect(201);
    expect((response.body as ResultBody).data.created).toBe(true);
    const call = mocks.createUser.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(call.data).toMatchObject({
      displayName: 'Customer',
      phone: '+84901234567',
      email: 'customer@example.com',
      status: 'ACTIVE',
      customer: { create: { preferredBranchId: branchId } },
    });
  });
  it('reuses customer by phone without updating identity or profile', async () => {
    mocks.findUser.mockResolvedValue(existing);
    const response = await request(createApp())
      .post('/api/v1/customers')
      .auth(await token(), { type: 'bearer' })
      .send(input)
      .expect(200);
    expect((response.body as ResultBody).data.customer.displayName).toBe('Original name');
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it.each(['CUSTOMER', 'INVENTORY_STAFF'])('denies %s', async (roleCode) => {
    mocks.actor.mockResolvedValue(actor(roleCode));
    await request(createApp())
      .post('/api/v1/customers')
      .auth(await token(), { type: 'bearer' })
      .send(input)
      .expect(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('denies another branch', async () => {
    await request(createApp())
      .post('/api/v1/customers')
      .auth(await token(), { type: 'bearer' })
      .send({ ...input, branchId: actorId })
      .expect(403);
  });
  it('allows a global admin with ALL permission', async () => {
    mocks.actor.mockResolvedValue(actor('ADMIN', 'ALL', null));
    await request(createApp())
      .post('/api/v1/customers')
      .auth(await token(), { type: 'bearer' })
      .send(input)
      .expect(201);
  });
  it('rejects locked users', async () => {
    mocks.actor.mockResolvedValue({ ...actor(), status: 'LOCKED' });
    await request(createApp())
      .post('/api/v1/customers')
      .auth(await token(), { type: 'bearer' })
      .send(input)
      .expect(401);
  });
  it.each([{ role: 'ADMIN' }, { birthday: '2099-01-01' }, { heightCm: -1 }, { phone: 'invalid' }])(
    'rejects invalid or privileged fields %j',
    async (extra) => {
      await request(createApp())
        .post('/api/v1/customers')
        .auth(await token(), { type: 'bearer' })
        .send({ ...input, ...extra })
        .expect(400);
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );
  it('rejects an inactive branch', async () => {
    mocks.branch.mockResolvedValue({ status: 'INACTIVE' });
    await request(createApp())
      .post('/api/v1/customers')
      .auth(await token(), { type: 'bearer' })
      .send(input)
      .expect(400);
  });
  it('does not attach an email owned by another user', async () => {
    mocks.findUser.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    await request(createApp())
      .post('/api/v1/customers')
      .auth(await token(), { type: 'bearer' })
      .send(input)
      .expect(409);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it('retries a concurrent duplicate phone in a fresh transaction', async () => {
    mocks.createUser.mockRejectedValueOnce({ code: 'P2002' });
    mocks.findUser
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const response = await request(createApp())
      .post('/api/v1/customers')
      .auth(await token(), { type: 'bearer' })
      .send(input)
      .expect(200);
    expect((response.body as ResultBody).data.created).toBe(false);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
});

describe('PATCH /api/v1/customers/me', () => {
  it('saves a customer phone and normalizes it for future rental forms', async () => {
    const ownProfile = {
      ...existing,
      id: actorId,
      authIdentities: [],
      customer: { customerCode: 'CUS-SELF', preferredBranchId: branchId },
    };
    mocks.actor.mockResolvedValueOnce(actor()).mockResolvedValueOnce(ownProfile);
    mocks.updateUser.mockResolvedValue({
      ...ownProfile,
      displayName: 'Updated name',
      phone: '+84901234567',
    });

    const response = await request(createApp())
      .patch('/api/v1/customers/me')
      .auth(await token(), { type: 'bearer' })
      .send({ displayName: 'Updated name', phone: '0901234567' })
      .expect(200);

    expect(response.body.data).toMatchObject({
      displayName: 'Updated name',
      phone: '+84901234567',
      email: 'customer@example.com',
    });
    expect(mocks.updateUser).toHaveBeenCalledWith({
      where: { id: actorId },
      data: { displayName: 'Updated name', email: undefined, phone: '+84901234567' },
    });
  });
});
