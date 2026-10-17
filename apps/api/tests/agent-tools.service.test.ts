import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listOrders: vi.fn() }));

vi.mock('../src/database/prisma.js', () => ({ prisma: {} }));
vi.mock('../src/modules/rentals/rental.service.js', () => ({ listOrders: mocks.listOrders }));
vi.mock('../src/modules/payments/payment.service.js', () => ({}));
vi.mock('../src/modules/scheduling/scheduling.service.js', () => ({}));
vi.mock('../src/modules/transfers/transfer.service.js', () => ({}));

const { executeAgentTool } = await import('../src/modules/agent-tools/agent-tools.service.js');

const actor = {
  id: '10000000-0000-4000-8000-000000000001',
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [],
} as never;

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
