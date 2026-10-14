// Test the browser API adapter without a DOM or backend process.
const { afterEach, beforeEach, describe, expect, it, vi } = globalThis;

const accessTokenKey = 'costume-rental.access-token';
let values;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function success(data) {
  return jsonResponse({ success: true, data });
}

function error(status, code, message, details) {
  return jsonResponse({ success: false, error: { code, message, details } }, status);
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/');
  values = new Map();
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
      clear: () => values.clear(),
    },
  });
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('web API client session and error handling', () => {
  it('stores a login token and attaches it to later requests', async () => {
    const fetchMock = globalThis.fetch;
    fetchMock
      .mockResolvedValueOnce(success({ accessToken: 'access-1', user: { id: 'user-1' } }))
      .mockResolvedValueOnce(success({
        id: 'user-1',
        displayName: 'Khách thử nghiệm',
        email: 'khach@example.com',
        roles: [],
      }));

    const { login, currentUser } = await import('../src/api/client.ts');
    await login('khach@example.com', 'password-test');
    const user = await currentUser();

    expect(user.id).toBe('user-1');
    expect(values.get(accessTokenKey)).toBe('access-1');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/v1/auth/login');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      email: 'khach@example.com',
      password: 'password-test',
    });
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Authorization')).toBe('Bearer access-1');
  });

  it('preserves validation status, code, message and details from the API', async () => {
    globalThis.fetch.mockResolvedValueOnce(error(422, 'VALIDATION_ERROR', 'Email chưa hợp lệ', {
      email: 'Kiểm tra định dạng email',
    }));
    const { ApiClientError, login } = await import('../src/api/client.ts');

    await expect(login('sai-email', 'password-test')).rejects.toMatchObject({
      name: ApiClientError.name,
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Email chưa hợp lệ',
      details: { email: 'Kiểm tra định dạng email' },
    });
  });

  it('refreshes an expired session once and retries the original request', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(error(401, 'SESSION_EXPIRED', 'Phiên hết hạn'))
      .mockResolvedValueOnce(success({ accessToken: 'access-refreshed' }))
      .mockResolvedValueOnce(success({
        id: 'user-1',
        displayName: 'Khách thử nghiệm',
        email: 'khach@example.com',
        roles: [],
      }));

    const { currentUser } = await import('../src/api/client.ts');
    const user = await currentUser();

    expect(user.id).toBe('user-1');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(globalThis.fetch.mock.calls[1][0]).toBe('https://api.example.test/api/v1/auth/refresh');
    expect(new Headers(globalThis.fetch.mock.calls[2][1].headers).get('Authorization')).toBe(
      'Bearer access-refreshed',
    );
    expect(values.get(accessTokenKey)).toBe('access-refreshed');
  });

  it('does not loop refresh requests when the retried request remains unauthorized', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(error(401, 'SESSION_EXPIRED', 'Phiên hết hạn'))
      .mockResolvedValueOnce(success({ accessToken: 'access-refreshed' }))
      .mockResolvedValueOnce(error(401, 'NO_ACCESS', 'Không có quyền'));

    const { currentUser } = await import('../src/api/client.ts');

    await expect(currentUser()).rejects.toMatchObject({ status: 401, code: 'NO_ACCESS' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('clears the local session even when logout cannot reach the API', async () => {
    values.set(accessTokenKey, 'access-before-logout');
    globalThis.fetch.mockRejectedValueOnce(new Error('network down'));
    const { hasAccessToken, logout } = await import('../src/api/client.ts');

    expect(hasAccessToken()).toBe(true);
    await expect(logout()).rejects.toThrow('network down');
    expect(hasAccessToken()).toBe(false);
    expect(values.has(accessTokenKey)).toBe(false);
  });
});
