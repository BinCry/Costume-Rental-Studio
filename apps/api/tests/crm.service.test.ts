import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  caseFindMany: vi.fn(),
  caseCount: vi.fn(),
  lockActiveBranch: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
    crmCase: { findMany: mocks.caseFindMany, count: mocks.caseCount },
  },
}));
vi.mock('../src/modules/branches/branch.service.js', () => ({
  lockActiveBranch: mocks.lockActiveBranch,
}));

const service = await import('../src/modules/crm/crm.service.js');
const branchId = '10000000-0000-4000-8000-000000000001';
const customerId = '10000000-0000-4000-8000-000000000002';
const caseId = '10000000-0000-4000-8000-000000000003';
const orderId = '10000000-0000-4000-8000-000000000004';
const actor = {
  id: '10000000-0000-4000-8000-000000000005',
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [
    {
      branchId: null,
      branch: null,
      role: {
        isActive: true,
        rolePermissions: [
          { permission: { module: 'crm', action: 'read', scope: 'ALL' } },
          { permission: { module: 'crm', action: 'manage', scope: 'ALL' } },
        ],
      },
    },
  ],
} as never;

describe('CRM service invariants', () => {
  it('intersects status with overdue instead of overwriting the status filter', async () => {
    mocks.caseFindMany.mockResolvedValue([]);
    mocks.caseCount.mockResolvedValue(0);
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    await service.listCases(actor, {
      page: 1,
      pageSize: 20,
      status: 'RESOLVED',
      overdue: true,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(mocks.caseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { status: 'RESOLVED' },
            // Vitest's matcher type is `any`; the matcher verifies this field is a runtime Date.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            { dueAt: { lt: expect.any(Date) }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
          ],
        },
      }),
    );
  });

  it('rejects an interaction that omits the order linked to its case', async () => {
    const tx = {
      customer: { findUnique: vi.fn().mockResolvedValue({ user: { status: 'ACTIVE' } }) },
      rentalOrder: { findUnique: vi.fn() },
      crmCase: {
        findUnique: vi.fn().mockResolvedValue({ customerUserId: customerId, branchId, orderId }),
      },
      customerInteraction: { create: vi.fn() },
    };
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    mocks.lockActiveBranch.mockResolvedValue({ id: branchId, status: 'ACTIVE' });
    await expect(
      service.createInteraction(actor, customerId, {
        branchId,
        caseId,
        interactionType: 'NOTE',
        channel: 'PHONE',
        summary: 'Called customer',
      }),
    ).rejects.toMatchObject({ code: 'CRM_RELATION_MISMATCH' });
    expect(tx.customerInteraction.create).not.toHaveBeenCalled();
  });

  it('does not mutate a case after its branch becomes inactive', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: caseId }]),
      crmCase: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: caseId, branchId, status: 'CLOSED' }),
        update: vi.fn(),
      },
      crmCaseHistory: { create: vi.fn() },
    };
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    mocks.lockActiveBranch.mockRejectedValue({ code: 'INVALID_BRANCH' });
    await expect(
      service.changeCaseStatus(actor, caseId, { status: 'IN_PROGRESS' }),
    ).rejects.toMatchObject({ code: 'INVALID_BRANCH' });
    expect(tx.crmCase.update).not.toHaveBeenCalled();
  });
});
