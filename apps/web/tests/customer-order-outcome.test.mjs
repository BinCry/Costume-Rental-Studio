const { afterEach, beforeEach, expect, it, vi } = globalThis;

const success = (data) =>
  new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/');
  vi.stubGlobal('window', {
    sessionStorage: { getItem: () => 'access-token' },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('maps a requested refund and loads the terminal reason of the customer order', async () => {
  const order = {
    id: 'order-uuid',
    orderCode: 'ORD-2026-1',
    status: 'REJECTED',
    version: 2,
    plannedStartAt: '2026-11-20T10:00:00.000Z',
    plannedDueAt: '2026-11-22T10:00:00.000Z',
    items: [],
    payments: [
      {
        purpose: 'DEPOSIT',
        amountVnd: '100000',
        status: 'SUCCEEDED',
        refunds: [
          {
            amountVnd: '100000',
            status: 'REQUESTED',
            createdAt: '2026-11-19T10:00:00.000Z',
          },
        ],
      },
    ],
  };
  const fetchMock = vi.fn((url) => {
    const path = String(url);
    if (path.includes('/api/v1/rentals/orders/order-uuid/events'))
      return Promise.resolve(
        success({ items: [{ eventType: 'REJECTED', metadataJson: { reason: 'Hết bộ phù hợp' } }] }),
      );
    if (path.includes('/api/v1/rentals/orders?'))
      return Promise.resolve(success({ items: [order] }));
    if (path.includes('/api/v1/customers/me'))
      return Promise.resolve(success({ customerCode: 'KH-1' }));
    throw new Error('Unexpected request ' + path);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { getCustomerOrderEndReason, listCustomerOrders } = await import('../src/api/client.ts');
  const [mapped] = await listCustomerOrders();
  expect(mapped).toMatchObject({
    id: 'ORD-2026-1',
    refundStatus: 'Đang xử lý',
    refund: 0,
    refundPendingAmount: 100000,
    refundUpdatedAt: '19/11/2026 17:00',
  });
  await expect(getCustomerOrderEndReason(mapped.id)).resolves.toBe('Hết bộ phù hợp');
  expect(fetchMock).toHaveBeenCalledWith(
    'https://api.example.test/api/v1/rentals/orders/order-uuid/events?page=1&pageSize=1',
    expect.anything(),
  );
});
