/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unused-vars */
import { argon2id, hash } from 'argon2';
import request from 'supertest';
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
  createSession: vi.fn(),
  updateSessions: vi.fn(),
  findSessions: vi.fn(),
  revokeSessions: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    refreshSession: { findMany: mocks.findSessions, updateMany: mocks.revokeSessions },
    $transaction: mocks.transaction,
  },
}));
const { createApp } = await import('../src/app.js');
const { login, refresh, logout, listSessions, revokeAllSessions, revokeSession } =
  await import('../src/modules/auth/session/session.service.js');
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
  mocks.findUser.mockImplementation(({ where }: { where: { email?: string } }) =>
    where.email === email ? account : null,
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
describe('auth HTTP contract', () => {
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
});
