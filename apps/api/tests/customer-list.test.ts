import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findMany: mocks.findMany, count: mocks.count },
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  },
}));

const { listCustomers } = await import('../src/modules/customers/customer.service.js');

const branchId = '10000000-0000-4000-8000-000000000001';
const actor = {
  id: '10000000-0000-4000-8000-000000000002',
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [
    {
      branchId,
      branch: { status: 'ACTIVE' },
      role: {
        isActive: true,
        roleCode: 'SALES_STAFF',
        rolePermissions: [{ permission: { module: 'customers', action: 'read', scope: 'BRANCH' } }],
      },
    },
  ],
} as never;

async function whereFor(query: { search?: string; branchId?: string }) {
  await listCustomers(actor, { page: 1, pageSize: 20, branchId, ...query });
  const [args] = mocks.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
  return args.where;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});

describe('customer list for a branch', () => {
  it('includes customers who prefer the branch or have rented there', async () => {
    const where = await whereFor({});

    expect(where.customer).toEqual({
      is: {
        OR: [
          { preferredBranchId: branchId },
          { rentalOrders: { some: { pickupBranchId: branchId } } },
        ],
      },
    });
  });

  it('keeps searching name and email for text queries', async () => {
    const where = await whereFor({ search: 'chou@example' });

    expect(where.OR).toEqual([
      { displayName: { contains: 'chou@example', mode: 'insensitive' } },
      { phone: { contains: 'chou@example' } },
      { email: { contains: 'chou@example', mode: 'insensitive' } },
    ]);
  });
});
