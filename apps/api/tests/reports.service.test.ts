import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  paymentFindMany: vi.fn(),
  orderFindMany: vi.fn(),
  unitFindMany: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    payment: { findMany: mocks.paymentFindMany },
    rentalOrder: { findMany: mocks.orderFindMany },
    costumeUnit: { findMany: mocks.unitFindMany },
  },
}));

const service = await import('../src/modules/reports/report.service.js');
const branchId = '10000000-0000-4000-8000-000000000002';
const actor = {
  id: '10000000-0000-4000-8000-000000000001',
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [
    {
      branchId: null,
      branch: null,
      role: {
        isActive: true,
        rolePermissions: [{ permission: { module: 'reports', action: 'read', scope: 'ALL' } }],
      },
    },
  ],
} as never;
const query = {
  from: new Date('2026-10-01T00:00:00.000Z'),
  to: new Date('2026-11-01T00:00:00.000Z'),
  groupBy: 'day' as const,
};

describe('report service', () => {
  it('counts only successful RENTAL and EXTRA payments as revenue', async () => {
    mocks.paymentFindMany.mockResolvedValue([
      {
        amountVnd: 100n,
        purpose: 'RENTAL',
        method: 'CASH',
        status: 'SUCCEEDED',
        paidAt: new Date('2026-10-10T10:00:00.000Z'),
        createdAt: new Date('2026-10-10T10:00:00.000Z'),
        refunds: [],
        order: {
          pickupBranchId: branchId,
          channel: 'STORE',
          pickupBranch: { timezone: 'Asia/Ho_Chi_Minh' },
        },
      },
      {
        amountVnd: 30n,
        purpose: 'EXTRA',
        method: 'CASH',
        status: 'SUCCEEDED',
        paidAt: new Date('2026-10-10T10:00:00.000Z'),
        createdAt: new Date('2026-10-10T10:00:00.000Z'),
        refunds: [],
        order: {
          pickupBranchId: branchId,
          channel: 'STORE',
          pickupBranch: { timezone: 'Asia/Ho_Chi_Minh' },
        },
      },
      {
        amountVnd: 50n,
        purpose: 'DEPOSIT',
        method: 'CASH',
        status: 'SUCCEEDED',
        paidAt: new Date('2026-10-10T10:00:00.000Z'),
        createdAt: new Date('2026-10-10T10:00:00.000Z'),
        refunds: [],
        order: {
          pickupBranchId: branchId,
          channel: 'STORE',
          pickupBranch: { timezone: 'Asia/Ho_Chi_Minh' },
        },
      },
      {
        amountVnd: 70n,
        purpose: 'RENTAL',
        method: 'PAYMENT_GATEWAY',
        status: 'CANCELLED',
        paidAt: null,
        createdAt: new Date('2026-10-10T10:00:00.000Z'),
        refunds: [],
        order: {
          pickupBranchId: branchId,
          channel: 'STORE',
          pickupBranch: { timezone: 'Asia/Ho_Chi_Minh' },
        },
      },
    ]);
    const result = await service.getRevenue(actor, query);
    expect(result.totalRevenueVnd).toBe(130n);
    expect(result.periods).toEqual([
      { period: '2026-10-10', rentalVnd: 100n, extraVnd: 30n, totalVnd: 130n },
    ]);
  });

  it('only counts completed refunds in the overview', async () => {
    mocks.paymentFindMany.mockResolvedValue([
      {
        amountVnd: 100n,
        purpose: 'DEPOSIT',
        method: 'CASH',
        status: 'SUCCEEDED',
        paidAt: new Date('2026-10-10T00:00:00.000Z'),
        createdAt: new Date('2026-10-10T00:00:00.000Z'),
        refunds: [
          {
            amountVnd: 20n,
            status: 'COMPLETED',
            completedAt: new Date('2026-10-11T00:00:00.000Z'),
          },
          { amountVnd: 30n, status: 'REQUESTED', completedAt: null },
        ],
        order: {
          pickupBranchId: branchId,
          channel: 'STORE',
          pickupBranch: { timezone: 'Asia/Ho_Chi_Minh' },
        },
      },
    ]);
    mocks.orderFindMany.mockResolvedValue([]);
    const result = await service.getOverview(actor, query);
    expect(result.depositsHeldVnd).toBe(100n);
    expect(result.completedRefundVnd).toBe(20n);
    expect(result.revenueVnd).toBe(0n);
  });
});
