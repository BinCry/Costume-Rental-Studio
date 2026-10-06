/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { argon2id, hash } from 'argon2';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.OTP_DELIVERY_MODE = 'console';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = 'email-change-test-secret-not-production-123456';
process.env.OTP_HASH_SECRET = 'email-change-otp-secret-not-production-123456';
process.env.WEB_URL = 'http://localhost:3000';

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
  findChallenge: vi.fn(),
  upsertChallenge: vi.fn(),
  updateChallenge: vi.fn(),
  updateChallenges: vi.fn(),
  updateSessions: vi.fn(),
  deletePasswordResets: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  deliver: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    emailChangeChallenge: {
      findUnique: mocks.findChallenge,
      updateMany: mocks.updateChallenges,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('../src/modules/auth/registration/otp.delivery.js', () => ({
  assertEmailOtpDeliveryAvailable: vi.fn(),
  deliverEmailOtp: mocks.deliver,
}));

const { createApp } = await import('../src/app.js');
const { confirmEmailChange, requestEmailChange } =
  await import('../src/modules/auth/email-change/email-change.service.js');
const { issueAccessToken } = await import('../src/modules/auth/token.service.js');

const userId = '10000000-0000-4000-8000-000000000001';
const currentEmail = 'customer@example.com';
const newEmail = 'new@example.com';
const currentPassword = 'current-password-123';
let passwordHash: string;
let account: any;
let challenge: any;
let deliveredCode = '';

const tx = {
  $queryRaw: mocks.lock,
  user: { findUnique: mocks.findUser, updateMany: mocks.updateUser },
  emailChangeChallenge: {
    findUnique: mocks.findChallenge,
    upsert: mocks.upsertChallenge,
    update: mocks.updateChallenge,
  },
  refreshSession: { updateMany: mocks.updateSessions },
  passwordResetChallenge: { deleteMany: mocks.deletePasswordResets },
};

beforeAll(async () => {
  passwordHash = await hash(currentPassword, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
});

beforeEach(() => {
  vi.resetAllMocks();
  deliveredCode = '';
  challenge = null;
  account = {
    id: userId,
    email: currentEmail,
    phone: null,
    displayName: 'Customer',
    avatarUrl: null,
    status: 'ACTIVE',
    passwordHash,
    emailVerifiedAt: new Date(),
    employee: null,
    roleAssignments: [],
  };
  mocks.findUser.mockImplementation(({ where }: { where: { id?: string; email?: string } }) => {
    if (where.id) return where.id === account.id ? account : null;
    if (where.email) return where.email === account.email ? account : null;
    return null;
  });
  mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  mocks.findChallenge.mockImplementation(({ where, include }: { where: any; include?: any }) => {
    const found =
      (where.id && challenge?.id === where.id) ||
      (where.userId && challenge?.userId === where.userId)
        ? challenge
        : null;
    return found && include ? { ...found, user: account } : found;
  });
  mocks.upsertChallenge.mockImplementation(({ create, update }: { create: any; update: any }) => {
    challenge = challenge ? { ...challenge, ...update } : { ...create };
    return challenge;
  });
  mocks.updateChallenge.mockImplementation(({ data }: { data: any }) => {
    if (data.attemptCount?.increment) challenge.attemptCount += data.attemptCount.increment;
    else Object.assign(challenge, data);
    return challenge;
  });
  mocks.updateChallenges.mockImplementation(({ where, data }: { where: any; data: any }) => {
    if (!challenge || challenge.id !== where.id || challenge.userId !== where.userId) {
      return { count: 0 };
    }
    Object.assign(challenge, data);
    return { count: 1 };
  });
  mocks.updateUser.mockImplementation(({ where, data }: { where: any; data: any }) => {
    if (where.id !== account.id || where.email !== account.email) return { count: 0 };
    Object.assign(account, data);
    return { count: 1 };
  });
  mocks.updateSessions.mockResolvedValue({ count: 2 });
  mocks.deletePasswordResets.mockResolvedValue({ count: 1 });
  mocks.deliver.mockImplementation((_email: string, code: string) => {
    deliveredCode = code;
  });
});

describe('email change', () => {
  it('verifies the current password and sends an OTP to the new email', async () => {
    const result = await requestEmailChange(userId, { newEmail, currentPassword });

    expect(result).toMatchObject({ challengeId: challenge.id, expiresIn: 300, retryAfter: 60 });
    expect(mocks.deliver).toHaveBeenCalledWith(
      newEmail,
      expect.stringMatching(/^\d{6}$/),
      'email-change',
    );
    expect(challenge.sentAt).toBeInstanceOf(Date);
    expect(account.email).toBe(currentEmail);
  });

  it('rejects an incorrect password, unchanged email, and an email already in use', async () => {
    await expect(
      requestEmailChange(userId, { newEmail, currentPassword: 'incorrect-password' }),
    ).rejects.toMatchObject({ code: 'INVALID_CURRENT_PASSWORD' });
    await expect(
      requestEmailChange(userId, { newEmail: currentEmail, currentPassword }),
    ).rejects.toMatchObject({ code: 'EMAIL_UNCHANGED' });

    const originalFindUser = mocks.findUser.getMockImplementation();
    mocks.findUser.mockImplementation((args: any) => {
      if (args.where.email === newEmail) return { id: '20000000-0000-4000-8000-000000000002' };
      return originalFindUser?.(args);
    });
    await expect(requestEmailChange(userId, { newEmail, currentPassword })).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_IN_USE',
    });
  });

  it('increments attempts for a wrong OTP without changing email', async () => {
    const result = await requestEmailChange(userId, { newEmail, currentPassword });
    await expect(
      confirmEmailChange(userId, { challengeId: result.challengeId, otp: '000000' }),
    ).rejects.toMatchObject({ code: 'INVALID_OTP' });

    expect(challenge.attemptCount).toBe(1);
    expect(account.email).toBe(currentEmail);
    expect(mocks.updateSessions).not.toHaveBeenCalled();
  });

  it('enforces resend cooldown, expiry, and the five-attempt limit', async () => {
    const result = await requestEmailChange(userId, { newEmail, currentPassword });
    await expect(requestEmailChange(userId, { newEmail, currentPassword })).rejects.toMatchObject({
      code: 'OTP_COOLDOWN',
    });

    challenge.expiresAt = new Date(Date.now() - 1);
    await expect(
      confirmEmailChange(userId, { challengeId: result.challengeId, otp: deliveredCode }),
    ).rejects.toMatchObject({ code: 'INVALID_OTP' });
    challenge.expiresAt = new Date(Date.now() + 60_000);
    challenge.attemptCount = 5;
    await expect(
      confirmEmailChange(userId, { challengeId: result.challengeId, otp: deliveredCode }),
    ).rejects.toMatchObject({ code: 'INVALID_OTP' });
  });

  it('changes the email once and revokes all refresh sessions', async () => {
    const result = await requestEmailChange(userId, { newEmail, currentPassword });
    await confirmEmailChange(userId, { challengeId: result.challengeId, otp: deliveredCode });

    expect(account.email).toBe(newEmail);
    expect(account.emailVerifiedAt).toBeInstanceOf(Date);
    expect(challenge.consumedAt).toBeInstanceOf(Date);
    expect(mocks.deletePasswordResets).toHaveBeenCalledWith({ where: { userId } });
    expect(mocks.updateSessions).toHaveBeenCalledWith({
      where: { userId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    await expect(
      confirmEmailChange(userId, { challengeId: result.challengeId, otp: deliveredCode }),
    ).rejects.toMatchObject({ code: 'INVALID_OTP' });
  });

  it('requires authentication and clears the refresh cookie after confirmation', async () => {
    await request(createApp())
      .post('/api/v1/auth/change-email/otp')
      .set('Origin', 'https://untrusted.example')
      .send({ newEmail, currentPassword })
      .expect(403);
    expect(mocks.deliver).not.toHaveBeenCalled();

    await request(createApp())
      .post('/api/v1/auth/change-email/otp')
      .send({ newEmail, currentPassword })
      .expect(401);

    const accessToken = await issueAccessToken(userId);
    const requested = await request(createApp())
      .post('/api/v1/auth/change-email/otp')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ newEmail, currentPassword })
      .expect(202);
    const response = await request(createApp())
      .post('/api/v1/auth/change-email/confirm')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ challengeId: requested.body.data.challengeId, otp: deliveredCode })
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('Expires=Thu, 01 Jan 1970')]),
    );
  });
});
