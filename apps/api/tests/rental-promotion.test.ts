import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: vi.fn() } }));

const { resolvePromotion } = await import('../src/modules/rentals/rental.service.js');

const customerUserId = '10000000-0000-4000-8000-000000000001';
const mocks = {
  findUnique: vi.fn(),
  queryRaw: vi.fn(),
  count: vi.fn(),
};
const tx = {
  promotion: { findUnique: mocks.findUnique },
  $queryRaw: mocks.queryRaw,
  rentalOrder: { count: mocks.count },
} as never;

function promotion(overrides: Record<string, unknown> = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000002',
    code: 'TESTT1V',
    isActive: true,
    startAt: new Date('2026-01-01T00:00:00.000Z'),
    endAt: new Date('2099-01-01T00:00:00.000Z'),
    minOrderAmountVnd: 600_000n,
    discountType: 'PERCENT',
    discountValue: 15n,
    maxDiscountVnd: 80_000n,
    perCustomerLimit: 1,
    totalUsageLimit: null,
    ...overrides,
  };
}

async function rejection(input: { code?: string; subtotal?: bigint }) {
  try {
    await resolvePromotion(
      tx,
      { promotionCode: input.code ?? 'TESTT1V' } as never,
      customerUserId,
      input.subtotal ?? 700_000n,
    );
  } catch (error) {
    return error as { statusCode: number; code: string; details?: Record<string, unknown> };
  }
  throw new Error('Expected the promotion to be rejected');
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.queryRaw.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});

describe('promotion rejection reasons', () => {
  it('tells an unknown code apart from the other reasons', async () => {
    mocks.findUnique.mockResolvedValue(null);
    const error = await rejection({});
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'PROMOTION_INVALID',
      details: { reason: 'NOT_FOUND' },
    });
  });

  it('reports a switched-off code', async () => {
    mocks.findUnique.mockResolvedValue(promotion({ isActive: false }));
    expect((await rejection({})).details).toEqual({ reason: 'INACTIVE' });
  });

  it('reports the start date of a code that is not valid yet', async () => {
    mocks.findUnique.mockResolvedValue(
      promotion({ startAt: new Date('2099-11-25T00:00:00.000Z') }),
    );
    expect((await rejection({})).details).toEqual({
      reason: 'NOT_STARTED',
      startAt: '2099-11-25T00:00:00.000Z',
    });
  });

  it('reports an expired code', async () => {
    mocks.findUnique.mockResolvedValue(promotion({ endAt: new Date('2026-02-01T00:00:00.000Z') }));
    expect((await rejection({})).details).toEqual({ reason: 'EXPIRED' });
  });

  it('reports the minimum order amount as a string, not a BigInt', async () => {
    mocks.findUnique.mockResolvedValue(promotion());
    const error = await rejection({ subtotal: 350_000n });
    expect(error.details).toEqual({ reason: 'BELOW_MINIMUM', minOrderAmountVnd: '600000' });
    expect(() => JSON.stringify(error.details)).not.toThrow();
  });

  it('still applies a valid code and caps the discount', async () => {
    mocks.findUnique.mockResolvedValue(promotion());
    const result = await resolvePromotion(
      tx,
      { promotionCode: 'testt1v' } as never,
      customerUserId,
      700_000n,
    );
    expect(result.discount).toBe(80_000n);
  });
});
