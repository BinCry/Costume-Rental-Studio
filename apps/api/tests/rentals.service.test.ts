/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));

const service = await import('../src/modules/rentals/rental.service.js');

const orderId = '10000000-0000-4000-8000-000000000001';
const unitId = '10000000-0000-4000-8000-000000000002';
const itemId = '10000000-0000-4000-8000-000000000003';
const actor = {
  id: '10000000-0000-4000-8000-000000000004',
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

function activeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    customerUserId: '10000000-0000-4000-8000-000000000005',
    pickupBranchId: '10000000-0000-4000-8000-000000000006',
    status: 'ACTIVE',
    version: 7,
    plannedStartAt: new Date('2026-10-10T08:00:00.000Z'),
    plannedDueAt: new Date('2026-10-12T08:00:00.000Z'),
    policyVersion: {
      billingDayMode: 'ROLLING_24H',
      maxRentalDays: 14,
      lateReturnBufferMinutes: 720,
      defaultCleaningBufferMinutes: 720,
    },
    payments: [],
    items: [
      {
        id: itemId,
        unitId,
        variantId: '10000000-0000-4000-8000-000000000007',
        occupiedFrom: new Date('2026-10-10T08:00:00.000Z'),
        occupiedUntil: new Date('2026-10-12T08:00:00.000Z'),
        billableDays: 2,
        unitDailyPriceVnd: 100_000n,
        unitDepositVnd: 200_000n,
        accessories: [],
        variant: { modelId: '10000000-0000-4000-8000-000000000008', cleaningBufferMinutes: 1_440 },
      },
    ],
    ...overrides,
  };
}

function transactionFor(order: ReturnType<typeof activeOrder>) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
    rentalOrder: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(order),
      update: vi.fn().mockResolvedValue(order),
    },
    costumeUnit: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: unitId,
          variantId: order.items[0]!.variantId,
          currentBranchId: order.pickupBranchId,
          operationalStatus: 'READY',
        },
      ]),
    },
    rentalOrderItem: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    unitBlock: { findFirst: vi.fn().mockResolvedValue(null) },
    stockTransferItem: { findFirst: vi.fn().mockResolvedValue(null) },
    rentalOrderEvent: { create: vi.fn().mockResolvedValue({}) },
    costumeVariant: { findMany: vi.fn() },
  };
  mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  return tx;
}

beforeEach(() => vi.resetAllMocks());

describe('rental timing and late-fee policy', () => {
  const availabilityBranchId = '10000000-0000-4000-8000-000000000016';

  function availabilityActor(input: {
    permissionAction: 'read' | 'manage';
    permissionScope: 'BRANCH' | 'ALL';
    assignmentBranchId: string | null;
  }) {
    return {
      id: '10000000-0000-4000-8000-000000000017',
      status: 'ACTIVE',
      employee: { employmentStatus: 'ACTIVE' },
      roleAssignments: [
        {
          branchId: input.assignmentBranchId,
          branch: input.assignmentBranchId ? { status: 'ACTIVE' } : null,
          role: {
            isActive: true,
            roleCode: input.assignmentBranchId ? 'SALES_STAFF' : 'ADMIN',
            rolePermissions: [
              {
                permission: {
                  module: 'rentals',
                  action: input.permissionAction,
                  scope: input.permissionScope,
                },
              },
            ],
          },
        },
      ],
    } as never;
  }

  it.each([
    {
      name: 'read permission for the branch',
      permissionAction: 'read' as const,
      permissionScope: 'BRANCH' as const,
      assignmentBranchId: availabilityBranchId,
    },
    {
      name: 'manage permission for the branch',
      permissionAction: 'manage' as const,
      permissionScope: 'BRANCH' as const,
      assignmentBranchId: availabilityBranchId,
    },
    {
      name: 'global manage permission',
      permissionAction: 'manage' as const,
      permissionScope: 'ALL' as const,
      assignmentBranchId: null,
    },
  ])('allows availability lookup with $name', async (permission) => {
    mocks.transaction.mockRejectedValueOnce(new Error('availability query reached'));

    await expect(
      service.checkAvailability(availabilityActor(permission), {
        variantId: '10000000-0000-4000-8000-000000000018',
        pickupBranchId: availabilityBranchId,
        plannedStartAt: new Date('2026-10-20T08:00:00.000Z'),
        plannedDueAt: new Date('2026-10-21T08:00:00.000Z'),
      }),
    ).rejects.toThrow('availability query reached');
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it('rejects availability lookup outside a branch-scoped assignment', async () => {
    await expect(
      service.checkAvailability(
        availabilityActor({
          permissionAction: 'manage',
          permissionScope: 'BRANCH',
          assignmentBranchId: availabilityBranchId,
        }),
        {
          variantId: '10000000-0000-4000-8000-000000000018',
          pickupBranchId: '10000000-0000-4000-8000-000000000019',
          plannedStartAt: new Date('2026-10-20T08:00:00.000Z'),
          plannedDueAt: new Date('2026-10-21T08:00:00.000Z'),
        },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('adds the late-return reserve to garment preparation time', () => {
    const due = new Date('2026-10-14T08:00:00.000Z');
    expect(service.bookingReservationUntil(due, 1_440, 720)).toEqual(
      new Date('2026-10-15T20:00:00.000Z'),
    );
    expect(service.bookingReservationUntil(due, 1_440, 2_880)).toEqual(
      new Date('2026-10-17T08:00:00.000Z'),
    );
    expect(service.bookingReservationUntil(due, 720, null, 720)).toEqual(
      new Date('2026-10-15T08:00:00.000Z'),
    );
    expect(service.bookingReservationUntil(due, 720, 1_440, 720)).toEqual(
      new Date('2026-10-15T20:00:00.000Z'),
    );
  });

  it('keeps prorated discounts within each garment price when small items create rounding remainders', () => {
    const items = [
      { id: itemId, unitDailyPriceVnd: 100n, billableDays: 1 },
      { id: '10000000-0000-4000-8000-000000000009', unitDailyPriceVnd: 1n, billableDays: 1 },
      { id: '10000000-0000-4000-8000-000000000010', unitDailyPriceVnd: 1n, billableDays: 1 },
      { id: '10000000-0000-4000-8000-000000000011', unitDailyPriceVnd: 1n, billableDays: 1 },
      { id: '10000000-0000-4000-8000-000000000012', unitDailyPriceVnd: 1n, billableDays: 1 },
    ];
    const now = new Date('2026-10-12T08:00:00.000Z');
    const result = service.calculateItemLateFees(
      items,
      items.map((item) => item.id),
      now,
      now,
      0,
      0,
      100n,
    );
    expect(result.items.every((item) => BigInt(item.baseRentalVnd) >= 0n)).toBe(true);
    expect(result.items.reduce((sum, item) => sum + BigInt(item.baseRentalVnd), 0n)).toBe(4n);
  });
  it('charges only returned garments, allocates order discount, and caps the fee per garment', () => {
    const items = [
      { id: itemId, unitDailyPriceVnd: 100_000n, billableDays: 2 },
      { id: '10000000-0000-4000-8000-000000000009', unitDailyPriceVnd: 100_000n, billableDays: 1 },
    ];
    const due = new Date('2026-10-12T08:00:00.000Z');
    const graceEnd = new Date('2026-10-12T09:00:00.000Z');
    const threeLateDays = new Date(graceEnd.getTime() + 2 * 86_400_000 + 1);
    const partial = service.calculateItemLateFees(
      items,
      [itemId],
      due,
      threeLateDays,
      60,
      30,
      30_000n,
    );
    expect(partial.items).toEqual([
      { orderItemId: itemId, baseRentalVnd: '180000', lateDays: 3, lateFeeVnd: '162000' },
    ]);
    const capped = service.calculateItemLateFees(
      items,
      [itemId],
      due,
      new Date(graceEnd.getTime() + 4 * 86_400_000),
      60,
      30,
      30_000n,
    );
    expect(capped.lateFeeVnd).toBe(180_000n);
  });
});

describe('rental extension and amendment service', () => {
  it('leaves unassigned items unassigned when cancelling an order', async () => {
    const order = activeOrder({
      status: 'PENDING_CONFIRMATION',
      items: [
        {
          ...activeOrder().items[0],
          unitId: null,
          allocationStatus: 'UNASSIGNED',
        },
      ],
    });
    const tx = transactionFor(order);

    await service.cancelOrder(actor, orderId, 7, 'Customer request');

    expect(tx.rentalOrderItem.updateMany).toHaveBeenCalledWith({
      where: { orderId, unitId: { not: null } },
      data: { allocationStatus: 'RELEASED' },
    });
  });

  it('extends every allocation atomically and records the extension fee as EXTRA', async () => {
    const order = activeOrder();
    const tx = transactionFor(order);

    await service.extendOrder(actor, orderId, {
      expectedVersion: 7,
      newDueAt: new Date('2026-10-14T08:00:00.000Z'),
      reason: 'Customer requested more time',
    });

    expect(tx.rentalOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          additionalRentalFeeVnd: { increment: 200_000n },
          plannedDueAt: new Date('2026-10-14T08:00:00.000Z'),
          items: {
            update: [
              expect.objectContaining({
                data: {
                  occupiedUntil: new Date('2026-10-15T20:00:00.000Z'),
                  billableDays: 4,
                },
              }),
            ],
          },
        }),
      }),
    );
    expect(tx.rentalOrderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'ORDER_EXTENDED' }),
      }),
    );
  });

  it('rejects a stale extension version, preventing concurrent double extension', async () => {
    transactionFor(activeOrder());
    await expect(
      service.extendOrder(actor, orderId, {
        expectedVersion: 6,
        newDueAt: new Date('2026-10-14T08:00:00.000Z'),
        reason: 'Stale request',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'ORDER_VERSION_CONFLICT' });
  });

  it('rolls back an extension when any allocated unit has a scheduling conflict', async () => {
    const tx = transactionFor(activeOrder());
    tx.unitBlock.findFirst.mockResolvedValue({ id: 'conflicting-block' });

    await expect(
      service.extendOrder(actor, orderId, {
        expectedVersion: 7,
        newDueAt: new Date('2026-10-14T08:00:00.000Z'),
        reason: 'Conflicting request',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'UNIT_UNAVAILABLE' });
    expect(tx.rentalOrder.update).not.toHaveBeenCalled();
  });

  it('blocks handover if the assigned unit is still allocated to an overdue customer', async () => {
    const order = activeOrder({
      status: 'READY_FOR_PICKUP',
      promotionDiscountVnd: 0n,
      additionalRentalFeeVnd: 0n,
      payments: [
        { purpose: 'RENTAL', status: 'SUCCEEDED', amountVnd: 200_000n },
        { purpose: 'DEPOSIT', status: 'SUCCEEDED', amountVnd: 200_000n },
      ],
    });
    const tx = transactionFor(order);
    tx.rentalOrderItem.findFirst.mockResolvedValueOnce({ id: 'previous-active-item' });

    await expect(
      service.pickupOrder(actor, orderId, {
        expectedVersion: 7,
        items: [{ orderItemId: itemId, conditionGrade: 'GOOD', evidence: [] }],
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'UNIT_STILL_WITH_CUSTOMER' });

    expect(tx.rentalOrder.update).not.toHaveBeenCalled();
    expect(tx.rentalOrderEvent.create).not.toHaveBeenCalled();
  });

  it('requires cancellation of pending gateway payments before amendment', async () => {
    transactionFor(
      activeOrder({
        status: 'CONFIRMED',
        payments: [{ status: 'PENDING', method: 'PAYMENT_GATEWAY' }],
      }),
    );
    await expect(
      service.amendOrderItem(actor, orderId, itemId, {
        expectedVersion: 7,
        newVariantId: '10000000-0000-4000-8000-000000000009',
        newUnitId: '10000000-0000-4000-8000-000000000010',
        reason: 'Size exchange',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'PENDING_PAYMENT_REQUIRES_CANCELLATION' });
  });

  it('replaces variant and unit snapshots and records the financial deltas', async () => {
    const nextUnitId = '10000000-0000-4000-8000-000000000010';
    const nextVariantId = '10000000-0000-4000-8000-000000000009';
    const order = activeOrder({ status: 'CONFIRMED' });
    const tx = transactionFor(order);
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: orderId }])
      .mockResolvedValueOnce([{ id: unitId }, { id: nextUnitId }]);
    tx.costumeUnit.findMany.mockResolvedValue([
      { id: unitId, variantId: order.items[0]!.variantId },
      {
        id: nextUnitId,
        variantId: nextVariantId,
        currentBranchId: order.pickupBranchId,
        operationalStatus: 'READY',
      },
    ]);
    tx.costumeVariant.findMany.mockResolvedValue([
      {
        id: nextVariantId,
        status: 'ACTIVE',
        dailyRentalPriceVnd: 150_000n,
        depositAmountVnd: 250_000n,
        model: {
          id: '10000000-0000-4000-8000-000000000008',
          status: 'ACTIVE',
          category: { status: 'ACTIVE' },
        },
      },
    ]);

    await service.amendOrderItem(actor, orderId, itemId, {
      expectedVersion: 7,
      newVariantId: nextVariantId,
      newUnitId: nextUnitId,
      reason: 'Size exchange',
    });

    expect(tx.rentalOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: expect.objectContaining({
            update: expect.objectContaining({
              data: expect.objectContaining({
                variantId: nextVariantId,
                unitId: nextUnitId,
                unitDailyPriceVnd: 150_000n,
                unitDepositVnd: 250_000n,
              }),
            }),
          }),
        }),
      }),
    );
    expect(tx.rentalOrderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'ORDER_ITEM_AMENDED' }),
      }),
    );
  });
});

describe('legacy late-fee formula compatibility', () => {
  it('preserves the original gross-order calculation for legacy policy versions', () => {
    const items = [
      { id: itemId, unitDailyPriceVnd: 100_000n, billableDays: 2 },
      { id: '10000000-0000-4000-8000-000000000009', unitDailyPriceVnd: 50_000n, billableDays: 1 },
    ];
    const due = new Date('2026-10-12T08:00:00.000Z');
    const afterGrace = new Date(due.getTime() + 60 * 60_000 + 24 * 60 * 60_000 + 1);
    expect(service.calculateLegacyLateFee(items, due, afterGrace, 60, 50)).toEqual({
      lateDays: 2,
      lateFeeVnd: 250_000n,
    });
  });
});
