import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    rentalOrderItem: { findMany: mocks.findMany, count: mocks.count },
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  },
}));

const { listActiveRentals } = await import('../src/modules/inventory/inventory.service.js');

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
        roleCode: 'ADMIN',
        rolePermissions: [{ permission: { module: 'inventory', action: 'read', scope: 'ALL' } }],
      },
    },
  ],
} as never;

async function customerFilters(search: string) {
  await listActiveRentals(actor, { page: 1, pageSize: 20, search } as never);
  const [args] = mocks.findMany.mock.calls[0] as [
    {
      where: {
        OR: { order?: { is: { customer?: { is: { user: { is: { OR: unknown[] } } } } } } }[];
      };
    },
  ];
  const customer = args.where.OR.find((filter) => filter.order?.is.customer);
  return customer!.order!.is.customer!.is.user.is.OR;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});

describe('active rental search', () => {
  it('finds a stored +84 phone when staff type the local 0 form', async () => {
    expect(await customerFilters('0912 345')).toContainEqual({
      phone: { contains: '84912345' },
    });
  });

  it('does not add a phone variant for a text search', async () => {
    expect(await customerFilters('Chou')).toHaveLength(3);
  });
});
