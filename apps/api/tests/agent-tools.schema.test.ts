import { describe, expect, it } from 'vitest';

import { agentToolExecutionSchema } from '../src/modules/agent-tools/agent-tools.schema.js';

const id = (suffix: number) => `10000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const base = {
  caseId: id(1),
  toolCallId: id(2),
  idempotencyKey: 'agent:test',
};

const executions = [
  ['get_rental_order', { orderId: id(3) }],
  [
    'check_availability',
    {
      variantId: id(4),
      pickupBranchId: id(5),
      plannedStartAt: '2026-10-16T08:00:00Z',
      plannedDueAt: '2026-10-17T08:00:00Z',
    },
  ],
  ['get_payment_summary', { orderId: id(3) }],
  [
    'get_rental_readiness_context',
    { ruleCode: 'ORDER_PREPARATION_DELAYED', primaryOrderId: id(3) },
  ],
  ['get_overdue_rental_context', { orderId: id(3) }],
  ['get_customer_interaction_by_idempotency_key', { idempotencyKey: 'follow-up:test' }],
  [
    'get_operational_capacity_context',
    {
      branchId: id(5),
      startsAt: '2026-10-19T08:00:00Z',
      endsAt: '2026-10-19T16:00:00Z',
    },
  ],
  ['find_rental_orders', { search: 'ORD-001', pageSize: 10 }],
  ['get_unit_schedule', { unitId: id(6) }],
  ['get_stock_transfer', { transferId: id(7) }],
  ['get_unit_block', { blockId: id(8) }],
  ['get_payment_by_idempotency_key', { idempotencyKey: 'payment:test' }],
  ['get_payment', { paymentId: id(9) }],
  ['get_refund_by_idempotency_key', { idempotencyKey: 'refund:test' }],
  [
    'create_unit_block',
    {
      unitId: id(6),
      capacityWindowId: id(13),
      blockType: 'CLEANING',
      blockedFrom: '2026-10-16T08:00:00Z',
      blockedUntil: '2026-10-16T10:00:00Z',
      estimatedEffortMinutes: 60,
      reason: 'Scheduled cleaning',
    },
  ],
  [
    'update_unit_block',
    {
      blockId: id(8),
      remainingEffortMinutes: 30,
      expectedUpdatedAt: '2026-10-15T08:00:00Z',
    },
  ],
  ['cancel_unit_block', { blockId: id(8), reason: 'No longer required' }],
  [
    'extend_rental_order',
    { orderId: id(3), newDueAt: '2026-10-20T08:00:00Z', reason: 'Requested' },
  ],
  [
    'reallocate_rental_item',
    { orderId: id(3), orderItemId: id(10), unitId: id(6), reason: 'Replacement' },
  ],
  ['cancel_rental_order', { orderId: id(3), reason: 'Customer request' }],
  [
    'record_overdue_follow_up',
    {
      orderId: id(3),
      channel: 'PHONE',
      outcome: 'PROMISED_RETURN',
      occurredAt: '2026-10-19T12:00:00Z',
      promisedReturnAt: '2099-10-20T08:00:00Z',
      nextFollowUpAt: '2099-10-20T09:00:00Z',
    },
  ],
  ['create_stock_transfer', { fromBranchId: id(11), toBranchId: id(12), unitIds: [id(6)] }],
  ['approve_stock_transfer', { transferId: id(7) }],
  ['reject_stock_transfer', { transferId: id(7), reason: 'Capacity unavailable' }],
  ['create_payment_checkout', { orderId: id(3), purpose: 'RENTAL', amountVnd: 100000 }],
  ['request_refund', { paymentId: id(9), amountVnd: 50000, reason: 'Overpayment' }],
] as const;

describe('agent tool contract', () => {
  it.each(executions)('accepts a representative %s payload', (toolName, args) => {
    const versioned = new Set([
      'extend_rental_order',
      'reallocate_rental_item',
      'cancel_rental_order',
      'approve_stock_transfer',
      'reject_stock_transfer',
    ]);
    const result = agentToolExecutionSchema.safeParse({
      ...base,
      toolName,
      arguments: args,
      ...(versioned.has(toolName) ? { expectedVersion: 1 } : {}),
    });
    expect(result.success).toBe(true);
  });

  it('rejects an inverted create-unit-block period', () => {
    const result = agentToolExecutionSchema.safeParse({
      ...base,
      toolName: 'create_unit_block',
      arguments: {
        unitId: id(6),
        blockType: 'REPAIR',
        blockedFrom: '2026-10-17T08:00:00Z',
        blockedUntil: '2026-10-16T08:00:00Z',
        reason: 'Repair',
      },
    });
    expect(result.success).toBe(false);
  });

  it('keeps unit identity mandatory for the two unit-level readiness rules', () => {
    const result = agentToolExecutionSchema.safeParse({
      ...base,
      toolName: 'get_rental_readiness_context',
      arguments: { ruleCode: 'ALLOCATED_UNIT_NOT_READY', primaryOrderId: id(3) },
    });

    expect(result.success).toBe(false);
  });

  it('requires a promised return time only for the matching follow-up outcome', () => {
    const missingPromise = agentToolExecutionSchema.safeParse({
      ...base,
      toolName: 'record_overdue_follow_up',
      arguments: {
        orderId: id(3),
        channel: 'PHONE',
        outcome: 'PROMISED_RETURN',
        occurredAt: '2026-10-19T12:00:00Z',
      },
    });
    const unrelatedPromise = agentToolExecutionSchema.safeParse({
      ...base,
      toolName: 'record_overdue_follow_up',
      arguments: {
        orderId: id(3),
        channel: 'PHONE',
        outcome: 'NO_ANSWER',
        occurredAt: '2026-10-19T12:00:00Z',
        promisedReturnAt: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    expect(missingPromise.success).toBe(false);
    expect(unrelatedPromise.success).toBe(false);
  });
});
