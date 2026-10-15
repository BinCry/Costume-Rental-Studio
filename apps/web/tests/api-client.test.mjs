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

  it('keeps cash payment retries idempotent while allowing a later collection attempt', async () => {
    const order = {
      id: 'order-1',
      orderCode: 'RT-CASH-01',
      status: 'RETURN_INSPECTION',
      version: 2,
      plannedStartAt: '2026-10-14T03:00:00.000Z',
      plannedDueAt: '2026-10-15T03:00:00.000Z',
      pickupBranch: { id: 'branch-1', name: 'Chi nhánh Quận 1' },
      items: [],
      payments: [],
    };
    globalThis.fetch
      .mockResolvedValueOnce(success({
        items: [order],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      }))
      .mockResolvedValueOnce(success({ id: 'payment-1' }))
      .mockResolvedValueOnce(success({ id: 'payment-1' }))
      .mockResolvedValueOnce(success({ id: 'payment-2' }));
    const { listOrders, recordCashPayment } = await import('../src/api/client.ts');
    await listOrders({ loadPendingAvailability: false });
    await recordCashPayment('RT-CASH-01', 'EXTRA', 125_000, 'attempt-1');
    await recordCashPayment('RT-CASH-01', 'EXTRA', 125_000, 'attempt-1');
    await recordCashPayment('RT-CASH-01', 'EXTRA', 125_000, 'attempt-2');

    const firstKey = JSON.parse(globalThis.fetch.mock.calls[1][1].body).idempotencyKey;
    const retryKey = JSON.parse(globalThis.fetch.mock.calls[2][1].body).idempotencyKey;
    const nextKey = JSON.parse(globalThis.fetch.mock.calls[3][1].body).idempotencyKey;
    expect(retryKey).toBe(firstKey);
    expect(nextKey).not.toBe(firstKey);
  });

  it('sends a missing return without pretending the costume was physically inspected', async () => {
    const order = {
      id: 'order-1',
      orderCode: 'RT-MISSING-01',
      status: 'ACTIVE',
      version: 4,
      plannedStartAt: '2026-10-14T03:00:00.000Z',
      plannedDueAt: '2026-10-15T03:00:00.000Z',
      pickupBranch: { id: 'branch-1', name: 'Chi nhánh Quận 1' },
      items: [],
      payments: [],
    };
    globalThis.fetch
      .mockResolvedValueOnce(success({
        items: [order],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      }))
      .mockResolvedValueOnce(success({ ...order, status: 'RETURN_INSPECTION', version: 5 }));
    const { listOrders, returnOrder } = await import('../src/api/client.ts');
    await listOrders({ loadPendingAvailability: false });
    await returnOrder('RT-MISSING-01', 4, false, 'Đã xác minh với khách', [{
      orderItemId: 'item-1',
      isMissing: true,
      damageNotes: 'Khách báo thất lạc trong quá trình sử dụng.',
      evidence: [{
        uploadKey: 'rental-staging/case.jpg',
        contentType: 'image/jpeg',
        size: 10,
      }],
      accessories: [],
    }]);

    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({
      expectedVersion: 4,
      partial: false,
      returnNotes: 'Đã xác minh với khách',
      items: [{
        orderItemId: 'item-1',
        isMissing: true,
        damageNotes: 'Khách báo thất lạc trong quá trình sử dụng.',
        evidence: [{
          uploadKey: 'rental-staging/case.jpg',
          contentType: 'image/jpeg',
          size: 10,
        }],
        accessories: [],
      }],
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

  it('does not POST completion unless the latest server snapshot explicitly allows it', async () => {
    const order = {
      id: 'order-1',
      orderCode: 'RT-TEST-01',
      status: 'RETURN_INSPECTION',
      version: 4,
      plannedStartAt: '2026-10-14T03:00:00.000Z',
      plannedDueAt: '2026-10-15T03:00:00.000Z',
      pickupBranch: { id: 'branch-1', name: 'Chi nhánh Quận 1' },
      inspectionStatus: 'PASSED',
      depositDeductionVnd: '0',
      otherFeeVnd: '0',
      items: [],
      payments: [],
    };
    const snapshot = {
      orderId: 'order-1',
      status: 'RETURN_INSPECTION',
      rental: { dueVnd: '0', paidVnd: '0', remainingVnd: '0' },
      deposit: { dueVnd: '0', paidVnd: '0', deductionVnd: '0', refundedVnd: '0', refundRemainingVnd: '0' },
      extra: { dueVnd: '0', paidVnd: '0', remainingVnd: '0' },
      outstandingVnd: '0',
      canPickup: true,
      canComplete: false,
    };
    globalThis.fetch
      .mockResolvedValueOnce(success({
        items: [{ ...order, items: [] }],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      }))
      .mockResolvedValueOnce(success(order))
      .mockResolvedValueOnce(success(snapshot));
    const { ApiClientError, completeOrderSettlement, listOrders } = await import('../src/api/client.ts');
    await listOrders({ loadPendingAvailability: false });

    await expect(completeOrderSettlement('RT-TEST-01')).rejects.toMatchObject({
      name: ApiClientError.name,
      status: 409,
      code: 'SETTLEMENT_NOT_READY',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(globalThis.fetch.mock.calls[2][0]).toBe(
      'https://api.example.test/api/v1/payments/orders/order-1/summary',
    );
  });

  it('fetches current order and snapshot, then sends the exact prepared values only when eligible', async () => {
    const order = {
      id: 'order-1',
      orderCode: 'RT-TEST-02',
      status: 'RETURN_INSPECTION',
      version: 7,
      plannedStartAt: '2026-10-14T03:00:00.000Z',
      plannedDueAt: '2026-10-15T03:00:00.000Z',
      pickupBranch: { id: 'branch-1', name: 'Chi nhánh Quận 1' },
      inspectionStatus: 'HAS_DAMAGE',
      depositDeductionVnd: '9007199254740993',
      otherFeeVnd: '12',
      settlementNote: 'Đã đối chiếu',
      items: [],
      payments: [],
    };
    const snapshot = {
      orderId: 'order-1',
      status: 'RETURN_INSPECTION',
      rental: { dueVnd: '0', paidVnd: '0', remainingVnd: '0' },
      deposit: { dueVnd: '0', paidVnd: '0', deductionVnd: '9007199254740993', refundedVnd: '0', refundRemainingVnd: '0' },
      extra: { dueVnd: '0', paidVnd: '0', remainingVnd: '0' },
      outstandingVnd: '0',
      canPickup: true,
      canComplete: true,
    };
    globalThis.fetch
      .mockResolvedValueOnce(success({
        items: [{ ...order, items: [] }],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      }))
      .mockResolvedValueOnce(success(order))
      .mockResolvedValueOnce(success(snapshot))
      .mockResolvedValueOnce(success({ ...order, status: 'COMPLETED', version: 8 }));
    const { completeOrderSettlement, listOrders } = await import('../src/api/client.ts');
    await listOrders({ loadPendingAvailability: false });
    await completeOrderSettlement('RT-TEST-02');

    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    expect(globalThis.fetch.mock.calls[1][0]).toBe(
      'https://api.example.test/api/v1/rentals/orders/order-1',
    );
    expect(globalThis.fetch.mock.calls[2][0]).toBe(
      'https://api.example.test/api/v1/payments/orders/order-1/summary',
    );
    expect(globalThis.fetch.mock.calls[3][0]).toBe(
      'https://api.example.test/api/v1/rentals/orders/order-1/complete',
    );
    expect(JSON.parse(globalThis.fetch.mock.calls[3][1].body)).toEqual({
      expectedVersion: 7,
      depositDeductionVnd: '9007199254740993',
      otherFeeVnd: '12',
      settlementNote: 'Đã đối chiếu',
    });
  });

  it('posts a complete assessment with each order item and accessory row exactly once', async () => {
    const order = {
      id: 'order-1',
      orderCode: 'RT-TEST-04',
      status: 'RETURN_INSPECTION',
      version: 5,
      plannedStartAt: '2026-10-14T03:00:00.000Z',
      plannedDueAt: '2026-10-15T03:00:00.000Z',
      pickupBranch: { id: 'branch-1', name: 'Chi nhánh Quận 1' },
      items: [],
      payments: [],
    };
    globalThis.fetch
      .mockResolvedValueOnce(success({
        items: [order],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      }))
      .mockResolvedValueOnce(success({ ...order, version: 6 }));
    const { assessOrderReturn, listOrders } = await import('../src/api/client.ts');
    await listOrders({ loadPendingAvailability: false });
    await assessOrderReturn('RT-TEST-04', 5, [{
      orderItemId: 'item-1',
      damageFeeVnd: '1200',
      missingFeeVnd: '0',
      accessories: [{ accessoryId: 'rental-accessory-row-1', damageFeeVnd: '0', missingFeeVnd: '250' }],
    }]);

    expect(globalThis.fetch.mock.calls[1][0]).toBe(
      'https://api.example.test/api/v1/rentals/orders/order-1/assessment',
    );
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({
      expectedVersion: 5,
      items: [{
        orderItemId: 'item-1',
        damageFeeVnd: '1200',
        missingFeeVnd: '0',
        accessories: [{ accessoryId: 'rental-accessory-row-1', damageFeeVnd: '0', missingFeeVnd: '250' }],
      }],
    });
  });

  it('retains accessory return condition from order detail and maps it to a readable label', async () => {
    const listedOrder = {
      id: 'order-1',
      orderCode: 'RT-TEST-06',
      status: 'RETURN_INSPECTION',
      version: 3,
      plannedStartAt: '2026-10-14T03:00:00.000Z',
      plannedDueAt: '2026-10-15T03:00:00.000Z',
      pickupBranch: { id: 'branch-1', name: 'Chi nhánh Quận 1' },
      items: [],
      payments: [],
    };
    const detail = {
      ...listedOrder,
      inspectionStatus: 'PENDING_ASSESSMENT',
      items: [{
        id: 'order-item-1',
        accessories: [{
          id: 'accessory-row-1',
          accessoryName: 'Khăn choàng',
          quantityOut: 2,
          quantityReturned: 1,
          conditionIn: 'FAIR',
          damageFeeVnd: '0',
          missingFeeVnd: '0',
        }],
      }],
    };
    globalThis.fetch
      .mockResolvedValueOnce(success({
        items: [listedOrder],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      }))
      .mockResolvedValueOnce(success(detail));
    const { getReturnSettlementOrder, listOrders } = await import('../src/api/client.ts');
    await listOrders({ loadPendingAvailability: false });
    const loaded = await getReturnSettlementOrder('RT-TEST-06');
    const { returnConditionLabel } = await import('../src/components/support.ts');

    expect(loaded.items[0].accessories[0]).toMatchObject({
      id: 'accessory-row-1',
      quantityReturned: 1,
      quantityOut: 2,
      conditionIn: 'FAIR',
    });
    expect(returnConditionLabel(loaded.items[0].accessories[0].conditionIn)).toBe('Khá');
    expect(returnConditionLabel(null)).toBe('Chưa ghi nhận');
  });

  it('reads refund rows with GET only', async () => {
    const order = {
      id: 'order-1',
      orderCode: 'RT-TEST-05',
      status: 'RETURN_INSPECTION',
      version: 3,
      plannedStartAt: '2026-10-14T03:00:00.000Z',
      plannedDueAt: '2026-10-15T03:00:00.000Z',
      pickupBranch: { id: 'branch-1', name: 'Chi nhánh Quận 1' },
      items: [],
      payments: [],
    };
    globalThis.fetch
      .mockResolvedValueOnce(success({
        items: [order],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      }))
      .mockResolvedValueOnce(success([{
        id: 'refund-1', paymentId: 'payment-1', amountVnd: '5000', status: 'PROCESSING',
      }]));
    const { listOrderRefunds, listOrders } = await import('../src/api/client.ts');
    await listOrders({ loadPendingAvailability: false });
    await expect(listOrderRefunds('RT-TEST-05')).resolves.toMatchObject([
      { id: 'refund-1', amountVnd: '5000', status: 'PROCESSING' },
    ]);

    expect(globalThis.fetch.mock.calls[1][0]).toBe(
      'https://api.example.test/api/v1/payments/orders/order-1/refunds',
    );
    expect(globalThis.fetch.mock.calls[1][1].method).toBeUndefined();
  });

  it('preserves large string amounts when preparing settlement instead of rounding them in the browser', async () => {
    const order = {
      id: 'order-1',
      orderCode: 'RT-TEST-03',
      status: 'RETURN_INSPECTION',
      version: 2,
      plannedStartAt: '2026-10-14T03:00:00.000Z',
      plannedDueAt: '2026-10-15T03:00:00.000Z',
      pickupBranch: { id: 'branch-1', name: 'Chi nhánh Quận 1' },
      items: [],
      payments: [],
    };
    globalThis.fetch
      .mockResolvedValueOnce(success({
        items: [order],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      }))
      .mockResolvedValueOnce(success({ ...order, version: 3 }));
    const { listOrders, prepareOrderSettlement } = await import('../src/api/client.ts');
    await listOrders({ loadPendingAvailability: false });
    await prepareOrderSettlement('RT-TEST-03', 2, '9007199254740993', '1200', 'Theo policy đã duyệt');

    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({
      expectedVersion: 2,
      depositDeductionVnd: '9007199254740993',
      otherFeeVnd: '1200',
      settlementNote: 'Theo policy đã duyệt',
    });
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
