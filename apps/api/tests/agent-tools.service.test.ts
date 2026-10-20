import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findBranch: vi.fn(),
  findOrderBranch: vi.fn(),
  listOrders: vi.fn(),
  getUnitBlock: vi.fn(),
  listUnitBlocks: vi.fn(),
  getTransfer: vi.fn(),
  createUnitBlock: vi.fn(),
  updateUnitBlock: vi.fn(),
  cancelUnitBlock: vi.fn(),
  createTransfer: vi.fn(),
  approveTransfer: vi.fn(),
  endTransfer: vi.fn(),
  extendOrder: vi.fn(),
  reallocateOrder: vi.fn(),
  cancelOrder: vi.fn(),
  createCheckout: vi.fn(),
  createRefund: vi.fn(),
  getPayment: vi.fn(),
  getPaymentByIdempotencyKey: vi.fn(),
  getRefundByIdempotencyKey: vi.fn(),
  recordOverdueFollowUp: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    branch: { findUnique: mocks.findBranch },
    rentalOrder: { findUnique: mocks.findOrderBranch },
  },
}));
vi.mock('../src/modules/rentals/rental.service.js', () => ({
  listOrders: mocks.listOrders,
  extendOrder: mocks.extendOrder,
  reallocateOrder: mocks.reallocateOrder,
  cancelOrder: mocks.cancelOrder,
}));
vi.mock('../src/modules/crm/crm.service.js', () => ({
  getCustomerInteractionByIdempotencyKey: vi.fn(),
  recordOverdueFollowUp: mocks.recordOverdueFollowUp,
}));
vi.mock('../src/modules/payments/payment.service.js', () => ({
  createCheckout: mocks.createCheckout,
  createRefund: mocks.createRefund,
  getPayment: mocks.getPayment,
  getPaymentByIdempotencyKey: mocks.getPaymentByIdempotencyKey,
  getRefundByIdempotencyKey: mocks.getRefundByIdempotencyKey,
}));
vi.mock('../src/modules/scheduling/scheduling.service.js', () => ({
  getUnitBlock: mocks.getUnitBlock,
  listUnitBlocks: mocks.listUnitBlocks,
  createUnitBlock: mocks.createUnitBlock,
  updateUnitBlock: mocks.updateUnitBlock,
  cancelUnitBlock: mocks.cancelUnitBlock,
}));
vi.mock('../src/modules/transfers/transfer.service.js', () => ({
  getTransfer: mocks.getTransfer,
  createTransfer: mocks.createTransfer,
  approveTransfer: mocks.approveTransfer,
  endTransfer: mocks.endTransfer,
}));

const { authorizeAgentApproval, executeAgentTool } =
  await import('../src/modules/agent-tools/agent-tools.service.js');
const { agentToolRegistry } = await import('../src/modules/agent-tools/agent-tools.registry.js');
const { env } = await import('../src/config/env.js');

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
        rolePermissions: ['rentals', 'payments', 'inventory', 'transfers'].map((module) => ({
          permission: { module, action: 'read', scope: 'ALL' },
        })),
      },
    },
  ],
} as never;

const rentalWriteActor = {
  id: '10000000-0000-4000-8000-000000000001',
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [
    {
      branchId: null,
      branch: null,
      role: {
        isActive: true,
        rolePermissions: [{ permission: { module: 'rentals', action: 'manage', scope: 'ALL' } }],
      },
    },
  ],
} as never;

const crmWriteActor = {
  id: '10000000-0000-4000-8000-000000000001',
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [
    {
      branchId: null,
      branch: null,
      role: {
        isActive: true,
        rolePermissions: [{ permission: { module: 'crm', action: 'manage', scope: 'ALL' } }],
      },
    },
  ],
} as never;

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function frozenAction(
  toolName: string,
  arguments_: Record<string, unknown>,
  expectedVersion: number | null,
  readbackTool: string,
  extra: Record<string, unknown> = {},
) {
  const unsigned = {
    toolName,
    arguments: arguments_,
    expectedVersion,
    readbackTool,
    ...extra,
  };
  return {
    ...unsigned,
    payloadHash: createHash('sha256').update(canonical(unsigned)).digest('hex'),
  };
}

function writeIdempotencyKey(caseId: string, toolName: string, payloadHash: string): string {
  return `agent:${caseId}:${toolName}:${payloadHash}`;
}

function serializeToolData(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findBranch.mockResolvedValue({ status: 'ACTIVE' });
  env.AGENT_RENTAL_WRITE_ENABLED = true;
  env.AGENT_CRM_WRITE_ENABLED = true;
});

describe('agent tool data minimization', () => {
  it('removes customer identifiers and private order fields from order search results', async () => {
    mocks.listOrders.mockResolvedValueOnce({
      items: [
        {
          id: '10000000-0000-4000-8000-000000000002',
          orderCode: 'RT-1002',
          customerUserId: '10000000-0000-4000-8000-000000000003',
          pickupBranchId: '10000000-0000-4000-8000-000000000004',
          status: 'ACTIVE',
          plannedStartAt: new Date('2026-10-17T02:00:00.000Z'),
          plannedDueAt: new Date('2026-10-18T02:00:00.000Z'),
          version: 3,
          customer: {
            user: { displayName: 'Khách A', email: 'private@example.com', phone: '0900000000' },
          },
          customerNote: 'Thông tin riêng của khách',
          payments: [{ transactionReference: 'private-reference' }],
          items: [],
        },
      ],
      pagination: { page: 1, pageSize: 5, totalItems: 1, totalPages: 1 },
    });

    const result = await executeAgentTool(
      actor,
      {
        caseId: '10000000-0000-4000-8000-000000000005',
        toolCallId: '10000000-0000-4000-8000-000000000006',
        idempotencyKey: 'case:call:1',
        toolName: 'find_rental_orders',
        arguments: { search: 'RT-1002', pageSize: 5 },
      },
      '10000000-0000-4000-8000-000000000007',
      '10000000-0000-4000-8000-000000000004',
    );

    expect(result.data).toEqual({
      items: [
        {
          id: '10000000-0000-4000-8000-000000000002',
          orderCode: 'RT-1002',
          pickupBranchId: '10000000-0000-4000-8000-000000000004',
          status: 'ACTIVE',
          plannedStartAt: new Date('2026-10-17T02:00:00.000Z'),
          plannedDueAt: new Date('2026-10-18T02:00:00.000Z'),
          version: 3,
          items: [],
        },
      ],
      pagination: { page: 1, pageSize: 5, totalItems: 1, totalPages: 1 },
    });
    expect(JSON.stringify(result.data)).not.toContain('private@example.com');
    expect(JSON.stringify(result.data)).not.toContain('0900000000');
    expect(JSON.stringify(result.data)).not.toContain('private-reference');
    expect(JSON.stringify(result.data)).not.toContain('customerUserId');
  });
});

describe('agent approval permission boundaries', () => {
  const assignedBranchId = '10000000-0000-4000-8000-000000000020';
  const otherBranchId = '10000000-0000-4000-8000-000000000021';

  it('allows branch-scoped staff to authorize only the assigned branch', async () => {
    const branchActor = {
      id: '10000000-0000-4000-8000-000000000022',
      status: 'ACTIVE',
      employee: { employmentStatus: 'ACTIVE' },
      roleAssignments: [
        {
          branchId: assignedBranchId,
          branch: { status: 'ACTIVE' },
          role: {
            isActive: true,
            rolePermissions: [
              { permission: { module: 'payments', action: 'manage', scope: 'BRANCH' } },
            ],
          },
        },
      ],
    } as never;

    await expect(
      authorizeAgentApproval(
        branchActor,
        {
          requiredPermission: 'payments:manage',
          branchIds: [assignedBranchId],
        },
        assignedBranchId,
      ),
    ).resolves.toMatchObject({ decision: 'allowed' });
    await expect(
      authorizeAgentApproval(
        branchActor,
        {
          requiredPermission: 'payments:manage',
          branchIds: [otherBranchId],
        },
        otherBranchId,
      ),
    ).rejects.toThrowError('Permission denied for manage payments');
  });

  it('allows global manage permission for all requested branches', async () => {
    const globalActor = {
      id: '10000000-0000-4000-8000-000000000023',
      status: 'ACTIVE',
      employee: { employmentStatus: 'ACTIVE' },
      roleAssignments: [
        {
          branchId: null,
          branch: null,
          role: {
            isActive: true,
            rolePermissions: [
              { permission: { module: 'payments', action: 'manage', scope: 'ALL' } },
            ],
          },
        },
      ],
    } as never;

    await expect(
      authorizeAgentApproval(
        globalActor,
        {
          requiredPermission: 'payments:manage',
          branchIds: [assignedBranchId, otherBranchId],
        },
        assignedBranchId,
      ),
    ).resolves.toMatchObject({ decision: 'allowed' });
  });
});

describe('Ops Agent read projections', () => {
  const block = {
    id: '10000000-0000-4000-8000-000000000030',
    unitId: '10000000-0000-4000-8000-000000000031',
    blockType: 'CLEANING',
    status: 'PLANNED',
    blockedFrom: new Date('2026-10-18T08:00:00.000Z'),
    blockedUntil: new Date('2026-10-18T10:00:00.000Z'),
    assignedTo: 'internal-user-id',
    costVnd: 25000n,
    reason: 'Gọi khách tại 0912345678, private-reason@example.com',
    notes: 'private staff note private@example.com',
    startedAt: null,
    finishedAt: null,
    createdBy: 'creator-user-id',
    createdAt: new Date('2026-10-17T08:00:00.000Z'),
    updatedAt: new Date('2026-10-17T08:00:00.000Z'),
    unit: {
      id: '10000000-0000-4000-8000-000000000031',
      unitCode: 'UNIT-031',
      conditionGrade: 'GOOD',
      conditionNotes: 'private unit note',
      operationalStatus: 'AVAILABLE',
      currentBranchId: '10000000-0000-4000-8000-000000000033',
      acquisitionCostVnd: 9_000_000n,
      variant: {
        id: '10000000-0000-4000-8000-000000000032',
        variantCode: 'VAR-032',
        sizeCode: 'M',
        colorCode: 'RED',
        editionLabel: null,
        dailyRentalPriceVnd: 300_000n,
      },
      currentBranch: {
        id: '10000000-0000-4000-8000-000000000033',
        branchCode: 'BR-033',
        name: 'Quận 1',
        address: 'Private branch address',
        phone: '0900000000',
      },
    },
    assignee: {
      userId: 'internal-user-id',
      employeeCode: 'EMP-031',
      employmentStatus: 'ACTIVE',
      joinedAt: new Date('2024-01-01T00:00:00.000Z'),
    },
    creator: {
      userId: 'creator-user-id',
      employeeCode: 'EMP-030',
      employmentStatus: 'ACTIVE',
      joinedAt: new Date('2024-01-01T00:00:00.000Z'),
    },
  };

  it('returns only operational fields for a unit schedule block', async () => {
    mocks.getUnitBlock.mockResolvedValueOnce(block);
    const result = await executeAgentTool(
      actor,
      {
        caseId: '10000000-0000-4000-8000-000000000040',
        toolCallId: '10000000-0000-4000-8000-000000000041',
        idempotencyKey: 'case:call:block',
        toolName: 'get_unit_block',
        arguments: { blockId: block.id },
      } as never,
      '10000000-0000-4000-8000-000000000042',
      '10000000-0000-4000-8000-000000000033',
    );

    expect(result.data).toMatchObject({
      id: block.id,
      unit: {
        unitCode: 'UNIT-031',
        variant: { variantCode: 'VAR-032', sizeCode: 'M' },
        currentBranch: { branchCode: 'BR-033', name: 'Quận 1' },
      },
      assignee: { employeeCode: 'EMP-031' },
    });
    const serialized = serializeToolData(result.data);
    for (const privateValue of [
      'private@example.com',
      'private-reason@example.com',
      '0912345678',
      'private staff note',
      'private unit note',
      'Private branch address',
      '0900000000',
      'internal-user-id',
      'creator-user-id',
      'employmentStatus',
      'dailyRentalPriceVnd',
      'acquisitionCostVnd',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it('projects every item in a schedule list through the same safe view', async () => {
    mocks.listUnitBlocks.mockResolvedValueOnce({
      items: [block],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    const result = await executeAgentTool(
      actor,
      {
        caseId: '10000000-0000-4000-8000-000000000040',
        toolCallId: '10000000-0000-4000-8000-000000000043',
        idempotencyKey: 'case:call:schedule',
        toolName: 'get_unit_schedule',
        arguments: { unitId: block.unitId },
      } as never,
      '10000000-0000-4000-8000-000000000044',
      '10000000-0000-4000-8000-000000000033',
    );

    expect(result.data).toMatchObject({
      items: [{ id: block.id, unit: { unitCode: 'UNIT-031' } }],
    });
    expect(serializeToolData(result.data)).not.toContain('private@example.com');
  });

  it('limits transfer reads to an endpoint branch and returns a minimal projection', async () => {
    const transfer = {
      id: '10000000-0000-4000-8000-000000000050',
      transferCode: 'TR-050',
      fromBranchId: '10000000-0000-4000-8000-000000000051',
      toBranchId: '10000000-0000-4000-8000-000000000052',
      status: 'REQUESTED',
      requestNote: 'free-form note with private@example.com',
      requestedBy: 'requester-user-id',
      approvedBy: null,
      approvedAt: null,
      shippedBy: null,
      shippedAt: null,
      receivedBy: null,
      receivedAt: null,
      endedBy: null,
      endedAt: null,
      endReason: null,
      version: 2,
      createdAt: new Date('2026-10-17T08:00:00.000Z'),
      updatedAt: new Date('2026-10-17T08:00:00.000Z'),
      fromBranch: {
        id: '10000000-0000-4000-8000-000000000051',
        branchCode: 'BR-051',
        name: 'Quận 1',
        address: 'Private branch address',
        phone: '0900000000',
      },
      toBranch: {
        id: '10000000-0000-4000-8000-000000000052',
        branchCode: 'BR-052',
        name: 'Quận 3',
        address: 'Other private branch address',
        phone: '0900000001',
      },
      requester: {
        userId: 'requester-user-id',
        employeeCode: 'EMP-051',
        user: { id: 'requester-user-id', displayName: 'Nhân viên', avatarUrl: 'private-avatar' },
      },
      approver: null,
      shipper: null,
      receiver: null,
      ender: null,
      items: [
        {
          id: '10000000-0000-4000-8000-000000000053',
          transferId: '10000000-0000-4000-8000-000000000050',
          unitId: '10000000-0000-4000-8000-000000000054',
          conditionOut: 'GOOD',
          conditionOutNotes: 'private condition note',
          conditionIn: null,
          conditionInNotes: null,
          receivedOperationalStatus: null,
          unit: {
            id: '10000000-0000-4000-8000-000000000054',
            unitCode: 'UNIT-054',
            variantId: '10000000-0000-4000-8000-000000000055',
            currentBranchId: '10000000-0000-4000-8000-000000000051',
            conditionGrade: 'GOOD',
            conditionNotes: 'private unit note',
            operationalStatus: 'AVAILABLE',
            acquiredAt: null,
            acquisitionCostVnd: 8_000_000n,
            retiredAt: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            currentBranch: {
              id: '10000000-0000-4000-8000-000000000051',
              branchCode: 'BR-051',
              name: 'Quận 1',
              address: 'Private branch address',
              phone: '0900000000',
            },
            variant: {
              id: '10000000-0000-4000-8000-000000000055',
              variantCode: 'VAR-055',
              sizeCode: 'L',
              colorCode: 'BLUE',
              editionLabel: null,
              dailyRentalPriceVnd: 400_000n,
              depositAmountVnd: 1_000_000n,
              replacementValueVnd: 5_000_000n,
              cleaningBufferMinutes: null,
              status: 'ACTIVE',
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              model: {
                id: '10000000-0000-4000-8000-000000000056',
                modelCode: 'MODEL-056',
                name: 'Áo dài xanh',
                category: {
                  id: '10000000-0000-4000-8000-000000000057',
                  name: 'Áo dài',
                  status: 'ACTIVE',
                },
              },
            },
          },
        },
      ],
    };
    mocks.getTransfer.mockResolvedValue(transfer);
    for (const [caseBranchId, caseBranchRole] of [
      ['10000000-0000-4000-8000-000000000051', 'FROM'],
      ['10000000-0000-4000-8000-000000000052', 'TO'],
    ] as const) {
      const result = await executeAgentTool(
        actor,
        {
          caseId: '10000000-0000-4000-8000-000000000040',
          toolCallId: '10000000-0000-4000-8000-000000000058',
          idempotencyKey: 'case:call:transfer',
          toolName: 'get_stock_transfer',
          arguments: { transferId: transfer.id },
        } as never,
        '10000000-0000-4000-8000-000000000059',
        caseBranchId,
      );
      expect(result.data).toEqual({
        id: transfer.id,
        transferCode: 'TR-050',
        status: 'REQUESTED',
        version: 2,
        caseBranchRole,
      });
      const serialized = serializeToolData(result.data);
      for (const privateValue of [
        'private@example.com',
        'Private branch address',
        'requester-user-id',
        'private-avatar',
        'private condition note',
        'private unit note',
      ]) {
        expect(serialized).not.toContain(privateValue);
      }
    }

    await expect(
      executeAgentTool(
        actor,
        {
          caseId: '10000000-0000-4000-8000-000000000040',
          toolCallId: '10000000-0000-4000-8000-000000000058',
          idempotencyKey: 'case:call:transfer',
          toolName: 'get_stock_transfer',
          arguments: { transferId: transfer.id },
        } as never,
        '10000000-0000-4000-8000-000000000059',
        '10000000-0000-4000-8000-000000000060',
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('does not return payment idempotency or provider fields to the Agent', async () => {
    mocks.getPayment.mockResolvedValueOnce({
      id: '10000000-0000-4000-8000-000000000070',
      orderId: '10000000-0000-4000-8000-000000000071',
      purpose: 'DEPOSIT',
      amountVnd: 500_000n,
      status: 'SUCCEEDED',
      idempotencyKey: 'internal-idempotency-key',
      providerPaymentId: 'provider-reference',
      transactionReference: 'bank-reference',
      checkoutUrl: 'https://payments.invalid/secret-checkout',
      qrCode: 'private-qr-data',
      failureReason: 'internal failure details',
      order: { id: '10000000-0000-4000-8000-000000000071', pickupBranchId: 'branch-1' },
    });

    const result = await executeAgentTool(
      actor,
      {
        caseId: '10000000-0000-4000-8000-000000000040',
        toolCallId: '10000000-0000-4000-8000-000000000072',
        idempotencyKey: 'case:call:payment',
        toolName: 'get_payment',
        arguments: { paymentId: '10000000-0000-4000-8000-000000000070' },
      } as never,
      '10000000-0000-4000-8000-000000000073',
      'branch-1',
    );

    expect(result.data).toMatchObject({
      id: '10000000-0000-4000-8000-000000000070',
      orderId: '10000000-0000-4000-8000-000000000071',
      pickupBranchId: 'branch-1',
      purpose: 'DEPOSIT',
      amountVnd: 500_000n,
      status: 'SUCCEEDED',
    });
    const serialized = serializeToolData(result.data);
    for (const privateValue of [
      'internal-idempotency-key',
      'provider-reference',
      'bank-reference',
      'secret-checkout',
      'private-qr-data',
      'internal failure details',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it('omits free-form refund reason from Agent projection', async () => {
    process.env.AGENT_READ_TOOLS_ENABLED = 'true';
    mocks.getRefundByIdempotencyKey.mockResolvedValueOnce({
      id: '10000000-0000-4000-8000-000000000074',
      paymentId: '10000000-0000-4000-8000-000000000075',
      amountVnd: 500_000n,
      reason: 'customer private note: private@example.com',
      status: 'SUCCEEDED',
      payment: { order: { pickupBranchId: '10000000-0000-4000-8000-000000000078' } },
    });
    const result = await executeAgentTool(
      actor,
      {
        caseId: '10000000-0000-4000-8000-000000000040',
        toolCallId: '10000000-0000-4000-8000-000000000076',
        idempotencyKey: 'refund-key',
        toolName: 'get_refund_by_idempotency_key',
        arguments: { idempotencyKey: 'refund-key' },
      } as never,
      '10000000-0000-4000-8000-000000000077',
      '10000000-0000-4000-8000-000000000078',
    );

    expect(result.data).toEqual({
      id: '10000000-0000-4000-8000-000000000074',
      paymentId: '10000000-0000-4000-8000-000000000075',
      amountVnd: 500_000n,
      status: 'SUCCEEDED',
    });
    expect(serializeToolData(result.data)).not.toContain('customer private note');
    expect(serializeToolData(result.data)).not.toContain('private@example.com');
  });
});

describe('Ops Agent write safety gate', () => {
  const releasedWriteTools = new Set(['reallocate_rental_item', 'record_overdue_follow_up']);
  const writeTools = Object.values(agentToolRegistry).filter(
    (definition) => definition.mode === 'write' && !releasedWriteTools.has(definition.name),
  );

  it.each(writeTools)(
    '$name fails closed until the approval and retry contracts exist',
    async ({ name }) => {
      await expect(
        executeAgentTool(
          actor,
          {
            caseId: '10000000-0000-4000-8000-000000000060',
            toolCallId: '10000000-0000-4000-8000-000000000061',
            idempotencyKey: 'agent-call-key',
            toolName: name,
            arguments: {},
          } as never,
          '10000000-0000-4000-8000-000000000062',
          '10000000-0000-4000-8000-000000000063',
        ),
      ).rejects.toMatchObject({ statusCode: 503, code: 'AGENT_WRITE_TOOLS_NOT_READY' });

      for (const mock of [
        mocks.createUnitBlock,
        mocks.updateUnitBlock,
        mocks.cancelUnitBlock,
        mocks.extendOrder,
        mocks.reallocateOrder,
        mocks.cancelOrder,
        mocks.createTransfer,
        mocks.approveTransfer,
        mocks.endTransfer,
        mocks.createCheckout,
        mocks.createRefund,
      ]) {
        expect(mock).not.toHaveBeenCalled();
      }
    },
  );

  it('executes a confirmed rental reallocation and preserves the frozen payload contract', async () => {
    const branchId = '10000000-0000-4000-8000-000000000063';
    const orderId = '10000000-0000-4000-8000-000000000064';
    const orderItemId = '10000000-0000-4000-8000-000000000065';
    const unitId = '10000000-0000-4000-8000-000000000066';
    const arguments_ = { orderId, orderItemId, unitId, reason: 'Readiness recovery' };
    const resultOrder = {
      id: orderId,
      orderCode: 'RT-064',
      pickupBranchId: branchId,
      status: 'CONFIRMED',
      plannedStartAt: new Date('2026-10-20T08:00:00.000Z'),
      plannedDueAt: new Date('2026-10-21T08:00:00.000Z'),
      version: 8,
      items: [
        {
          id: orderItemId,
          variantId: '10000000-0000-4000-8000-000000000067',
          unitId,
          occupiedFrom: new Date('2026-10-20T08:00:00.000Z'),
          occupiedUntil: new Date('2026-10-21T08:00:00.000Z'),
        },
      ],
    };
    mocks.findOrderBranch.mockResolvedValueOnce({ pickupBranchId: branchId });
    mocks.reallocateOrder.mockResolvedValueOnce(resultOrder);
    const snapshot = frozenAction('reallocate_rental_item', arguments_, 7, 'get_rental_order', {
      recommendation: { analysisId: 'analysis-1', optionId: 'option-1' },
    });
    expect(snapshot.payloadHash).toBe(
      'a4a763ca94132d9fabd29b06ec535ead1395f62a539b2f831a57c11ceed33f16',
    );

    const result = await executeAgentTool(
      rentalWriteActor,
      {
        caseId: '10000000-0000-4000-8000-000000000060',
        toolCallId: '10000000-0000-4000-8000-000000000061',
        confirmationId: '10000000-0000-4000-8000-000000000068',
        idempotencyKey: writeIdempotencyKey(
          '10000000-0000-4000-8000-000000000060',
          'reallocate_rental_item',
          snapshot.payloadHash,
        ),
        toolName: 'reallocate_rental_item',
        arguments: arguments_,
        expectedVersion: 7,
        readbackTool: 'get_rental_order',
        payloadHash: snapshot.payloadHash,
        actionSnapshot: snapshot,
      } as never,
      '10000000-0000-4000-8000-000000000062',
      branchId,
    );

    expect(mocks.reallocateOrder).toHaveBeenCalledWith(rentalWriteActor, orderId, {
      orderItemId,
      unitId,
      reason: 'Readiness recovery',
      expectedVersion: 7,
    });
    expect(result).toMatchObject({ status: 'ok', recordVersion: 8 });
  });

  it('records a confirmed overdue follow-up idempotently in the case branch', async () => {
    const branchId = '10000000-0000-4000-8000-000000000063';
    const orderId = '10000000-0000-4000-8000-000000000064';
    const occurredAt = new Date('2026-10-20T07:00:00.000Z');
    const arguments_ = {
      orderId,
      channel: 'PHONE' as const,
      outcome: 'CONTACTED' as const,
      occurredAt,
    };
    const interaction = {
      id: '10000000-0000-4000-8000-000000000069',
      branchId,
      orderId,
      interactionType: 'FOLLOW_UP',
      channel: 'PHONE',
      outcome: 'CONTACTED',
      promisedReturnAt: null,
      nextFollowUpAt: null,
      sourceReference: 'agent-case:10000000-0000-4000-8000-000000000060',
      idempotencyKey: 'agent:overdue:064',
      occurredAt,
    };
    mocks.findOrderBranch.mockResolvedValueOnce({ pickupBranchId: branchId });
    mocks.recordOverdueFollowUp.mockResolvedValueOnce(interaction);
    const frozenArguments = {
      ...arguments_,
      occurredAt: '2026-10-20T07:00:00+00:00',
    };
    const snapshot = frozenAction(
      'record_overdue_follow_up',
      frozenArguments,
      null,
      'get_customer_interaction_by_idempotency_key',
      { recommendation: { analysisId: 'analysis-2', findingId: 'finding-2' } },
    );
    expect(snapshot.payloadHash).toBe(
      '4421746e186c3249272bd0dd78f1d6d6cd59d2c38efcecfa2319429e2b468b6e',
    );
    interaction.idempotencyKey = writeIdempotencyKey(
      '10000000-0000-4000-8000-000000000060',
      'record_overdue_follow_up',
      snapshot.payloadHash,
    );

    const result = await executeAgentTool(
      crmWriteActor,
      {
        caseId: '10000000-0000-4000-8000-000000000060',
        toolCallId: '10000000-0000-4000-8000-000000000061',
        confirmationId: '10000000-0000-4000-8000-000000000068',
        idempotencyKey: writeIdempotencyKey(
          '10000000-0000-4000-8000-000000000060',
          'record_overdue_follow_up',
          snapshot.payloadHash,
        ),
        toolName: 'record_overdue_follow_up',
        arguments: arguments_,
        readbackTool: 'get_customer_interaction_by_idempotency_key',
        payloadHash: snapshot.payloadHash,
        actionSnapshot: snapshot,
      } as never,
      '10000000-0000-4000-8000-000000000062',
      branchId,
    );

    expect(mocks.recordOverdueFollowUp).toHaveBeenCalledWith(crmWriteActor, {
      ...arguments_,
      sourceReference: 'agent-case:10000000-0000-4000-8000-000000000060',
      idempotencyKey: writeIdempotencyKey(
        '10000000-0000-4000-8000-000000000060',
        'record_overdue_follow_up',
        snapshot.payloadHash,
      ),
    });
    expect(result).toMatchObject({ status: 'ok', data: interaction });
  });

  it('rejects a released write without frozen confirmation evidence', async () => {
    await expect(
      executeAgentTool(
        rentalWriteActor,
        {
          caseId: '10000000-0000-4000-8000-000000000060',
          toolCallId: '10000000-0000-4000-8000-000000000061',
          idempotencyKey: 'agent:readiness:missing-confirmation',
          toolName: 'reallocate_rental_item',
          expectedVersion: 7,
          arguments: {
            orderId: '10000000-0000-4000-8000-000000000064',
            orderItemId: '10000000-0000-4000-8000-000000000065',
            unitId: '10000000-0000-4000-8000-000000000066',
            reason: 'Readiness recovery',
          },
        } as never,
        '10000000-0000-4000-8000-000000000062',
        '10000000-0000-4000-8000-000000000063',
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'AGENT_WRITE_AUTHORIZATION_REQUIRED' });
    expect(mocks.reallocateOrder).not.toHaveBeenCalled();
  });

  it('rejects a released write when the payload differs from the confirmed hash', async () => {
    const actionSnapshot = {
      ...frozenAction(
        'reallocate_rental_item',
        {
          orderId: '10000000-0000-4000-8000-000000000064',
          orderItemId: '10000000-0000-4000-8000-000000000065',
          unitId: '10000000-0000-4000-8000-000000000066',
          reason: 'Original reason',
        },
        7,
        'get_rental_order',
      ),
      payloadHash: '0'.repeat(64),
    };
    await expect(
      executeAgentTool(
        rentalWriteActor,
        {
          caseId: '10000000-0000-4000-8000-000000000060',
          toolCallId: '10000000-0000-4000-8000-000000000061',
          confirmationId: '10000000-0000-4000-8000-000000000068',
          idempotencyKey: 'agent:readiness:mismatch',
          toolName: 'reallocate_rental_item',
          expectedVersion: 7,
          arguments: {
            orderId: '10000000-0000-4000-8000-000000000064',
            orderItemId: '10000000-0000-4000-8000-000000000065',
            unitId: '10000000-0000-4000-8000-000000000066',
            reason: 'Tampered reason',
          },
          readbackTool: 'get_rental_order',
          payloadHash: '0'.repeat(64),
          actionSnapshot,
        } as never,
        '10000000-0000-4000-8000-000000000062',
        '10000000-0000-4000-8000-000000000063',
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'AGENT_WRITE_AUTHORIZATION_MISMATCH' });
    expect(mocks.reallocateOrder).not.toHaveBeenCalled();
  });

  it('rejects replaying a confirmed snapshot with a different idempotency key', async () => {
    const arguments_ = {
      orderId: '10000000-0000-4000-8000-000000000064',
      channel: 'PHONE' as const,
      outcome: 'CONTACTED' as const,
      occurredAt: new Date('2026-10-20T07:00:00.000Z'),
    };
    const snapshot = frozenAction(
      'record_overdue_follow_up',
      { ...arguments_, occurredAt: '2026-10-20T07:00:00+00:00' },
      null,
      'get_customer_interaction_by_idempotency_key',
    );

    await expect(
      executeAgentTool(
        crmWriteActor,
        {
          caseId: '10000000-0000-4000-8000-000000000060',
          toolCallId: '10000000-0000-4000-8000-000000000061',
          confirmationId: '10000000-0000-4000-8000-000000000068',
          idempotencyKey: 'agent:changed-key',
          toolName: 'record_overdue_follow_up',
          arguments: arguments_,
          readbackTool: 'get_customer_interaction_by_idempotency_key',
          payloadHash: snapshot.payloadHash,
          actionSnapshot: snapshot,
        } as never,
        '10000000-0000-4000-8000-000000000062',
        '10000000-0000-4000-8000-000000000063',
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'AGENT_WRITE_AUTHORIZATION_MISMATCH' });
    expect(mocks.recordOverdueFollowUp).not.toHaveBeenCalled();
  });

  it('rejects a confirmed write whose resource is outside the case branch', async () => {
    const arguments_ = {
      orderId: '10000000-0000-4000-8000-000000000064',
      orderItemId: '10000000-0000-4000-8000-000000000065',
      unitId: '10000000-0000-4000-8000-000000000066',
      reason: 'Readiness recovery',
    };
    mocks.findOrderBranch.mockResolvedValueOnce({
      pickupBranchId: '10000000-0000-4000-8000-000000000099',
    });
    const snapshot = frozenAction('reallocate_rental_item', arguments_, 7, 'get_rental_order');

    await expect(
      executeAgentTool(
        rentalWriteActor,
        {
          caseId: '10000000-0000-4000-8000-000000000060',
          toolCallId: '10000000-0000-4000-8000-000000000061',
          confirmationId: '10000000-0000-4000-8000-000000000068',
          idempotencyKey: writeIdempotencyKey(
            '10000000-0000-4000-8000-000000000060',
            'reallocate_rental_item',
            snapshot.payloadHash,
          ),
          toolName: 'reallocate_rental_item',
          expectedVersion: 7,
          arguments: arguments_,
          readbackTool: 'get_rental_order',
          payloadHash: snapshot.payloadHash,
          actionSnapshot: snapshot,
        } as never,
        '10000000-0000-4000-8000-000000000062',
        '10000000-0000-4000-8000-000000000063',
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'AGENT_CASE_RESOURCE_NOT_FOUND' });
    expect(mocks.reallocateOrder).not.toHaveBeenCalled();
  });

  it('keeps a released write disabled when its feature flag is off', async () => {
    env.AGENT_RENTAL_WRITE_ENABLED = false;
    await expect(
      executeAgentTool(
        rentalWriteActor,
        {
          caseId: '10000000-0000-4000-8000-000000000060',
          toolCallId: '10000000-0000-4000-8000-000000000061',
          idempotencyKey: 'agent:readiness:disabled',
          toolName: 'reallocate_rental_item',
          expectedVersion: 7,
          arguments: {},
        } as never,
        '10000000-0000-4000-8000-000000000062',
        '10000000-0000-4000-8000-000000000063',
      ),
    ).rejects.toMatchObject({ statusCode: 503, code: 'AGENT_TOOL_DISABLED' });
    expect(mocks.reallocateOrder).not.toHaveBeenCalled();
  });

  it('keeps overdue follow-up disabled when the CRM feature flag is off', async () => {
    env.AGENT_CRM_WRITE_ENABLED = false;
    await expect(
      executeAgentTool(
        crmWriteActor,
        {
          caseId: '10000000-0000-4000-8000-000000000060',
          toolCallId: '10000000-0000-4000-8000-000000000061',
          idempotencyKey: 'agent:overdue:disabled',
          toolName: 'record_overdue_follow_up',
          arguments: {},
        } as never,
        '10000000-0000-4000-8000-000000000062',
        '10000000-0000-4000-8000-000000000063',
      ),
    ).rejects.toMatchObject({ statusCode: 503, code: 'AGENT_TOOL_DISABLED' });
    expect(mocks.recordOverdueFollowUp).not.toHaveBeenCalled();
  });
});
