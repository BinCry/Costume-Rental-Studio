import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findMany: mocks.findMany, count: mocks.count },
    $transaction: mocks.transaction,
  },
}));

vi.mock('../src/modules/auth/token.service.js', () => ({
  lockUserAuthentication: vi.fn(),
}));
vi.mock('../src/modules/branches/branch.service.js', () => ({
  lockActiveBranch: vi.fn(),
}));

const service = await import('../src/modules/staff/staff.service.js');

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
        rolePermissions: [
          { permission: { module: 'staff', action: 'manage', scope: 'ALL' } },
        ],
      },
    },
  ],
} as never;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockResolvedValue([[], 0]);
});

describe('staff service', () => {
  it('lists only users with employee records', async () => {
    await service.listStaff(actor, { page: 1, pageSize: 20 });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employee: { isNot: null } } }),
    );
  });

  it('applies employment status only within employee records', async () => {
    await service.listStaff(actor, { page: 1, pageSize: 20, employmentStatus: 'ACTIVE' });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { employee: { is: { employmentStatus: 'ACTIVE' } } },
      }),
    );
  });
});
