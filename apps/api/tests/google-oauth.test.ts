/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.WEB_URL = 'http://localhost:3000';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = 'google-oauth-test-secret-not-for-production';
process.env.GOOGLE_CLIENT_ID = 'google-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:4000/api/v1/auth/google/callback';

const googleMocks = vi.hoisted(() => ({
  generateAuthUrl: vi.fn(),
  getToken: vi.fn(),
  verifyIdToken: vi.fn(),
}));
vi.mock('google-auth-library', () => ({
  CodeChallengeMethod: { S256: 'S256' },
  OAuth2Client: class {
    generateAuthUrl = googleMocks.generateAuthUrl;
    getToken = googleMocks.getToken;
    verifyIdToken = googleMocks.verifyIdToken;
  },
}));

const dbMocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  findIdentity: vi.fn(),
  createIdentity: vi.fn(),
  findUser: vi.fn(),
  updateUser: vi.fn(),
  createUser: vi.fn(),
  updateEmployee: vi.fn(),
  findRole: vi.fn(),
  createRoleAssignment: vi.fn(),
  createSession: vi.fn(),
}));

const tx = {
  $queryRaw: dbMocks.lock,
  authIdentity: { findUnique: dbMocks.findIdentity, create: dbMocks.createIdentity },
  user: { findUnique: dbMocks.findUser, update: dbMocks.updateUser, create: dbMocks.createUser },
  employee: { update: dbMocks.updateEmployee },
  role: { findUnique: dbMocks.findRole },
  userRoleAssignment: { create: dbMocks.createRoleAssignment },
  refreshSession: { create: dbMocks.createSession },
};

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: dbMocks.transaction,
  },
}));

const { createApp } = await import('../src/app.js');
const { completeGoogleAuthorization } =
  await import('../src/modules/auth/google/google-oauth.service.js');

const userId = '10000000-0000-4000-8000-000000000001';
const email = 'customer@example.com';
const googlePayload = {
  sub: 'google-subject-123',
  email,
  email_verified: true,
  name: 'Google Customer',
  picture: 'https://example.com/avatar.png',
  nonce: 'nonce-value',
};

beforeEach(() => {
  vi.resetAllMocks();
  googleMocks.generateAuthUrl.mockImplementation((options: Record<string, unknown>) => {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [key, value] of Object.entries(options)) {
      if (typeof value === 'string') url.searchParams.set(key, value);
    }
    return url.toString();
  });
  googleMocks.getToken.mockResolvedValue({ tokens: { id_token: 'google-id-token' } });
  googleMocks.verifyIdToken.mockResolvedValue({ getPayload: () => googlePayload });
  dbMocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  dbMocks.findIdentity.mockResolvedValue(null);
  dbMocks.findUser.mockResolvedValue(null);
  dbMocks.findRole.mockResolvedValue({
    id: 'customer-role',
    actorGroup: 'CUSTOMER',
    isActive: true,
  });
  dbMocks.createUser.mockResolvedValue({
    id: userId,
    email,
    phone: null,
    displayName: 'Google Customer',
  });
  dbMocks.createSession.mockResolvedValue({ id: 'session-id' });
});

describe('Google OAuth HTTP flow', () => {
  it('starts authorization with state, nonce and PKCE in an HttpOnly flow cookie', async () => {
    const response = await request(createApp()).get('/api/v1/auth/google').expect(302);
    const location = new URL(response.headers.location!);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('state')).toHaveLength(43);
    expect(location.searchParams.get('nonce')).toHaveLength(43);
    expect(location.searchParams.get('code_challenge')).toHaveLength(43);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('googleOAuthFlow='),
        expect.stringContaining('HttpOnly'),
        expect.stringContaining('SameSite=Lax'),
      ]),
    );
  });

  it('rejects a callback whose state does not match the initiating browser', async () => {
    const start = await request(createApp()).get('/api/v1/auth/google').expect(302);
    const flowCookie = (start.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const response = await request(createApp())
      .get('/api/v1/auth/google/callback?code=code&state=wrong-state')
      .set('Cookie', flowCookie)
      .expect(303);
    const location = new URL(response.headers.location!);
    expect(location.searchParams.get('status')).toBe('error');
    expect(location.searchParams.get('error')).toBe('INVALID_GOOGLE_OAUTH_FLOW');
    expect(googleMocks.getToken).not.toHaveBeenCalled();
  });

  it('does not let a forged cancellation callback consume another login flow', async () => {
    const start = await request(createApp()).get('/api/v1/auth/google').expect(302);
    const flowCookie = (start.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const response = await request(createApp())
      .get('/api/v1/auth/google/callback?error=access_denied&state=forged-state')
      .set('Cookie', flowCookie)
      .expect(303);
    const location = new URL(response.headers.location!);
    expect(location.searchParams.get('error')).toBe('INVALID_GOOGLE_OAUTH_FLOW');
  });

  it('creates a customer session, sets only the refresh cookie and redirects to the frontend', async () => {
    const start = await request(createApp()).get('/api/v1/auth/google').expect(302);
    const authorizationUrl = new URL(start.headers.location!);
    const state = authorizationUrl.searchParams.get('state')!;
    const nonce = authorizationUrl.searchParams.get('nonce')!;
    googleMocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({ ...googlePayload, nonce }),
    });
    const flowCookie = (start.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;

    const response = await request(createApp())
      .get(`/api/v1/auth/google/callback?code=one-time-code&state=${state}`)
      .set('Cookie', flowCookie)
      .expect(303);

    const location = new URL(response.headers.location!);
    expect(location.origin).toBe('http://localhost:3000');
    expect(location.searchParams.get('status')).toBe('success');
    expect(location.search).not.toContain('accessToken');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('refreshToken='),
        expect.stringContaining('HttpOnly'),
      ]),
    );
    expect(dbMocks.createIdentity).not.toHaveBeenCalled();
    expect(dbMocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email,
          authIdentities: { create: expect.objectContaining({ provider: 'GOOGLE' }) },
          customer: { create: expect.any(Object) },
        }),
      }),
    );
    expect(dbMocks.createSession).toHaveBeenCalledOnce();
  });
});

describe('Google account linking', () => {
  it('rejects linking when the email owner changes while locks are acquired', async () => {
    dbMocks.findUser.mockResolvedValueOnce({ id: userId }).mockResolvedValueOnce({
      id: '20000000-0000-4000-8000-000000000002',
      email,
      status: 'ACTIVE',
      customer: { userId: '20000000-0000-4000-8000-000000000002' },
      employee: null,
      authIdentities: [],
    });

    await expect(
      completeGoogleAuthorization('one-time-code', 'state-value', {
        state: 'state-value',
        nonce: 'nonce-value',
        codeVerifier: 'a'.repeat(43),
        expiresAt: Date.now() + 60_000,
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CONFLICT' });
    expect(dbMocks.createIdentity).not.toHaveBeenCalled();
    expect(dbMocks.createSession).not.toHaveBeenCalled();
  });

  it('activates a pending employee when the verified Google email matches', async () => {
    const employee = {
      id: userId,
      email,
      phone: null,
      displayName: 'Employee',
      avatarUrl: null,
      status: 'PENDING',
      emailVerifiedAt: null,
      customer: null,
      employee: { employmentStatus: 'ACTIVE', activatedAt: null },
      authIdentities: [],
    };
    dbMocks.findUser.mockResolvedValue(employee);

    const result = await completeGoogleAuthorization(
      'one-time-code',
      'state-value',
      {
        state: 'state-value',
        nonce: 'nonce-value',
        codeVerifier: 'a'.repeat(43),
        expiresAt: Date.now() + 60_000,
      },
      { ip: '198.51.100.10' },
    );

    expect(result).toMatchObject({ created: false, activated: true });
    expect(dbMocks.createIdentity).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        provider: 'GOOGLE',
        providerSubject: googlePayload.sub,
      }),
    });
    expect(dbMocks.updateUser).toHaveBeenCalledWith({
      where: { id: userId },
      data: expect.objectContaining({ status: 'ACTIVE', emailVerifiedAt: expect.any(Date) }),
    });
    expect(dbMocks.updateEmployee).toHaveBeenCalledWith({
      where: { userId },
      data: { activatedAt: expect.any(Date) },
    });
  });
});
