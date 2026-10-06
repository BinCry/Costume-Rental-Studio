import { verify } from 'argon2';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = 'registration-test-secret-not-production-123456';
process.env.OTP_HASH_SECRET = 'otp-test-secret-not-production-123456789';

const mocks = vi.hoisted(() => ({
  findOtp: vi.fn(),
  upsertOtp: vi.fn(),
  updateOtp: vi.fn(),
  sentOtp: vi.fn(),
  findUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  createSession: vi.fn(),
  role: vi.fn(),
  assignment: vi.fn(),
  branch: vi.fn(),
  lock: vi.fn(),
  transaction: vi.fn(),
  deliver: vi.fn(),
  available: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: mocks.transaction, emailOtpChallenge: { updateMany: mocks.sentOtp } },
}));
vi.mock('../src/modules/auth/registration/otp.delivery.js', () => ({
  assertEmailOtpDeliveryAvailable: mocks.available,
  deliverEmailOtp: mocks.deliver,
}));
const { createApp } = await import('../src/app.js');
const { registerCustomer, requestRegistrationOtp } =
  await import('../src/modules/auth/registration/registration.service.js');
const email = 'customer@example.com';
const user = {
  id: '10000000-0000-4000-8000-000000000003',
  email,
  phone: null,
  displayName: 'Original customer',
  status: 'ACTIVE',
  customer: { customerCode: 'CUS-001' },
  employee: null,
  passwordHash: null,
  emailVerifiedAt: null,
  authIdentities: [],
  roleAssignments: [],
};
interface Challenge {
  id: string;
  email: string;
  codeHash: string;
  attemptCount: number;
  createdAt: Date;
  expiresAt: Date;
  sentAt: Date | null;
  consumedAt: Date | null;
}
let challenge: Challenge | null;
let deliveredCode = '';
const tx = {
  $queryRaw: mocks.lock,
  emailOtpChallenge: {
    findUnique: mocks.findOtp,
    upsert: mocks.upsertOtp,
    update: mocks.updateOtp,
  },
  user: { findUnique: mocks.findUser, create: mocks.createUser, updateMany: mocks.updateUser },
  role: { findUnique: mocks.role },
  userRoleAssignment: { create: mocks.assignment },
  branch: { findUnique: mocks.branch },
  refreshSession: { create: mocks.createSession },
};
beforeEach(() => {
  vi.resetAllMocks();
  challenge = null;
  deliveredCode = '';
  mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  mocks.findOtp.mockImplementation(() => challenge);
  mocks.upsertOtp.mockImplementation(({ create }: { create: Challenge }) => {
    challenge = { ...create };
    return challenge;
  });
  mocks.sentOtp.mockImplementation(() => {
    if (challenge) challenge.sentAt = new Date();
    return { count: 1 };
  });
  mocks.updateOtp.mockImplementation(
    ({ data }: { data: { attemptCount?: { increment: number }; consumedAt?: Date } }) => {
      if (challenge && data.attemptCount) challenge.attemptCount += data.attemptCount.increment;
      if (challenge && data.consumedAt) challenge.consumedAt = data.consumedAt;
      return challenge;
    },
  );
  mocks.deliver.mockImplementation((_email: string, code: string) => {
    deliveredCode = code;
  });
  mocks.findUser.mockResolvedValue(null);
  mocks.createUser.mockResolvedValue(user);
  mocks.updateUser.mockResolvedValue({ count: 1 });
  mocks.role.mockResolvedValue({ id: 'role-customer', actorGroup: 'CUSTOMER', isActive: true });
  mocks.branch.mockResolvedValue({ status: 'ACTIVE' });
});
async function input() {
  const result = await requestRegistrationOtp(email);
  return {
    email,
    challengeId: result.challengeId,
    otp: deliveredCode,
    displayName: 'New name',
    password: 'a-strong-test-password',
  };
}

describe('customer email registration', () => {
  it('normalizes email, hashes OTP, and never returns the code', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/register/otp')
      .send({ email: ' CUSTOMER@EXAMPLE.COM ' })
      .expect(202);
    expect(response.text).not.toContain(deliveredCode);
    expect(mocks.deliver).toHaveBeenCalledWith(
      email,
      expect.stringMatching(/^\d{6}$/),
      'registration',
    );
    expect(challenge?.email).toBe(email);
    expect(challenge?.codeHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('registers with an Argon2 password and HttpOnly refresh cookie', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/register')
      .send(await input())
      .expect(201);
    const created = mocks.createUser.mock.calls[0]?.[0] as {
      data: { passwordHash: string; emailVerifiedAt: Date };
    };
    expect(await verify(created.data.passwordHash, 'a-strong-test-password')).toBe(true);
    expect(created.data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(response.body as unknown).not.toHaveProperty('data.refreshToken');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/^refreshToken=.*HttpOnly.*SameSite=Lax/)]),
    );
  });
  it('claims an unverified customer by normalized email without replacing profile', async () => {
    mocks.findUser.mockResolvedValue(user);
    const result = await registerCustomer(await input());
    expect(result.created).toBe(false);
    expect(result.customer.displayName).toBe('Original customer');
    expect(mocks.createUser).not.toHaveBeenCalled();
    const claimed = mocks.updateUser.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: { passwordHash: string };
    };
    expect(claimed.where).toMatchObject({ id: user.id, email });
    expect(await verify(claimed.data.passwordHash, 'a-strong-test-password')).toBe(true);
  });
  it('limits failed OTP attempts and rejects expiry', async () => {
    const payload = await input();
    const wrong = payload.otp === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await expect(registerCustomer({ ...payload, otp: wrong })).rejects.toMatchObject({
        code: 'INVALID_OTP',
      });
    await expect(registerCustomer(payload)).rejects.toMatchObject({ code: 'INVALID_OTP' });
    expect(challenge?.attemptCount).toBe(5);
    challenge!.attemptCount = 0;
    challenge!.expiresAt = new Date(Date.now() - 1);
    await expect(registerCustomer(payload)).rejects.toMatchObject({ code: 'INVALID_OTP' });
  });
  it('enforces resend cooldown and does not mark failed delivery sent', async () => {
    const first = await input();
    await expect(requestRegistrationOtp(email)).rejects.toMatchObject({ code: 'OTP_COOLDOWN' });
    challenge!.createdAt = new Date(Date.now() - 61_000);
    mocks.sentOtp.mockClear();
    mocks.deliver.mockRejectedValue(new Error('email unavailable'));
    await expect(requestRegistrationOtp(email)).rejects.toMatchObject({
      code: 'OTP_DELIVERY_UNAVAILABLE',
    });
    expect(mocks.sentOtp).not.toHaveBeenCalled();
    await expect(registerCustomer(first)).rejects.toMatchObject({ code: 'INVALID_OTP' });
  });
  it('requires strict email registration input', async () => {
    await request(createApp())
      .post('/api/v1/auth/register')
      .send({
        email,
        challengeId: user.id,
        otp: '123456',
        displayName: 'Name',
        password: 'long-enough-password',
        role: 'ADMIN',
      })
      .expect(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
