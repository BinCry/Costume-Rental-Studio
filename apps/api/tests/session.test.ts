/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unused-vars */
import { argon2id, hash } from 'argon2';
import request from 'supertest';
import { SignJWT, decodeJwt } from 'jose';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.WEB_URL = 'http://localhost:3000';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = 'session-test-secret-not-for-production-123456';
const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  findSession: vi.fn(),
  findActiveSession: vi.fn(),
  createSession: vi.fn(),
  updateSessions: vi.fn(),
  findSessions: vi.fn(),
  revokeSessions: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    refreshSession: {
      findMany: mocks.findSessions,
      findFirst: mocks.findActiveSession,
      updateMany: mocks.revokeSessions,
    },
    $transaction: mocks.transaction,
  },
}));
const { createApp } = await import('../src/app.js');
const { authenticatedActorSelect } = await import('../src/modules/auth/authorization.js');
const { login, refresh, logout, listSessions, revokeAllSessions, revokeSession, currentUser } =
  await import('../src/modules/auth/session/session.service.js');
const { env } = await import('../src/config/env.js');
const email = 'customer@example.com';
const password = 'a-long-enough-test-password';
const userId = '10000000-0000-4000-8000-000000000001';
let passwordHash: string;
interface Session {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  deviceId?: string | null;
  deviceName?: string | null;
  userAgent?: string | null;
  lastIp?: string | null;
  familyCreatedAt?: Date;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}
let sessions: Session[];
let account: any;
const tx = {
  user: { updateMany: mocks.updateUser },
  $queryRaw: mocks.lock,
  refreshSession: {
    findUnique: mocks.findSession,
    create: mocks.createSession,
    updateMany: mocks.updateSessions,
  },
};
beforeAll(async () => {
  passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
});
beforeEach(() => {
  vi.resetAllMocks();
  sessions = [];
  account = {
    id: userId,
    email,
    phone: null,
    displayName: 'Customer',
    status: 'ACTIVE',
    passwordHash,
    emailVerifiedAt: new Date(),
    avatarUrl: null,
    employee: null,
    roleAssignments: [
      {
        branchId: null,
        branch: null,
        role: {
          roleCode: 'CUSTOMER',
          name: 'Customer',
          actorGroup: 'CUSTOMER',
          isActive: true,
          rolePermissions: [
            {
              permission: {
                code: 'orders.read.own',
                module: 'orders',
                action: 'read',
                scope: 'OWN',
              },
            },
          ],
        },
      },
    ],
    internalNote: 'private',
  };
  mocks.findUser.mockImplementation(({ where }: { where: { email?: string; id?: string } }) =>
    where.email === email || where.id === userId ? account : null,
  );
  mocks.findActiveSession.mockImplementation(
    ({ where }: { where: { userId: string; familyId: string; expiresAt: { gt: Date } } }) =>
      sessions.find(
        (session) =>
          session.userId === where.userId &&
          session.familyId === where.familyId &&
          session.usedAt === null &&
          session.revokedAt === null &&
          session.expiresAt > where.expiresAt.gt,
      ) ?? null,
  );
  mocks.updateUser.mockResolvedValue({ count: 1 });
  let queue = Promise.resolve();
  mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => {
    const result = queue.then(() => callback(tx));
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  });
  mocks.createSession.mockImplementation(
    ({ data }: { data: Omit<Session, 'id' | 'createdAt' | 'usedAt' | 'revokedAt'> }) => {
      const session = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        usedAt: null,
        revokedAt: null,
      };
      sessions.push(session);
      return session;
    },
  );
  mocks.findSession.mockImplementation(({ where }: { where: { tokenHash: string } }) => {
    const session = sessions.find((entry) => entry.tokenHash === where.tokenHash);
    return session ? { ...session, user: account } : null;
  });
  mocks.updateSessions.mockImplementation(({ where, data }: { where: any; data: any }) => {
    let count = 0;
    for (const session of sessions) {
      if (where.id && session.id !== where.id) continue;
      if (where.familyId && session.familyId !== where.familyId) continue;
      if (where.usedAt === null && session.usedAt !== null) continue;
      if (where.revokedAt === null && session.revokedAt !== null) continue;
      Object.assign(session, data);
      count++;
    }
    return { count };
  });
  mocks.findSessions.mockImplementation(({ where }: { where: any }) =>
    sessions
      .filter((s) => s.userId === where.userId && s.usedAt === null && s.revokedAt === null)
      .map((s) => ({ ...s })),
  );
  mocks.revokeSessions.mockImplementation(({ where, data }: { where: any; data: any }) => {
    let count = 0;
    for (const s of sessions) {
      if (where.userId && s.userId !== where.userId) continue;
      if (where.familyId && s.familyId !== where.familyId) continue;
      if (where.revokedAt === null && s.revokedAt !== null) continue;
      Object.assign(s, data);
      count++;
    }
    return { count };
  });
});

describe('email/password login', () => {
  it('returns both customer and staff roles after an existing customer is enrolled as staff', () => {
    const enrolledAccount = {
      ...account,
      employee: { employmentStatus: 'ACTIVE' },
      roleAssignments: [
        ...account.roleAssignments,
        {
          branchId: 'branch-1',
          branch: { status: 'ACTIVE' },
          role: {
            roleCode: 'SALES_STAFF',
            name: 'Nhân viên bán hàng',
            actorGroup: 'STAFF',
            isActive: true,
            rolePermissions: [],
          },
        },
      ],
    };

    expect(currentUser(enrolledAccount as never).roles.map((role) => role.actorGroup)).toEqual([
      'CUSTOMER',
      'STAFF',
    ]);
  });

  it('verifies email password, stores only hashed refresh token and metadata', async () => {
    const result = await login({ email, password }, { deviceName: 'Browser', ip: '198.51.100.1' });
    expect(result.user.email).toBe(email);
    expect(sessions[0]).toMatchObject({ deviceName: 'Browser', lastIp: '198.51.100.1' });
    expect(JSON.stringify(result)).not.toContain(passwordHash);
  });
  it.each([
    { emailVerifiedAt: null },
    { passwordHash: null },
    { status: 'LOCKED' },
    { employee: { employmentStatus: 'TERMINATED' } },
  ])('requires an eligible verified account: %j', async (change) => {
    account = { ...account, ...change };
    await expect(login({ email, password })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
  it('does not reveal unknown email or wrong password', async () => {
    await expect(login({ email: 'missing@example.com', password })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    account.passwordHash = await hash('different', {
      type: argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    await expect(login({ email, password })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});
describe('session lifecycle', () => {
  it('rotates refresh tokens and revokes all sessions', async () => {
    const first = await login({ email, password });
    const rotated = await refresh(first.refreshToken);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    expect(sessions).toHaveLength(2);
    await revokeAllSessions(userId);
    expect(sessions.every((s) => s.revokedAt)).toBe(true);
  });
  it('revokes selected family and rejects replay', async () => {
    const first = await login({ email, password });
    const second = await login({ email, password });
    await revokeSession(userId, sessions[0]!.familyId);
    expect(sessions[0]!.revokedAt).toBeInstanceOf(Date);
    expect(sessions[1]!.revokedAt).toBeNull();
    await expect(refresh(first.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    await logout(second.refreshToken);
    expect(sessions[1]!.revokedAt).toBeInstanceOf(Date);
  });
});
describe('access token session binding', () => {
  const me = (token: string) =>
    request(createApp()).get('/api/v1/auth/me').auth(token, { type: 'bearer' });

  it('rejects the copied access token after HTTP logout and preserves another login', async () => {
    const first = await login({ email, password });
    const other = await login({ email, password });
    await me(first.accessToken).expect(200);
    await request(createApp())
      .post('/api/v1/auth/logout')
      .set('Cookie', 'refreshToken=' + first.refreshToken)
      .expect(200);
    const rejected = await me(first.accessToken).expect(401);
    expect(rejected.body.error.code).toBe('INVALID_ACCESS_TOKEN');
    await request(createApp())
      .post('/api/v1/knowledge/answer')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ query: 'Tôi trả đồ ở đâu?' })
      .expect(401);
    await me(other.accessToken).expect(200);
  });

  it('keeps both tabs valid after rotation and revokes both when logging out with the shared cookie', async () => {
    const first = await login({ email, password });
    const rotated = await refresh(first.refreshToken);
    expect(decodeJwt(rotated.accessToken).sid).toBe(sessions[0]!.familyId);
    await me(first.accessToken).expect(200);
    await me(rotated.accessToken).expect(200);
    await logout(rotated.refreshToken);
    await me(first.accessToken).expect(401);
    await me(rotated.accessToken).expect(401);
  });

  it('revokes rotated access tokens when an old refresh token is replayed', async () => {
    const first = await login({ email, password });
    const rotated = await refresh(first.refreshToken);
    await expect(refresh(first.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    await me(first.accessToken).expect(401);
    await me(rotated.accessToken).expect(401);
  });

  it('applies explicit session revocation and logout-all to access tokens', async () => {
    const first = await login({ email, password });
    const other = await login({ email, password });
    await revokeSession(userId, sessions[0]!.familyId);
    await me(first.accessToken).expect(401);
    await me(other.accessToken).expect(200);
    await revokeAllSessions(userId);
    await me(other.accessToken).expect(401);
  });

  it('keeps access revoked when refresh and logout race', async () => {
    const first = await login({ email, password });
    const [rotated] = await Promise.all([refresh(first.refreshToken), logout(first.refreshToken)]);
    await me(first.accessToken).expect(401);
    await me(rotated.accessToken).expect(401);
  });

  it('rejects expired and missing session families', async () => {
    const first = await login({ email, password });
    sessions[0]!.expiresAt = new Date(0);
    await me(first.accessToken).expect(401);
    sessions = [];
    await me(first.accessToken).expect(401);
  });

  it('does not accept another user session family', async () => {
    const first = await login({ email, password });
    sessions[0]!.userId = '20000000-0000-4000-8000-000000000001';
    await me(first.accessToken).expect(401);
  });

  it('rejects legacy access tokens while allowing their refresh cookie to upgrade', async () => {
    const first = await login({ email, password });
    const legacy = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(env.JWT_ISSUER)
      .setAudience(env.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
    await me(legacy).expect(401);
    const rotated = await refresh(first.refreshToken);
    await me(rotated.accessToken).expect(200);
  });
});

describe('auth HTTP contract', () => {
  it('returns the current user using the minimal authenticated actor query', async () => {
    const response = await request(createApp())
      .get('/api/v1/auth/me')
      .auth((await login({ email, password })).accessToken, { type: 'bearer' })
      .expect(200);

    expect(mocks.findActiveSession).toHaveBeenLastCalledWith({
      where: {
        userId,
        familyId: sessions[0]!.familyId,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      select: { id: true },
    });
    expect(response.body.data).toMatchObject({
      id: userId,
      displayName: 'Customer',
      email,
      roles: [
        {
          roleCode: 'CUSTOMER',
          name: 'Customer',
          actorGroup: 'CUSTOMER',
          permissions: [{ code: 'orders.read.own', scope: 'OWN' }],
        },
      ],
    });
    expect(mocks.findUser).toHaveBeenLastCalledWith({
      where: { id: userId },
      select: authenticatedActorSelect,
    });
  });

  it('logs in by email and sets HttpOnly cookie without refresh token JSON', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'CUSTOMER@EXAMPLE.COM', password })
      .expect(200);
    expect(response.body as unknown).not.toHaveProperty('data.refreshToken');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('HttpOnly')]),
    );
  });
  it('requires email and rejects phone login/extra fields', async () => {
    await request(createApp())
      .post('/api/v1/auth/login')
      .send({ phone: '+84901234567', password })
      .expect(400);
    await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email, password, role: 'ADMIN' })
      .expect(400);
  });
  it.each(['/login', '/refresh', '/logout'])(
    'rejects untrusted origin on %s before DB work',
    async (path) => {
      await request(createApp())
        .post(`/api/v1/auth${path}`)
        .set('Origin', 'https://untrusted.example')
        .send({ email, password })
        .expect(403);
      expect(mocks.findUser).not.toHaveBeenCalled();
    },
  );
  it('clears cookie when refresh is rejected and supports logout without cookie', async () => {
    const rejected = await request(createApp())
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refreshToken=invalid')
      .expect(401);
    expect(rejected.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('Expires=Thu, 01 Jan 1970')]),
    );
    const loggedOut = await request(createApp()).post('/api/v1/auth/logout').expect(200);
    expect(loggedOut.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('Expires=Thu, 01 Jan 1970')]),
    );
  });
  it('limits failed password logins without throttling session refreshes or successful customers', async () => {
    const app = createApp();
    app.set('trust proxy', 1);

    const customerIp = '198.51.100.40';
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('X-Forwarded-For', customerIp)
        .expect(401);
    }
    await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', customerIp)
      .send({ email, password })
      .expect(200);

    const attackerIp = '198.51.100.41';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', attackerIp)
        .send({ email, password: `${password}-incorrect` })
        .expect(401);
    }
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', attackerIp)
      .send({ email, password: `${password}-incorrect` })
      .expect(429);
    expect(blocked.body).toMatchObject({
      success: false,
      error: { code: 'AUTH_RATE_LIMITED' },
    });
  });
});
