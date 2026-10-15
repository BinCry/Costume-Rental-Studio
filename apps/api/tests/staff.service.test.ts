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

const actorId = '10000000-0000-4000-8000-000000000001';
const actor = {
  id: actorId,
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [
    {
      branchId: null,
      branch: null,
      role: {
        isActive: true,
        roleCode: 'ADMIN',
        rolePermissions: [
          { permission: { module: 'staff', action: 'manage', scope: 'ALL' } },
          { permission: { module: 'rbac', action: 'manage', scope: 'ALL' } },
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

  it('returns only an allowlisted account shape when updating staff', async () => {
    const updatedAt = new Date('2026-10-15T10:00:00.000Z');
    const update = vi.fn().mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000010',
      email: 'staff@example.test',
      phone: '+84901234567',
      displayName: 'Updated staff',
      avatarUrl: null,
      status: 'ACTIVE',
      passwordHash: 'secret-hash',
      emailVerifiedAt: updatedAt,
      phoneVerifiedAt: updatedAt,
      authIdentities: [{ providerSubject: 'private-subject' }],
    });
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          employee: { userId: '10000000-0000-4000-8000-000000000010' },
        }),
        update,
      },
      employee: { update: vi.fn() },
    };
    mocks.transaction.mockImplementation(async (work: unknown) =>
      (work as (transaction: typeof tx) => Promise<unknown>)(tx),
    );

    const result = await service.updateStaff(actor, '10000000-0000-4000-8000-000000000010', {
      displayName: 'Updated staff',
    });

    expect(result).toEqual({
      id: '10000000-0000-4000-8000-000000000010',
      email: 'staff@example.test',
      phone: '+84901234567',
      displayName: 'Updated staff',
      avatarUrl: null,
      status: 'ACTIVE',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /passwordHash|emailVerifiedAt|phoneVerifiedAt|authIdentities|secret-hash/,
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          email: true,
          phone: true,
          displayName: true,
          avatarUrl: true,
          status: true,
        },
      }),
    );
  });
  it('returns only an allowlisted account shape when creating staff', async () => {
    const userId = '10000000-0000-4000-8000-000000000011';
    const roleId = '10000000-0000-4000-8000-000000000012';
    const employee = {
      userId,
      employeeCode: 'EMP-NEW',
      employmentStatus: 'ACTIVE',
      joinedAt: new Date('2026-10-15T00:00:00.000Z'),
      activatedAt: null,
      terminatedAt: null,
      createdBy: actorId,
    };
    const createUser = vi.fn().mockResolvedValue({
      id: userId,
      email: 'new-staff@example.test',
      phone: '+84901234567',
      displayName: 'New staff',
      avatarUrl: null,
      status: 'PENDING',
      passwordHash: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      employee: { ...employee },
    });
    const tx = {
      role: {
        findMany: vi.fn().mockResolvedValue([
          { id: roleId, roleCode: 'SALES_STAFF', actorGroup: 'STAFF', isActive: true },
        ]),
      },
      user: { create: createUser },
      userRoleAssignment: { create: vi.fn().mockResolvedValue({ id: 'assignment-id' }) },
    };
    mocks.transaction.mockImplementation(async (work: unknown) =>
      (work as (transaction: typeof tx) => Promise<unknown>)(tx),
    );

    const result = await service.createStaff(actor, {
      email: 'new-staff@example.test',
      phone: '+84901234567',
      displayName: 'New staff',
      employeeCode: 'emp-new',
      joinedAt: employee.joinedAt,
      assignments: [{ roleId, branchId: null }],
    });

    expect(result).toMatchObject({
      id: userId,
      email: 'new-staff@example.test',
      status: 'PENDING',
      employee: { userId, employeeCode: 'EMP-NEW' },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /passwordHash|emailVerifiedAt|phoneVerifiedAt|createdBy/,
    );
    const createArgs = createUser.mock.calls[0]?.[0] as {
      select: {
        id: boolean;
        email: boolean;
        status: boolean;
        employee: {
          select: {
            userId: boolean;
            employeeCode: boolean;
            employmentStatus: boolean;
            joinedAt: boolean;
            activatedAt: boolean;
            terminatedAt: boolean;
          };
        };
      };
    };
    expect(createArgs.select).toEqual({
      id: true,
      email: true,
      status: true,
      employee: {
        select: {
          userId: true,
          employeeCode: true,
          employmentStatus: true,
          joinedAt: true,
          activatedAt: true,
          terminatedAt: true,
        },
      },
    });
  });

});
