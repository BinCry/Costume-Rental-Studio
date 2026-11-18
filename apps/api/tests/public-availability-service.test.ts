import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  branch: vi.fn(),
  variants: vi.fn(),
  policy: vi.fn(),
  count: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    branch: { findFirst: mocks.branch },
    costumeVariant: { findMany: mocks.variants },
    rentalPolicyVersion: { findFirst: mocks.policy },
    costumeUnit: { count: mocks.count },
  },
}));

const { checkPublicAvailabilityBatch } = await import('../src/modules/public/public.service.js');
const branchId = '10000000-0000-4000-8000-000000000001';
const firstId = '20000000-0000-4000-8000-000000000001';
const secondId = '20000000-0000-4000-8000-000000000002';

describe('public batch availability service', () => {
  it('looks up branch and policy once and returns each unique variant in request order', async () => {
    vi.resetAllMocks();
    mocks.branch.mockResolvedValue({ id: branchId });
    mocks.variants.mockResolvedValue([
      { id: secondId, cleaningBufferMinutes: null },
      { id: firstId, cleaningBufferMinutes: 30 },
    ]);
    mocks.policy.mockResolvedValue({
      lateReturnBufferMinutes: 60,
      defaultCleaningBufferMinutes: 120,
    });
    mocks.count.mockImplementation(({ where }: { where: { variantId: string } }) =>
      Promise.resolve(where.variantId === firstId ? 2 : 0),
    );

    const result = await checkPublicAvailabilityBatch({
      variantIds: [firstId, secondId, firstId],
      pickupBranchId: branchId,
      plannedStartAt: new Date('2099-11-20T10:00:00.000Z'),
      plannedDueAt: new Date('2099-11-22T10:00:00.000Z'),
    });
    expect(mocks.branch).toHaveBeenCalledOnce();
    expect(mocks.policy).toHaveBeenCalledOnce();
    expect(mocks.count).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      { variantId: firstId, pickupBranchId: branchId, available: true, availableUnits: 2 },
      { variantId: secondId, pickupBranchId: branchId, available: false, availableUnits: 0 },
    ]);
  });
});
