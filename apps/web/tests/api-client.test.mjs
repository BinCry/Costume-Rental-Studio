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
  it('uploads a catalog image with progress and the requested display order', async () => {
    values.set(accessTokenKey, 'studio-access-token');
    const listeners = new Map();
    let formData;
    class TestXMLHttpRequest {
      upload = {
        addEventListener: (event, callback) => listeners.set(`upload:${event}`, callback),
      };
      status = 204;
      open = vi.fn();
      addEventListener = (event, callback) => listeners.set(event, callback);
      send = vi.fn((body) => {
        formData = body;
        listeners.get('upload:progress')({ lengthComputable: true, loaded: 50, total: 100 });
        listeners.get('load')();
      });
    }
    vi.stubGlobal('XMLHttpRequest', TestXMLHttpRequest);
    globalThis.fetch
      .mockResolvedValueOnce(
        success({
          objectKey: 'catalog-staging/models/model-1/image.webp',
          uploadUrl: 'https://s3.example.test/upload',
          fields: { key: 'catalog-staging/models/model-1/image.webp', policy: 'signed-policy' },
        }),
      )
      .mockResolvedValueOnce(success({ id: 'media-1' }));
    const progress = [];

    const { uploadCatalogMedia } = await import('../src/api/client.ts');
    await uploadCatalogMedia(
      'model',
      'model-1',
      new File(['image-content'], 'look.webp', { type: 'image/webp' }),
      'Áo dài xanh',
      4,
      (value) => progress.push(value),
    );

    expect(progress).toEqual([48, 100]);
    expect(formData.get('key')).toBe('catalog-staging/models/model-1/image.webp');
    expect(formData.get('file').name).toBe('look.webp');
    expect(globalThis.fetch.mock.calls[0][0]).toBe(
      'https://api.example.test/api/v1/uploads/presign',
    );
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({
      uploadKey: 'catalog-staging/models/model-1/image.webp',
      sortOrder: 4,
      altText: 'Áo dài xanh',
    });
  });

  it('lists, reorders, and deletes catalog images using the API media contract', async () => {
    values.set(accessTokenKey, 'studio-access-token');
    const media = {
      id: 'media-1',
      objectKey: 'catalog/models/model-1/cover.webp',
      mediaUrl: 'https://cdn.example.test/cover.webp',
      sortOrder: 2,
      altText: 'Áo dài màu xanh',
      modelId: 'model-1',
    };
    globalThis.fetch
      .mockResolvedValueOnce(success([media]))
      .mockResolvedValueOnce(success({ ...media, sortOrder: 0 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const { deleteCatalogMedia, listCatalogMedia, updateCatalogMedia } =
      await import('../src/api/client.ts');
    await expect(listCatalogMedia('model', 'model/1')).resolves.toEqual([media]);
    await expect(updateCatalogMedia('media-1', { sortOrder: 0 })).resolves.toMatchObject({
      id: 'media-1',
      sortOrder: 0,
    });
    await expect(deleteCatalogMedia('media-1')).resolves.toBeUndefined();

    expect(globalThis.fetch.mock.calls.map(([url, init]) => [url, init.method ?? 'GET'])).toEqual([
      ['https://api.example.test/api/v1/catalog/models/model%2F1/media', 'GET'],
      ['https://api.example.test/api/v1/catalog/media/media-1', 'PATCH'],
      ['https://api.example.test/api/v1/catalog/media/media-1', 'DELETE'],
    ]);
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({ sortOrder: 0 });
    expect(new Headers(globalThis.fetch.mock.calls[2][1].headers).get('Authorization')).toBe(
      'Bearer studio-access-token',
    );
  });

  it('requests every report for the selected branch and date range', async () => {
    values.set(accessTokenKey, 'studio-access-token');
    globalThis.fetch
      .mockResolvedValueOnce(
        success({
          items: [{ id: 'branch-1', name: 'Chi nhánh Quận 1' }],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        }),
      )
      .mockResolvedValueOnce(
        success({
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-08T00:00:00.000Z',
          branchId: 'branch-1',
          ordersCreated: 2,
          overdueOrders: 1,
          rentalRevenueVnd: '1200000',
          depositsHeldVnd: '800000',
          completedRefundVnd: '100000',
        }),
      )
      .mockResolvedValueOnce(success({ totalOrders: 2, overdueOrders: 1 }))
      .mockResolvedValueOnce(
        success({ byStatus: [{ status: 'SUCCEEDED', count: 2 }], byMethod: [] }),
      )
      .mockResolvedValueOnce(
        success({
          totalRevenueVnd: '1200000',
          periods: [
            {
              period: '2026-10-03',
              rentalVnd: '1200000',
              extraVnd: '0',
              totalVnd: '1200000',
            },
          ],
        }),
      );

    const { listReports } = await import('../src/api/client.ts');
    await expect(
      listReports('Chi nhánh Quận 1', {
        from: '2026-10-01',
        to: '2026-10-07',
        groupBy: 'day',
      }),
    ).resolves.toMatchObject([
      {
        branch: 'Chi nhánh Quận 1',
        rentalCount: 2,
        rentalRevenue: 1200000,
        revenuePeriods: [{ period: '2026-10-03', rentalVnd: 1200000 }],
      },
    ]);

    const reportCalls = globalThis.fetch.mock.calls.slice(1);
    expect(reportCalls).toHaveLength(4);
    for (const [url] of reportCalls) {
      const parsed = new URL(url);
      expect(parsed.searchParams.get('branchId')).toBe('branch-1');
      expect(parsed.searchParams.get('from')).toBe('2026-09-30T17:00:00.000Z');
      expect(parsed.searchParams.get('to')).toBe('2026-10-07T17:00:00.000Z');
      expect(parsed.searchParams.get('groupBy')).toBe('day');
    }
  });

  it('does not fall back to a chain-wide report when the selected branch is unknown', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      success({
        items: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      }),
    );
    const { listReports } = await import('../src/api/client.ts');

    await expect(listReports('Chi nhánh chưa tải được')).rejects.toMatchObject({
      code: 'BRANCH_CONTEXT_MISSING',
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('sends Ops Agent chat through the authenticated public Agent endpoint', async () => {
    const agentResult = {
      caseId: '10000000-0000-4000-8000-000000000001',
      state: 'SUCCEEDED',
      message: 'Đơn đang chờ xác nhận.',
      evidence: [
        {
          sourceType: 'live_tool',
          sourceId: 'get_rental_order',
          citation: 'RT-TEST-01 · phiên bản 2',
          observedAt: '2026-10-17T09:00:00.000Z',
        },
      ],
      completed: true,
    };
    values.set(accessTokenKey, 'studio-access-token');
    globalThis.fetch.mockResolvedValueOnce(success(agentResult));
    const { sendOpsAgentMessage } = await import('../src/api/client.ts');
    const branchId = '20000000-0000-4000-8000-000000000001';

    await expect(
      sendOpsAgentMessage('Kiểm tra đơn RT-TEST-01', branchId, agentResult.caseId),
    ).resolves.toEqual(agentResult);

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe('/api/v1/agent/messages');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      message: 'Kiểm tra đơn RT-TEST-01',
      branchId,
      caseId: agentResult.caseId,
    });
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer studio-access-token');
  });

  it('sends the selected branch header with Ops Agent case and approval requests', async () => {
    const result = {
      caseId: '10000000-0000-4000-8000-000000000001',
      state: 'SUCCEEDED',
      message: 'Đã cập nhật.',
      evidence: [],
      completed: true,
    };
    const branchId = '20000000-0000-4000-8000-000000000001';
    globalThis.fetch.mockImplementation(() => Promise.resolve(success(result)));
    const {
      getOpsAgentCase,
      confirmOpsAgentCase,
      rejectOpsAgentConfirmation,
      approveOpsAgentAction,
      rejectOpsAgentAction,
      cancelOpsAgentCase,
    } = await import('../src/api/client.ts');

    await getOpsAgentCase(result.caseId, branchId);
    await confirmOpsAgentCase(result.caseId, 'confirmation-1', branchId);
    await rejectOpsAgentConfirmation(result.caseId, 'confirmation-1', branchId);
    await approveOpsAgentAction('approval-1', branchId);
    await rejectOpsAgentAction('approval-1', branchId);
    await cancelOpsAgentCase(result.caseId, branchId);

    expect(globalThis.fetch).toHaveBeenCalledTimes(6);
    for (const [, init] of globalThis.fetch.mock.calls) {
      expect(new Headers(init.headers).get('X-Branch-Id')).toBe(branchId);
    }
  });

  it('explains an unconfigured Agent service without falling back to fixture answers', async () => {
    globalThis.fetch.mockResolvedValueOnce(error(503, 'AI_SERVICE_NOT_CONFIGURED', 'Unavailable'));
    const { sendOpsAgentMessage } = await import('../src/api/client.ts');

    await expect(
      sendOpsAgentMessage('Quy trình nhận đồ trả là gì?', '20000000-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({
      status: 503,
      code: 'AI_SERVICE_NOT_CONFIGURED',
      message:
        'Ops Agent chưa được cấu hình dịch vụ AI. Hãy giữ nguyên câu hỏi và kiểm tra cấu hình máy chủ.',
    });
  });

  it('explains when Ops Agent case analysis is disabled instead of showing a generic server error', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      error(503, 'AGENT_READINESS_ANALYSIS_DISABLED', 'Rental readiness analysis is disabled'),
    );
    const { listOpsAgentCases } = await import('../src/api/client.ts');

    await expect(listOpsAgentCases('20000000-0000-4000-8000-000000000001')).rejects.toMatchObject({
      status: 503,
      code: 'AGENT_READINESS_ANALYSIS_DISABLED',
      message:
        'Tính năng phân tích tình huống đang tắt trên hệ thống. Chưa có phân tích nào được tạo; quản trị viên cần bật tính năng này trong cấu hình máy chủ.',
    });
  });

  it('explains why an existing account cannot be linked to a staff profile', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      error(409, 'STAFF_CONFLICT', 'Account is not eligible for staff linking'),
    );
    const { listStaff } = await import('../src/api/client.ts');

    await expect(listStaff()).rejects.toMatchObject({
      status: 409,
      code: 'STAFF_CONFLICT',
      message:
        'Không thể liên kết tài khoản này với nhân viên. Kiểm tra trạng thái và xác minh email của tài khoản, hoặc kiểm tra mã nhân viên và số điện thoại có bị trùng không.',
    });
  });

  it('loads Agent case state and exposes only the current case actions supported by Studio API', async () => {
    const result = {
      caseId: '10000000-0000-4000-8000-000000000002',
      state: 'WAITING_CONFIRMATION',
      message: 'Đang chờ người vận hành xác nhận.',
      evidence: [],
      pendingConfirmation: {
        confirmationId: '10000000-0000-4000-8000-000000000003',
        summary: 'Tạo yêu cầu chặn lịch vệ sinh.',
        expiresAt: '2026-10-17T10:00:00.000Z',
      },
      completed: false,
    };
    values.set(accessTokenKey, 'studio-access-token');
    globalThis.fetch
      .mockResolvedValueOnce(success(result))
      .mockResolvedValueOnce(
        success({ ...result, state: 'WAITING_APPROVAL', pendingConfirmation: null }),
      )
      .mockResolvedValueOnce(
        success({ ...result, state: 'REJECTED', pendingConfirmation: null, completed: true }),
      )
      .mockResolvedValueOnce(
        success({ ...result, state: 'SUCCEEDED', pendingConfirmation: null, completed: true }),
      )
      .mockResolvedValueOnce(
        success({ ...result, state: 'REJECTED', pendingConfirmation: null, completed: true }),
      )
      .mockResolvedValueOnce(
        success({ ...result, state: 'CANCELLED', pendingConfirmation: null, completed: true }),
      );
    const {
      getOpsAgentCase,
      confirmOpsAgentCase,
      rejectOpsAgentConfirmation,
      approveOpsAgentAction,
      rejectOpsAgentAction,
      cancelOpsAgentCase,
    } = await import('../src/api/client.ts');

    const branchId = '20000000-0000-4000-8000-000000000001';
    await expect(getOpsAgentCase(result.caseId, branchId)).resolves.toEqual(result);
    await confirmOpsAgentCase(result.caseId, result.pendingConfirmation.confirmationId, branchId);
    await rejectOpsAgentConfirmation(
      result.caseId,
      result.pendingConfirmation.confirmationId,
      branchId,
    );
    await approveOpsAgentAction('10000000-0000-4000-8000-000000000004', branchId);
    await rejectOpsAgentAction('10000000-0000-4000-8000-000000000005', branchId);
    await cancelOpsAgentCase(result.caseId, branchId);

    expect(
      globalThis.fetch.mock.calls.map(([url, init]) => [new URL(url).pathname, init.method]),
    ).toEqual([
      ['/api/v1/agent/cases/' + result.caseId, undefined],
      [
        '/api/v1/agent/cases/' +
          result.caseId +
          '/confirmations/' +
          result.pendingConfirmation.confirmationId +
          '/confirm',
        'POST',
      ],
      [
        '/api/v1/agent/cases/' +
          result.caseId +
          '/confirmations/' +
          result.pendingConfirmation.confirmationId +
          '/reject',
        'POST',
      ],
      ['/api/v1/agent/approvals/10000000-0000-4000-8000-000000000004/approve', 'POST'],
      ['/api/v1/agent/approvals/10000000-0000-4000-8000-000000000005/reject', 'POST'],
      ['/api/v1/agent/cases/' + result.caseId + '/cancel', 'POST'],
    ]);
    expect(JSON.parse(globalThis.fetch.mock.calls[3][1].body)).toEqual({});
    expect(JSON.parse(globalThis.fetch.mock.calls[4][1].body)).toEqual({});
    for (const [, init] of globalThis.fetch.mock.calls) {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer studio-access-token');
    }
  });

  it('asks the live knowledge answer endpoint and preserves citation metadata', async () => {
    const answer = {
      outcome: 'answered',
      answer: 'Đây là câu trả lời có căn cứ.',
      provisional: true,
      sources: [
        {
          documentId: 'policy-doc-1',
          heading: 'Chính sách trả đồ',
          citation: 'Mục 4 · trang 2',
          domain: 'staff_internal',
          status: 'UNVERIFIED',
          businessAuthority: false,
        },
      ],
    };
    values.set(accessTokenKey, 'studio-access-token');
    globalThis.fetch.mockResolvedValueOnce(success({ result: answer }));
    const { answerOpsKnowledge } = await import('../src/api/client.ts');

    await expect(answerOpsKnowledge('Chính sách trả đồ?', 4)).resolves.toEqual(answer);

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe('/api/v1/knowledge/answer');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ query: 'Chính sách trả đồ?', topK: 4 });
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer studio-access-token');
  });

  it('groups public catalog variants under one model and follows API pagination', async () => {
    const model = {
      id: 'model-1',
      name: 'Đầm thử',
      category: { name: 'Đầm' },
      media: [{ mediaUrl: 'https://img.example.test/dam.jpg', altText: 'Đầm xanh' }],
    };
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
      .mockResolvedValueOnce(
        success({
          items: [variant('variant-s', 'S', 'DAM-S-XANH')],
          pagination: { page: 1, pageSize: 1, totalItems: 2, totalPages: 2 },
        }),
      )
      .mockResolvedValueOnce(
        success({
          items: [variant('variant-m', 'M', 'DAM-M-XANH')],
          pagination: { page: 2, pageSize: 1, totalItems: 2, totalPages: 2 },
        }),
      );
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
    globalThis.fetch.mockResolvedValueOnce(
      success({
        items: [
          {
            id: 'order-1',
            orderCode: 'RT-TEST-01',
            status: 'ACTIVE',
            version: 3,
            plannedStartAt: '2026-10-14T03:00:00.000Z',
            plannedDueAt: '2026-10-15T03:00:00.000Z',
            pickupBranch: { id: 'branch-1', name: 'Chi nhánh Quận 1' },
            items: [
              {
                id: 'order-item-1',
                allocationStatus: 'ACTIVE',
                returnConditionGrade: null,
                variantId: 'variant-1',
                variant: { sizeCode: 'M', colorCode: 'Đỏ', model: { name: 'Đầm thử' } },
                unit: { id: 'unit-1', unitCode: 'BC-TEST-01', operationalStatus: 'ACTIVE' },
                unitDailyPriceVnd: 100000,
                unitDepositVnd: 300000,
                billableDays: 1,
                accessories: [
                  {
                    id: 'rental-accessory-row-1',
                    modelAccessoryId: 'catalog-accessory-id',
                    accessoryName: 'Khăn',
                    quantityOut: 1,
                    quantityReturned: null,
                  },
                ],
              },
            ],
            payments: [],
          },
        ],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      }),
    );
    const { listOrders } = await import('../src/api/client.ts');

    const [order] = await listOrders({ loadPendingAvailability: false });

    expect(order.items[0]).toMatchObject({
      id: 'order-item-1',
      apiAllocationStatus: 'ACTIVE',
      accessories: [{ id: 'rental-accessory-row-1', name: 'Khăn', quantityOut: 1 }],
    });
  });

  it('loads availability for every order variant and allocates units to matching lines', async () => {
    const order = {
      id: 'order-mixed',
      orderCode: 'RT-MIXED-01',
      status: 'PENDING_CONFIRMATION',
      version: 3,
      plannedStartAt: '2026-10-20T03:00:00.000Z',
      plannedDueAt: '2026-10-21T03:00:00.000Z',
      pickupBranch: { id: 'branch-1', name: 'Chi nhánh Quận 1' },
      items: [
        {
          id: 'order-item-s',
          variantId: 'variant-s',
          variant: { sizeCode: 'S', colorCode: 'Đỏ', model: { name: 'Đầm thử' } },
        },
        {
          id: 'order-item-m',
          variantId: 'variant-m',
          variant: { sizeCode: 'M', colorCode: 'Xanh', model: { name: 'Áo dài' } },
        },
      ],
      payments: [
        { purpose: 'RENTAL', amountVnd: '100000', status: 'SUCCEEDED' },
        { purpose: 'RENTAL', amountVnd: '50000', status: 'PENDING' },
      ],
    };
    globalThis.fetch
      .mockResolvedValueOnce(
        success({
          items: [order],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        }),
      )
      .mockResolvedValueOnce(
        success({ available: true, units: [{ id: 'unit-s', unitCode: 'BC-S' }] }),
      )
      .mockResolvedValueOnce(
        success({ available: true, units: [{ id: 'unit-m', unitCode: 'BC-M' }] }),
      )
      .mockResolvedValueOnce(success({ ...order, status: 'CONFIRMED', version: 4 }));
    const { confirmOrder, listOrders } = await import('../src/api/client.ts');

    const [mapped] = await listOrders();
    expect(mapped.items.map((item) => item.apiVariantId)).toEqual(['variant-s', 'variant-m']);
    expect(mapped.eligibleUnits).toEqual([
      {
        code: 'BC-S',
        variant: 'Đầm thử · S · Đỏ',
        apiVariantId: 'variant-s',
        status: 'READY',
        availableAtFixturePeriod: true,
      },
      {
        code: 'BC-M',
        variant: 'Áo dài · M · Xanh',
        apiVariantId: 'variant-m',
        status: 'READY',
        availableAtFixturePeriod: true,
      },
    ]);
    expect(mapped.money.find((line) => line.label === 'Tiền thuê')).toMatchObject({
      status: 'Có giao dịch đang xác minh',
      tone: 'warning',
    });

    const availabilityRequests = globalThis.fetch.mock.calls.slice(1, 3);
    expect(availabilityRequests.map(([url]) => new URL(url).searchParams.get('variantId'))).toEqual(
      ['variant-s', 'variant-m'],
    );
    await confirmOrder('RT-MIXED-01', 3, ['BC-M', 'BC-S']);
    expect(JSON.parse(globalThis.fetch.mock.calls[3][1].body)).toEqual({
      expectedVersion: 3,
      allocations: [
        { orderItemId: 'order-item-m', unitId: 'unit-m' },
        { orderItemId: 'order-item-s', unitId: 'unit-s' },
      ],
    });
  });

  it('extends an active rental through the existing API contract with the current version', async () => {
    values.set(accessTokenKey, 'studio-access-token');
    globalThis.fetch
      .mockResolvedValueOnce(
        success({
          items: [
            {
              id: 'rental-order-id',
              orderCode: 'RT-EXTEND-01',
              status: 'ACTIVE',
              version: 7,
              plannedStartAt: '2026-10-20T03:00:00.000Z',
              plannedDueAt: '2026-10-21T03:00:00.000Z',
              pickupBranch: { id: 'branch-1', name: 'Chi nhánh Quận 1' },
              items: [],
            },
          ],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        }),
      )
      .mockResolvedValueOnce(success({ id: 'rental-order-id', version: 8 }));
    const { extendOrder, listOrders } = await import('../src/api/client.ts');

    await listOrders({ loadPendingAvailability: false });
    await extendOrder(
      'RT-EXTEND-01',
      7,
      '2026-10-23T03:30:00.000Z',
      'Khách cần thêm thời gian sử dụng',
    );

    const [url, init] = globalThis.fetch.mock.calls[1];
    expect(new URL(url).pathname).toBe('/api/v1/rentals/orders/rental-order-id/extend');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      expectedVersion: 7,
      newDueAt: '2026-10-23T03:30:00.000Z',
      reason: 'Khách cần thêm thời gian sử dụng',
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
      .mockResolvedValueOnce(
        success({
          items: [order],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        }),
      )
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
      .mockResolvedValueOnce(
        success({
          items: [order],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        }),
      )
      .mockResolvedValueOnce(success({ ...order, status: 'RETURN_INSPECTION', version: 5 }));
    const { listOrders, returnOrder } = await import('../src/api/client.ts');
    await listOrders({ loadPendingAvailability: false });
    await returnOrder('RT-MISSING-01', 4, false, 'Đã xác minh với khách', [
      {
        orderItemId: 'item-1',
        isMissing: true,
        damageNotes: 'Khách báo thất lạc trong quá trình sử dụng.',
        evidence: [
          {
            uploadKey: 'rental-staging/case.jpg',
            contentType: 'image/jpeg',
            size: 10,
          },
        ],
        accessories: [],
      },
    ]);

    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({
      expectedVersion: 4,
      partial: false,
      returnNotes: 'Đã xác minh với khách',
      items: [
        {
          orderItemId: 'item-1',
          isMissing: true,
          damageNotes: 'Khách báo thất lạc trong quá trình sử dụng.',
          evidence: [
            {
              uploadKey: 'rental-staging/case.jpg',
              contentType: 'image/jpeg',
              size: 10,
            },
          ],
          accessories: [],
        },
      ],
    });
  });

  it('stores a login token and attaches it to later requests', async () => {
    const fetchMock = globalThis.fetch;
    fetchMock
      .mockResolvedValueOnce(success({ accessToken: 'access-1', user: { id: 'user-1' } }))
      .mockResolvedValueOnce(
        success({
          id: 'user-1',
          displayName: 'Khách thử nghiệm',
          email: 'khach@example.com',
          roles: [],
        }),
      );

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
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Authorization')).toBe(
      'Bearer access-1',
    );
  });

  it('maps validation errors to a safe Vietnamese message and keeps structured details', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      error(422, 'VALIDATION_ERROR', 'Email chưa hợp lệ', {
        email: 'Kiểm tra định dạng email',
      }),
    );
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
    globalThis.fetch.mockResolvedValueOnce(
      new Response('<html>secret stack trace</html>', { status: 502 }),
    );
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
      .mockResolvedValueOnce(
        success({
          id: 'user-1',
          displayName: 'Khách thử nghiệm',
          email: 'khach@example.com',
          roles: [],
        }),
      );

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
      deposit: {
        dueVnd: '0',
        paidVnd: '0',
        deductionVnd: '0',
        refundedVnd: '0',
        refundRemainingVnd: '0',
      },
      extra: { dueVnd: '0', paidVnd: '0', remainingVnd: '0' },
      outstandingVnd: '0',
      canPickup: true,
      canComplete: false,
    };
    globalThis.fetch
      .mockResolvedValueOnce(
        success({
          items: [{ ...order, items: [] }],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        }),
      )
      .mockResolvedValueOnce(success(order))
      .mockResolvedValueOnce(success(snapshot));
    const { ApiClientError, completeOrderSettlement, listOrders } =
      await import('../src/api/client.ts');
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
      deposit: {
        dueVnd: '0',
        paidVnd: '0',
        deductionVnd: '9007199254740993',
        refundedVnd: '0',
        refundRemainingVnd: '0',
      },
      extra: { dueVnd: '0', paidVnd: '0', remainingVnd: '0' },
      outstandingVnd: '0',
      canPickup: true,
      canComplete: true,
    };
    globalThis.fetch
      .mockResolvedValueOnce(
        success({
          items: [{ ...order, items: [] }],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        }),
      )
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
      .mockResolvedValueOnce(
        success({
          items: [order],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        }),
      )
      .mockResolvedValueOnce(success({ ...order, version: 6 }));
    const { assessOrderReturn, listOrders } = await import('../src/api/client.ts');
    await listOrders({ loadPendingAvailability: false });
    await assessOrderReturn('RT-TEST-04', 5, [
      {
        orderItemId: 'item-1',
        damageFeeVnd: '1200',
        missingFeeVnd: '0',
        accessories: [
          { accessoryId: 'rental-accessory-row-1', damageFeeVnd: '0', missingFeeVnd: '250' },
        ],
      },
    ]);

    expect(globalThis.fetch.mock.calls[1][0]).toBe(
      'https://api.example.test/api/v1/rentals/orders/order-1/assessment',
    );
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({
      expectedVersion: 5,
      items: [
        {
          orderItemId: 'item-1',
          damageFeeVnd: '1200',
          missingFeeVnd: '0',
          accessories: [
            { accessoryId: 'rental-accessory-row-1', damageFeeVnd: '0', missingFeeVnd: '250' },
          ],
        },
      ],
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
      items: [
        {
          id: 'order-item-1',
          accessories: [
            {
              id: 'accessory-row-1',
              accessoryName: 'Khăn choàng',
              quantityOut: 2,
              quantityReturned: 1,
              conditionIn: 'FAIR',
              damageFeeVnd: '0',
              missingFeeVnd: '0',
            },
          ],
        },
      ],
    };
    globalThis.fetch
      .mockResolvedValueOnce(
        success({
          items: [listedOrder],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        }),
      )
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
      .mockResolvedValueOnce(
        success({
          items: [order],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        }),
      )
      .mockResolvedValueOnce(
        success([
          {
            id: 'refund-1',
            paymentId: 'payment-1',
            amountVnd: '5000',
            status: 'PROCESSING',
          },
        ]),
      );
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
      .mockResolvedValueOnce(
        success({
          items: [order],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        }),
      )
      .mockResolvedValueOnce(success({ ...order, version: 3 }));
    const { listOrders, prepareOrderSettlement } = await import('../src/api/client.ts');
    await listOrders({ loadPendingAvailability: false });
    await prepareOrderSettlement(
      'RT-TEST-03',
      2,
      '9007199254740993',
      '1200',
      'Theo policy đã duyệt',
    );

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
    await expect(logout()).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
    });
    expect(hasAccessToken()).toBe(false);
    expect(values.has(accessTokenKey)).toBe(false);
  });
});
