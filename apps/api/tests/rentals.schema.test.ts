import { describe, expect, it } from 'vitest';

import {
  confirmSchema,
  createOrderSchema,
  pickupSchema,
  returnSchema,
} from '../src/modules/rentals/rental.schema.js';

const customerUserId = '10000000-0000-4000-8000-000000000001';
const branchId = '10000000-0000-4000-8000-000000000002';
const variantId = '10000000-0000-4000-8000-000000000003';
const itemId = '10000000-0000-4000-8000-000000000004';
const unitId = '10000000-0000-4000-8000-000000000005';

describe('rental order schemas', () => {
  const order = {
    customerUserId,
    pickupBranchId: branchId,
    plannedStartAt: '2026-10-15T08:00:00.000Z',
    plannedDueAt: '2026-10-17T08:00:00.000Z',
    items: [{ variantId }],
  };

  it('creates directly into the pending-confirmation contract and rejects invalid rental time', () => {
    expect(createOrderSchema.safeParse(order).success).toBe(true);
    expect(
      createOrderSchema.safeParse({ ...order, plannedDueAt: order.plannedStartAt }).success,
    ).toBe(false);
  });

  it('requires one explicit allocation per confirmation item', () => {
    expect(confirmSchema.safeParse({ expectedVersion: 1, allocations: [] }).success).toBe(false);
    expect(
      confirmSchema.safeParse({
        expectedVersion: 1,
        allocations: [{ orderItemId: itemId, unitId }],
      }).success,
    ).toBe(true);
    expect(
      confirmSchema.safeParse({
        expectedVersion: 1,
        allocations: [
          { orderItemId: itemId, unitId },
          { orderItemId: '10000000-0000-4000-8000-000000000006', unitId },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires pickup evidence and accepts the return inspection payload shape', () => {
    expect(
      pickupSchema.safeParse({
        expectedVersion: 1,
        items: [{ orderItemId: itemId, conditionGrade: 'GOOD', evidence: [] }],
      }).success,
    ).toBe(false);
    expect(
      returnSchema.safeParse({
        expectedVersion: 1,
        items: [
          {
            orderItemId: itemId,
            returnConditionGrade: 'DAMAGED',
            nextOperationalStatus: 'CLEANING',
            evidence: [{ uploadKey: 'rental-staging/a.jpg', contentType: 'image/jpeg', size: 10 }],
          },
        ],
      }).success,
    ).toBe(true);
  });
});
