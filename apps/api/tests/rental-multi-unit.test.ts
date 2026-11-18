import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('../src/modules/branches/branch.service.js', () => ({
  lockActiveBranch: vi.fn().mockResolvedValue({ status: 'ACTIVE' }),
}));

const service = await import('../src/modules/rentals/rental.service.js');

const customerUserId = '10000000-0000-4000-8000-000000000001';
const branchId = '10000000-0000-4000-8000-000000000002';
const variantId = '10000000-0000-4000-8000-000000000003';
const otherVariantId = '10000000-0000-4000-8000-000000000004';
const actor = {
  id: '10000000-0000-4000-8000-000000000005',
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [
    {
      branchId: null,
      branch: null,
      role: {
        isActive: true,
        roleCode: 'ADMIN',
        rolePermissions: [{ permission: { module: 'rentals', action: 'manage', scope: 'ALL' } }],
      },
    },
  ],
} as never;

function variant(id: string, price: bigint, deposit: bigint) {
  return {
    id,
    variantCode: id === variantId ? 'AD-M' : 'AD-L',
    modelId: '10000000-0000-4000-8000-000000000006',
    status: 'ACTIVE',
    dailyRentalPriceVnd: price,
    depositAmountVnd: deposit,
    cleaningBufferMinutes: null,
    model: { status: 'ACTIVE', category: { status: 'ACTIVE' }, accessories: [] },
  };
}

function transaction(availableUnits: Record<string, number>) {
  const tx = {
    customer: {
      findUnique: vi.fn().mockResolvedValue({
        userId: customerUserId,
        user: { displayName: 'Khách mẫu', phone: '+84901234567' },
      }),
    },
    costumeVariant: {
      findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          [variant(variantId, 100_000n, 300_000n), variant(otherVariantId, 50_000n, 100_000n)]
            // Mirror Prisma: an `in` filter returns each matching row once.
            .filter((row) => where.id.in.includes(row.id)),
        ),
      ),
    },
    rentalPolicyVersion: {
      findFirst: vi.fn().mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000007',
        versionCode: 'P1',
        billingDayMode: 'ROLLING_24H',
        minRentalDays: 1,
        maxRentalDays: 14,
        quoteValidHours: 24,
        lateGraceMinutes: 60,
        lateFeePercentPerDay: 30,
        lateReturnBufferMinutes: 0,
        defaultCleaningBufferMinutes: 0,
      }),
    },
    costumeUnit: {
      count: vi.fn(({ where }: { where: { variantId: string } }) =>
        Promise.resolve(availableUnits[where.variantId] ?? 0),
      ),
    },
    rentalOrder: {
      create: vi.fn((args: unknown) => Promise.resolve(args)),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    rentalOrderEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  return tx;
}

function input(variantIds: string[]) {
  return {
    customerUserId,
    pickupBranchId: branchId,
    channel: 'STAFF',
    plannedStartAt: new Date('2026-12-01T08:00:00.000Z'),
    plannedDueAt: new Date('2026-12-03T08:00:00.000Z'),
    items: variantIds.map((id) => ({ variantId: id, accessories: [] })),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('renting several units of the same variant', () => {
  it('quotes two units of one variant at twice the rental and deposit', async () => {
    transaction({ [variantId]: 2 });

    const quote = await service.createQuote(actor, input([variantId, variantId]));

    expect(quote.subtotalVnd).toBe(400_000n);
    expect(quote.depositVnd).toBe(600_000n);
    expect(quote.totalDueVnd).toBe(1_000_000n);
    expect(quote.items).toEqual([
      expect.objectContaining({
        variantId,
        quantity: 2,
        rentalAmountVnd: 400_000n,
        availableUnits: 2,
      }),
    ]);
    expect(quote.available).toBe(true);
  });

  it('marks the quote unavailable when the branch has fewer ready units than requested', async () => {
    transaction({ [variantId]: 1 });

    const quote = await service.createQuote(actor, input([variantId, variantId]));

    expect(quote.available).toBe(false);
  });

  it('counts each variant separately in a mixed order', async () => {
    transaction({ [variantId]: 2, [otherVariantId]: 1 });

    const quote = await service.createQuote(actor, input([variantId, otherVariantId, variantId]));

    expect(quote.subtotalVnd).toBe(500_000n);
    expect(quote.depositVnd).toBe(700_000n);
    expect(quote.items).toEqual([
      expect.objectContaining({ variantId, quantity: 2 }),
      expect.objectContaining({ variantId: otherVariantId, quantity: 1 }),
    ]);
    expect(quote.available).toBe(true);
  });

  it('creates one order item per requested unit', async () => {
    const tx = transaction({ [variantId]: 2 });

    await service.createOrder(actor, input([variantId, variantId]));

    const created = tx.rentalOrder.create.mock.calls[0]![0] as {
      data: { items: { create: { variantId: string; unitDailyPriceVnd: bigint }[] } };
    };
    expect(created.data.items.create).toHaveLength(2);
    expect(created.data.items.create.map((item) => item.variantId)).toEqual([variantId, variantId]);
  });

  it('stores contact details on this order without changing the customer profile', async () => {
    const tx = transaction({ [variantId]: 1 });
    await service.createOrder(actor, {
      ...input([variantId]),
      contactName: 'Người nhận đồ',
      contactPhone: '+84909998877',
    });
    const created = tx.rentalOrder.create.mock.calls[0]![0] as {
      data: { contactName: string; contactPhone: string };
    };
    expect(created.data.contactName).toBe('Người nhận đồ');
    expect(created.data.contactPhone).toBe('+84909998877');
    expect(tx.customer.findUnique).toHaveBeenCalledOnce();
  });

  it('copies profile contact when a staff order omits contact fields', async () => {
    const tx = transaction({ [variantId]: 1 });
    await service.createOrder(actor, input([variantId]));
    const created = tx.rentalOrder.create.mock.calls[0]![0] as {
      data: { contactName: string; contactPhone: string };
    };
    expect(created.data.contactName).toBe('Khách mẫu');
    expect(created.data.contactPhone).toBe('+84901234567');
  });

  it('creates an order only when the price and policy still match the confirmed quote', async () => {
    const tx = transaction({ [variantId]: 1 });
    const expectedQuote = {
      policyVersionId: '10000000-0000-4000-8000-000000000007',
      subtotalVnd: 200_000n,
      depositVnd: 300_000n,
      discountVnd: 0n,
      totalDueVnd: 500_000n,
      items: [{ variantId, dailyRentalPriceVnd: 100_000n, depositAmountVnd: 300_000n }],
    };
    await service.createOrder(actor, { ...input([variantId]), expectedQuote });
    expect(tx.rentalOrder.create).toHaveBeenCalledOnce();

    tx.rentalOrder.create.mockClear();
    await expect(
      service.createOrder(actor, {
        ...input([variantId]),
        expectedQuote: { ...expectedQuote, totalDueVnd: 600_000n },
      }),
    ).rejects.toMatchObject({ code: 'QUOTE_CHANGED', statusCode: 409 });
    expect(tx.rentalOrder.create).not.toHaveBeenCalled();
  });

  it('returns the original order for a retry with the same client request id', async () => {
    const tx = transaction({ [variantId]: 1 });
    const clientRequestId = '10000000-0000-4000-8000-000000000008';
    const request = { ...input([variantId]), clientRequestId };
    await service.createOrder(actor, request);
    const stored = tx.rentalOrder.create.mock.calls[0]![0] as {
      data: { requestFingerprint: string };
    };
    const original = {
      id: '10000000-0000-4000-8000-000000000009',
      customerUserId,
      pickupBranchId: branchId,
      requestFingerprint: stored.data.requestFingerprint,
    };
    tx.rentalOrder.findUnique.mockResolvedValue(original);

    const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-12-05T00:00:00Z').getTime());
    let retried: unknown;
    try {
      retried = await service.createOrder(actor, request);
    } finally {
      clock.mockRestore();
    }
    expect(retried).toBe(original);
    expect(tx.rentalOrder.create).toHaveBeenCalledOnce();
    expect(tx.customer.findUnique).toHaveBeenCalledOnce();
  });

  it('rejects reuse of a client request id with different order details', async () => {
    const tx = transaction({ [variantId]: 1 });
    const clientRequestId = '10000000-0000-4000-8000-000000000008';
    await service.createOrder(actor, { ...input([variantId]), clientRequestId });
    const stored = tx.rentalOrder.create.mock.calls[0]![0] as {
      data: { requestFingerprint: string };
    };
    tx.rentalOrder.findUnique.mockResolvedValue({
      customerUserId,
      pickupBranchId: branchId,
      requestFingerprint: stored.data.requestFingerprint,
    });

    await expect(
      service.createOrder(actor, {
        ...input([variantId]),
        clientRequestId,
        contactName: 'Người khác',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', statusCode: 409 });
    expect(tx.rentalOrder.create).toHaveBeenCalledOnce();
  });

  it('still rejects an unknown variant', async () => {
    const tx = transaction({});
    tx.costumeVariant.findMany.mockResolvedValue([]);

    await expect(service.createQuote(actor, input([variantId, variantId]))).rejects.toMatchObject({
      code: 'VARIANT_NOT_FOUND',
    });
  });
});
