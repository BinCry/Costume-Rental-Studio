/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { argon2id, hash, verify } from 'argon2';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.WEB_URL = 'http://localhost:3000';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = 'password-change-test-secret-not-production-123456';

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
  updateSessions: vi.fn(),
  deleteEmailChanges: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    $transaction: mocks.transaction,
  },
}));

const { createApp } = await import('../src/app.js');
const { changePassword } = await import('../src/modules/auth/session/session.service.js');
const { issueAccessToken } = await import('../src/modules/auth/token.service.js');

const userId = '10000000-0000-4000-8000-000000000001';
const currentPassword = 'current-password-123';
const newPassword = 'new-password-456';
let currentHash: string;
let account: any;

const tx = {
  $queryRaw: mocks.lock,
  user: { updateMany: mocks.updateUser },
  refreshSession: { updateMany: mocks.updateSessions },
  emailChangeChallenge: { deleteMany: mocks.deleteEmailChanges },
};

beforeAll(async () => {
  currentHash = await hash(currentPassword, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
});

beforeEach(() => {
  vi.resetAllMocks();
  account = {
    id: userId,
    email: 'customer@example.com',
    phone: null,
    displayName: 'Customer',
    avatarUrl: null,
    status: 'ACTIVE',
    passwordHash: currentHash,
    emailVerifiedAt: new Date(),
    employee: null,
    roleAssignments: [],
  };
  mocks.findUser.mockResolvedValue(account);
  mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  mocks.updateUser.mockImplementation(({ where, data }: { where: any; data: any }) => {
    if (where.id !== account.id || where.passwordHash !== account.passwordHash) return { count: 0 };
    account.passwordHash = data.passwordHash;
    return { count: 1 };
  });
  mocks.updateSessions.mockResolvedValue({ count: 2 });
  mocks.deleteEmailChanges.mockResolvedValue({ count: 1 });
});

describe('change password', () => {
  it('replaces the password and revokes every refresh session', async () => {
    await changePassword(userId, { currentPassword, newPassword });

    expect(await verify(account.passwordHash, newPassword)).toBe(true);
    expect(mocks.updateSessions).toHaveBeenCalledWith({
      where: { userId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects an incorrect or unchanged password without writing', async () => {
    await expect(
      changePassword(userId, { currentPassword: 'incorrect-password', newPassword }),
    ).rejects.toMatchObject({ code: 'INVALID_CURRENT_PASSWORD' });
    await expect(
      changePassword(userId, { currentPassword, newPassword: currentPassword }),
    ).rejects.toMatchObject({ code: 'PASSWORD_UNCHANGED' });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.updateSessions).not.toHaveBeenCalled();
  });

  it('does not overwrite a concurrent credential change', async () => {
    mocks.updateUser.mockResolvedValueOnce({ count: 0 });
    await expect(changePassword(userId, { currentPassword, newPassword })).rejects.toMatchObject({
      code: 'INVALID_CURRENT_PASSWORD',
    });
    expect(mocks.updateSessions).not.toHaveBeenCalled();
  });

  it('requires authentication, changes the password, and clears the refresh cookie', async () => {
    await request(createApp())
      .post('/api/v1/auth/change-password')
      .send({ currentPassword, newPassword })
      .expect(401);

    const accessToken = await issueAccessToken(userId);
    const response = await request(createApp())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword, newPassword })
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('Expires=Thu, 01 Jan 1970')]),
    );
  });
});
