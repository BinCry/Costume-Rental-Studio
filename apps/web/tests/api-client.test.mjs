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
  it('groups public catalog variants under one model and follows API pagination', async () => {
    const model = { id: 'model-1', name: 'Đầm thử', category: { name: 'Đầm' }, media: [{ mediaUrl: 'https://img.example.test/dam.jpg', altText: 'Đầm xanh' }] };
    const variant = (id, size, code) => ({
      id,
      modelId: 'model-1',
      variantCode: code,
      sizeCode: size,
      colorCode: 'Xanh',
      dailyRentalPriceVnd: 150000,
      depositAmountVnd: 500000,
      model,
    });
    globalThis.fetch
      .mockResolvedValueOnce(success({
        items: [variant('variant-s', 'S', 'DAM-S-XANH')],
        pagination: { page: 1, pageSize: 1, totalItems: 2, totalPages: 2 },
      }))
      .mockResolvedValueOnce(success({
        items: [variant('variant-m', 'M', 'DAM-M-XANH')],
        pagination: { page: 2, pageSize: 1, totalItems: 2, totalPages: 2 },
      }));
    const { listCatalog } = await import('../src/api/client.ts');

    const catalog = await listCatalog();

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      id: 'model-1',
      imageUrl: 'https://img.example.test/dam.jpg',
      sizes: ['M', 'S'],
      apiVariants: [
        { id: 'variant-s', code: 'DAM-S-XANH', size: 'S', color: 'Xanh' },
        { id: 'variant-m', code: 'DAM-M-XANH', size: 'M', color: 'Xanh' },
      ],
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('maps the rental accessory row id and allocation status for return scanning', async () => {
    globalThis.fetch.mockResolvedValueOnce(success({
      items: [{
        id: 'order-1',
        orderCode: 'RT-TEST-01',
        status: 'ACTIVE',
        version: 3,
        plannedStartAt: '2026-10-14T03:00:00.000Z',
        plannedDueAt: '2026-10-15T03:00:00.000Z',
        pickupBranch: { id: 'branch-1', name: 'Chi nhánh Quận 1' },
        items: [{
          id: 'order-item-1',
          allocationStatus: 'ACTIVE',
          returnConditionGrade: null,
          variantId: 'variant-1',
          variant: { sizeCode: 'M', colorCode: 'Đỏ', model: { name: 'Đầm thử' } },
          unit: { id: 'unit-1', unitCode: 'BC-TEST-01', operationalStatus: 'ACTIVE' },
          unitDailyPriceVnd: 100000,
          unitDepositVnd: 300000,
          billableDays: 1,
          accessories: [{
            id: 'rental-accessory-row-1',
            modelAccessoryId: 'catalog-accessory-id',
            accessoryName: 'Khăn',
            quantityOut: 1,
            quantityReturned: null,
          }],
        }],
        payments: [],
      }],
      pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
    }));
    const { listOrders } = await import('../src/api/client.ts');

    const [order] = await listOrders({ loadPendingAvailability: false });

    expect(order.items[0]).toMatchObject({
      id: 'order-item-1',
      apiAllocationStatus: 'ACTIVE',
      accessories: [{ id: 'rental-accessory-row-1', name: 'Khăn', quantityOut: 1 }],
    });
  });

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

  it('maps validation errors to a safe Vietnamese message and keeps structured details', async () => {
    globalThis.fetch.mockResolvedValueOnce(error(422, 'VALIDATION_ERROR', 'Email chưa hợp lệ', {
      email: 'Kiểm tra định dạng email',
    }));
    const { ApiClientError, login } = await import('../src/api/client.ts');

    await expect(login('sai-email', 'password-test')).rejects.toMatchObject({
      name: ApiClientError.name,
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Thông tin chưa hợp lệ. Hãy kiểm tra các trường đã nhập.',
      details: { email: 'Kiểm tra định dạng email' },
    });
  });

  it('handles a non-JSON server error without exposing its body', async () => {
    globalThis.fetch.mockResolvedValueOnce(new Response('<html>secret stack trace</html>', { status: 502 }));
    const { login } = await import('../src/api/client.ts');

    await expect(login('khach@example.com', 'password-test')).rejects.toMatchObject({
      status: 502,
      code: 'API_REQUEST_FAILED',
      message: 'Máy chủ đang gặp sự cố. Thử lại sau ít phút.',
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
    await expect(logout()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR', message: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.' });
    expect(hasAccessToken()).toBe(false);
    expect(values.has(accessTokenKey)).toBe(false);
  });
});
