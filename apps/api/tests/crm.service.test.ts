import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  caseFindMany: vi.fn(),
  caseCount: vi.fn(),
  userFindMany: vi.fn(),
  orderFindUnique: vi.fn(),
  interactionFindUnique: vi.fn(),
  lockActiveBranch: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
    crmCase: { findMany: mocks.caseFindMany, count: mocks.caseCount },
    user: { findMany: mocks.userFindMany },
    rentalOrder: { findUnique: mocks.orderFindUnique },
    customerInteraction: { findUnique: mocks.interactionFindUnique },
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
const actorId = '10000000-0000-4000-8000-000000000005';
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
        rolePermissions: [
          { permission: { module: 'crm', action: 'read', scope: 'ALL' } },
          { permission: { module: 'crm', action: 'manage', scope: 'ALL' } },
        ],
      },
    },
  ],
} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CRM service invariants', () => {
  it('lists only active employees assigned to the requested branch', async () => {
    mocks.userFindMany.mockResolvedValue([
      {
        id: '10000000-0000-4000-8000-000000000006',
        displayName: 'Nhân viên CRM',
        email: 'crm@example.test',
        employee: { employeeCode: 'NV-006' },
      },
    ]);

    const result = await service.listAssignees(actor, branchId);

    expect(mocks.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          employee: { employmentStatus: 'ACTIVE' },
          roleAssignments: { some: { branchId, role: { isActive: true } } },
        },
        take: 100,
      }),
    );
    expect(result).toMatchObject([{ employeeCode: 'NV-006', displayName: 'Nhân viên CRM' }]);
  });

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

  it('records an overdue follow-up with order-derived CRM identities', async () => {
    const promisedReturnAt = new Date('2099-10-20T08:00:00.000Z');
    const occurredAt = new Date('2026-10-19T12:00:00.000Z');
    const created = { id: '10000000-0000-4000-8000-000000000006' };
    const create = vi.fn().mockResolvedValue(created);
    mocks.orderFindUnique.mockResolvedValue({
      id: orderId,
      customerUserId: customerId,
      pickupBranchId: branchId,
    });
    mocks.interactionFindUnique.mockResolvedValue(null);
    mocks.transaction.mockImplementation((callback: (client: unknown) => unknown) =>
      callback({
        rentalOrder: {
          findUnique: vi.fn().mockResolvedValue({
            status: 'ACTIVE',
            customerUserId: customerId,
            pickupBranchId: branchId,
          }),
        },
        customerInteraction: { create },
      }),
    );
    mocks.lockActiveBranch.mockResolvedValue({ id: branchId, status: 'ACTIVE' });

    const result = await service.recordOverdueFollowUp(actor, {
      orderId,
      channel: 'PHONE',
      outcome: 'PROMISED_RETURN',
      occurredAt,
      promisedReturnAt,
      sourceReference: `agent-case:${caseId}`,
      idempotencyKey: 'follow-up:one',
    });

    expect(result).toBe(created);
    expect(create).toHaveBeenCalledWith({
      data: {
        customerUserId: customerId,
        branchId,
        orderId,
        staffUserId: actorId,
        interactionType: 'FOLLOW_UP',
        channel: 'PHONE',
        outcome: 'PROMISED_RETURN',
        summary: 'Customer promised to return the overdue rental.',
        occurredAt,
        promisedReturnAt,
        nextFollowUpAt: undefined,
        sourceReference: `agent-case:${caseId}`,
        idempotencyKey: 'follow-up:one',
      },
    });
  });

  it('returns an exact overdue follow-up retry without another write', async () => {
    const nextFollowUpAt = new Date('2026-10-20T09:00:00.000Z');
    const existing = {
      id: '10000000-0000-4000-8000-000000000006',
      orderId,
      branchId,
      customerUserId: customerId,
      staffUserId: actorId,
      interactionType: 'FOLLOW_UP',
      channel: 'PHONE',
      outcome: 'NO_ANSWER',
      promisedReturnAt: null,
      nextFollowUpAt,
      sourceReference: `agent-case:${caseId}`,
      occurredAt: new Date('2026-10-19T12:00:00.000Z'),
    };
    mocks.orderFindUnique.mockResolvedValue({
      id: orderId,
      customerUserId: customerId,
      pickupBranchId: branchId,
    });
    mocks.interactionFindUnique.mockResolvedValue(existing);

    await expect(
      service.recordOverdueFollowUp(actor, {
        orderId,
        channel: 'PHONE',
        outcome: 'NO_ANSWER',
        occurredAt: new Date('2026-10-19T12:00:00.000Z'),
        nextFollowUpAt,
        sourceReference: `agent-case:${caseId}`,
        idempotencyKey: 'follow-up:retry',
      }),
    ).resolves.toBe(existing);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects reuse of a follow-up idempotency key for different input', async () => {
    const nextFollowUpAt = new Date('2026-10-20T09:00:00.000Z');
    mocks.orderFindUnique.mockResolvedValue({
      id: orderId,
      customerUserId: customerId,
      pickupBranchId: branchId,
    });
    mocks.interactionFindUnique.mockResolvedValue({
      orderId,
      branchId,
      customerUserId: customerId,
      staffUserId: actorId,
      interactionType: 'FOLLOW_UP',
      channel: 'PHONE',
      outcome: 'NO_ANSWER',
      promisedReturnAt: null,
      nextFollowUpAt,
      sourceReference: `agent-case:${caseId}`,
      occurredAt: new Date('2026-10-19T12:00:00.000Z'),
    });

    await expect(
      service.recordOverdueFollowUp(actor, {
        orderId,
        channel: 'CHAT',
        outcome: 'NO_ANSWER',
        occurredAt: new Date('2026-10-19T12:00:00.000Z'),
        nextFollowUpAt,
        sourceReference: `agent-case:${caseId}`,
        idempotencyKey: 'follow-up:conflict',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('revalidates that the rental is active inside the write transaction', async () => {
    const create = vi.fn();
    mocks.orderFindUnique.mockResolvedValue({
      id: orderId,
      customerUserId: customerId,
      pickupBranchId: branchId,
    });
    mocks.interactionFindUnique.mockResolvedValue(null);
    mocks.transaction.mockImplementation((callback: (client: unknown) => unknown) =>
      callback({
        rentalOrder: {
          findUnique: vi.fn().mockResolvedValue({
            status: 'COMPLETED',
            customerUserId: customerId,
            pickupBranchId: branchId,
          }),
        },
        customerInteraction: { create },
      }),
    );
    mocks.lockActiveBranch.mockResolvedValue({ id: branchId, status: 'ACTIVE' });

    await expect(
      service.recordOverdueFollowUp(actor, {
        orderId,
        channel: 'PHONE',
        outcome: 'NO_ANSWER',
        occurredAt: new Date('2026-10-19T12:00:00.000Z'),
        nextFollowUpAt: new Date('2026-10-20T09:00:00.000Z'),
        sourceReference: `agent-case:${caseId}`,
        idempotencyKey: 'follow-up:inactive',
      }),
    ).rejects.toMatchObject({ code: 'OVERDUE_FOLLOW_UP_NOT_ALLOWED' });
    expect(create).not.toHaveBeenCalled();
  });

  it('recovers an exact idempotent retry after a concurrent unique-key race', async () => {
    const occurredAt = new Date('2026-10-19T12:00:00.000Z');
    const nextFollowUpAt = new Date('2026-10-20T09:00:00.000Z');
    const duplicate = {
      id: '10000000-0000-4000-8000-000000000006',
      orderId,
      branchId,
      customerUserId: customerId,
      staffUserId: actorId,
      interactionType: 'FOLLOW_UP',
      channel: 'PHONE',
      outcome: 'NO_ANSWER',
      promisedReturnAt: null,
      nextFollowUpAt,
      sourceReference: `agent-case:${caseId}`,
      occurredAt,
    };
    mocks.orderFindUnique.mockResolvedValue({
      id: orderId,
      customerUserId: customerId,
      pickupBranchId: branchId,
    });
    mocks.interactionFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(duplicate);
    mocks.transaction.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.recordOverdueFollowUp(actor, {
        orderId,
        channel: 'PHONE',
        outcome: 'NO_ANSWER',
        occurredAt,
        nextFollowUpAt,
        sourceReference: `agent-case:${caseId}`,
        idempotencyKey: 'follow-up:race',
      }),
    ).resolves.toBe(duplicate);
  });
});
