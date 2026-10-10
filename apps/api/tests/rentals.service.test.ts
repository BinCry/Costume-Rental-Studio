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
    policyVersion: { billingDayMode: 'ROLLING_24H', maxRentalDays: 14 },
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
        variant: { modelId: '10000000-0000-4000-8000-000000000008' },
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
    rentalOrderItem: { findFirst: vi.fn().mockResolvedValue(null) },
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

describe('rental extension and amendment service', () => {
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
