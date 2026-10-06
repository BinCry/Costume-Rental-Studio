/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion */
import { verify } from 'argon2';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.OTP_DELIVERY_MODE = 'console';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = 'reset-test-secret-not-production-123456';
process.env.OTP_HASH_SECRET = 'reset-otp-secret-not-production-123456789';
process.env.WEB_URL = 'http://localhost:3000';
const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findChallenge: vi.fn(),
  upsertChallenge: vi.fn(),
  updateChallenge: vi.fn(),
  updateChallenges: vi.fn(),
  updateUser: vi.fn(),
  updateSessions: vi.fn(),
  deleteEmailChanges: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  deliver: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.findUser, updateMany: mocks.updateUser },
    passwordResetChallenge: {
      findUnique: mocks.findChallenge,
      upsert: mocks.upsertChallenge,
      update: mocks.updateChallenge,
      updateMany: mocks.updateChallenges,
    },
    emailChangeChallenge: { deleteMany: mocks.deleteEmailChanges },
    refreshSession: { updateMany: mocks.updateSessions },
    $transaction: mocks.transaction,
  },
}));
vi.mock('../src/modules/auth/registration/otp.delivery.js', () => ({
  assertEmailOtpDeliveryAvailable: vi.fn(),
  deliverEmailOtp: mocks.deliver,
}));
const { createApp } = await import('../src/app.js');
const { requestPasswordReset, verifyPasswordResetOtp, resetPassword } =
  await import('../src/modules/auth/password-reset/password-reset.service.js');
const email = 'customer@example.com';
const userId = '10000000-0000-4000-8000-000000000001';
let challenge: any;
let deliveredCode = '';
const user = {
  id: userId,
  status: 'ACTIVE',
  passwordHash: 'existing',
  emailVerifiedAt: new Date(),
  employee: null,
};
const tx = {
  $queryRaw: mocks.lock,
  passwordResetChallenge: {
    findUnique: mocks.findChallenge,
    upsert: mocks.upsertChallenge,
    update: mocks.updateChallenge,
  },
  emailChangeChallenge: { deleteMany: mocks.deleteEmailChanges },
  user: { updateMany: mocks.updateUser },
  refreshSession: { updateMany: mocks.updateSessions },
};
beforeEach(() => {
  vi.resetAllMocks();
  challenge = null;
  deliveredCode = '';
  mocks.findUser.mockResolvedValue(user);
  mocks.deliver.mockImplementation((_email: string, code: string) => {
    deliveredCode = code;
  });
  mocks.transaction.mockImplementation((cb: (client: typeof tx) => Promise<unknown>) => cb(tx));
  mocks.findChallenge.mockImplementation(({ where }: { where: any }) => {
    if (where.userId) return challenge;
    if (where.id) return challenge?.id === where.id ? challenge : null;
    if (where.resetTokenHash)
      return challenge?.resetTokenHash === where.resetTokenHash ? { userId } : null;
    return challenge;
  });
  mocks.upsertChallenge.mockImplementation(({ create }: { create: any }) => {
    challenge = { ...create };
    return challenge;
  });
  mocks.updateChallenge.mockImplementation(({ data }: { data: any }) => {
    Object.assign(challenge, data);
    return challenge;
  });
  mocks.updateChallenges.mockImplementation(({ data }: { data: any }) => {
    if (challenge) Object.assign(challenge, data);
    return { count: 1 };
  });
  mocks.updateUser.mockResolvedValue({ count: 1 });
  mocks.updateSessions.mockResolvedValue({ count: 2 });
  mocks.deleteEmailChanges.mockResolvedValue({ count: 1 });
});

describe('password recovery', () => {
  it('returns the same generic response for unknown and ineligible email', async () => {
    const unknown = await request(createApp())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'missing@example.com' })
      .expect(202);
    expect(unknown.body.data).toMatchObject({ expiresIn: 300, retryAfter: 60 });
    mocks.findUser.mockResolvedValue({ ...user, emailVerifiedAt: null });
    const ineligible = await request(createApp())
      .post('/api/v1/auth/forgot-password')
      .send({ email })
      .expect(202);
    expect(ineligible.body.data).toMatchObject({ expiresIn: 300, retryAfter: 60 });
  });
  it('creates an email OTP without returning its code', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/forgot-password')
      .send({ email: ' CUSTOMER@EXAMPLE.COM ' })
      .expect(202);
    expect(response.text).not.toContain(deliveredCode);
    expect(mocks.deliver).toHaveBeenCalledWith(
      email,
      expect.stringMatching(/^\d{6}$/),
      'password-reset',
    );
    expect(challenge?.userId).toBe(userId);
  });
  it('enforces five-attempt limit and expiry', async () => {
    await requestPasswordReset(email);
    challenge!.attemptCount = 5;
    await expect(
      verifyPasswordResetOtp({ challengeId: challenge.id, otp: deliveredCode }),
    ).rejects.toMatchObject({ code: 'INVALID_OTP' });
    challenge!.attemptCount = 0;
    challenge!.expiresAt = new Date(Date.now() - 1);
    await expect(
      verifyPasswordResetOtp({ challengeId: challenge.id, otp: deliveredCode }),
    ).rejects.toMatchObject({ code: 'INVALID_OTP' });
  });
  it('issues a one-time reset token after valid OTP and consumes it on reset', async () => {
    await requestPasswordReset(email);
    const result = await verifyPasswordResetOtp({ challengeId: challenge.id, otp: deliveredCode });
    expect(result.resetToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge.verifiedAt).toBeInstanceOf(Date);
    mocks.findChallenge.mockImplementation(({ where }: { where: any }) =>
      where.resetTokenHash === challenge.resetTokenHash ? { ...challenge, user } : challenge,
    );
    await resetPassword({ resetToken: result.resetToken, newPassword: 'new-strong-password-123' });
    expect(
      await verify(
        (mocks.updateUser.mock.calls[0]?.[0] as any).data.passwordHash,
        'new-strong-password-123',
      ),
    ).toBe(true);
    expect(challenge.consumedAt).toBeInstanceOf(Date);
    expect(mocks.updateSessions).toHaveBeenCalled();
    await expect(
      resetPassword({ resetToken: result.resetToken, newPassword: 'another-password-123' }),
    ).rejects.toMatchObject({ code: 'INVALID_PASSWORD_RESET' });
  });
  it('rejects invalid OTP and malformed reset input', async () => {
    await requestPasswordReset(email);
    await expect(
      verifyPasswordResetOtp({ challengeId: challenge.id, otp: '000000' }),
    ).rejects.toMatchObject({ code: 'INVALID_OTP' });
    await request(createApp())
      .post('/api/v1/auth/reset-password')
      .send({ resetToken: 'bad', newPassword: 'short' })
      .expect(400);
  });
  it('requires trusted origin and clears refresh cookie after reset', async () => {
    const denied = await request(createApp())
      .post('/api/v1/auth/forgot-password')
      .set('Origin', 'https://evil.example')
      .send({ email })
      .expect(403);
    expect(denied.body.error?.code ?? denied.body.code).toBeDefined();
    const response = await request(createApp())
      .post('/api/v1/auth/reset-password')
      .send({ resetToken: 'a'.repeat(43), newPassword: 'new-strong-password-123' })
      .expect(400);
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
