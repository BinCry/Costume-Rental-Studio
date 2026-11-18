import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));

const { createPublicRentalEstimate } = await import('../src/modules/rentals/rental.service.js');
const branchId = '10000000-0000-4000-8000-000000000001';
const variantId = '20000000-0000-4000-8000-000000000001';

describe('guest rental estimate', () => {
  it('uses active server policy, prices and physical capacity without customer or promotion', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: branchId, status: 'ACTIVE' }]),
      customer: { findUnique: vi.fn() },
      promotion: { findUnique: vi.fn() },
      rentalPolicyVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'policy-1',
          versionCode: 'POLICY-1',
          billingDayMode: 'ROLLING_24_HOURS',
          minRentalDays: 1,
          maxRentalDays: 14,
          quoteValidHours: 24,
          lateGraceMinutes: 60,
          lateFeePercentPerDay: 10,
          lateReturnBufferMinutes: 60,
          defaultCleaningBufferMinutes: 120,
        }),
      },
      costumeVariant: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: variantId,
            variantCode: 'AD-M',
            modelId: 'model-1',
            status: 'ACTIVE',
            model: { status: 'ACTIVE', category: { status: 'ACTIVE' } },
            dailyRentalPriceVnd: 150_000n,
            depositAmountVnd: 200_000n,
            cleaningBufferMinutes: null,
          },
        ]),
      },
      costumeUnit: { count: vi.fn().mockResolvedValue(2) },
    };
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    const result = await createPublicRentalEstimate({
      pickupBranchId: branchId,
      plannedStartAt: new Date('2099-11-20T10:00:00.000Z'),
      plannedDueAt: new Date('2099-11-22T10:00:00.000Z'),
      items: [
        { variantId, accessories: [] },
        { variantId, accessories: [] },
      ],
    });
    expect(result).toMatchObject({
      subtotalVnd: 600_000n,
      depositVnd: 400_000n,
      discountVnd: 0n,
      totalDueVnd: 1_000_000n,
      available: true,
      promotion: null,
    });
    expect(result.items[0]).toMatchObject({ variantId, quantity: 2, availableUnits: 2 });
    expect(tx.customer.findUnique).not.toHaveBeenCalled();
    expect(tx.promotion.findUnique).not.toHaveBeenCalled();
  });
});
