import { describe, expect, it } from 'vitest';

import { publicAvailabilitySchema } from '../src/modules/public/public.schema.js';
import {
  availabilitySchema,
  confirmSchema,
  createOrderSchema,
  amendOrderItemSchema,
  extendOrderSchema,
  pickupSchema,
  quoteSchema,
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
    plannedStartAt: new Date(Date.now() + 86_400_000).toISOString(),
    plannedDueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    items: [{ variantId }],
  };

  it('creates directly into the pending-confirmation contract and rejects invalid rental time', () => {
    expect(createOrderSchema.safeParse(order).success).toBe(true);
    expect(
      createOrderSchema.safeParse({ ...order, plannedDueAt: order.plannedStartAt }).success,
    ).toBe(false);
  });

  it('accepts a per-order contact snapshot and normalizes the phone', () => {
    const result = createOrderSchema.safeParse({
      ...order,
      contactName: ' Người nhận ',
      contactPhone: '0901 234 567',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contactName).toBe('Người nhận');
      expect(result.data.contactPhone).toBe('+84901234567');
    }
    expect(createOrderSchema.safeParse({ ...order, contactPhone: '123' }).success).toBe(false);
  });

  it('accepts the quote values a customer confirmed on order creation', () => {
    const expectedQuote = {
      policyVersionId: '10000000-0000-4000-8000-000000000006',
      subtotalVnd: 200000,
      depositVnd: 300000,
      discountVnd: 0,
      totalDueVnd: 500000,
      items: [{ variantId, dailyRentalPriceVnd: 100000, depositAmountVnd: 300000 }],
    };
    const parsed = createOrderSchema.safeParse({ ...order, expectedQuote });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.expectedQuote?.totalDueVnd).toBe(500000n);
    expect(quoteSchema.safeParse({ ...order, expectedQuote }).success).toBe(false);
  });

  it('accepts a client request id for safe retries but rejects a malformed key', () => {
    const clientRequestId = '10000000-0000-4000-8000-000000000008';
    expect(createOrderSchema.safeParse({ ...order, clientRequestId }).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...order, clientRequestId: 'same-order' }).success).toBe(
      false,
    );
    expect(
      createOrderSchema.safeParse({
        ...order,
        plannedStartAt: new Date(Date.now() - 86_400_000).toISOString(),
        clientRequestId,
      }).success,
    ).toBe(true);
  });

  it('rejects a past pickup for orders, quotes and both availability endpoints', () => {
    const plannedStartAt = new Date(Date.now() - 86_400_000).toISOString();
    const availability = {
      variantId,
      pickupBranchId: branchId,
      plannedStartAt,
      plannedDueAt: order.plannedDueAt,
    };
    const results = [
      createOrderSchema.safeParse({ ...order, plannedStartAt }),
      quoteSchema.safeParse({ ...order, plannedStartAt }),
      availabilitySchema.safeParse(availability),
      publicAvailabilitySchema.safeParse(availability),
    ];
    for (const result of results) {
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({ path: ['plannedStartAt'] }),
      );
    }
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
            returnConditionGrade: 'GOOD',
            nextOperationalStatus: 'CLEANING',
            evidence: [{ uploadKey: 'rental-staging/a.jpg', contentType: 'image/jpeg', size: 10 }],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('allows a missing costume report without a physical-return condition', () => {
    expect(
      returnSchema.safeParse({
        expectedVersion: 2,
        items: [
          {
            orderItemId: itemId,
            isMissing: true,
            damageNotes: 'Khách báo thất lạc; đã xác minh qua cuộc gọi.',
            evidence: [
              { uploadKey: 'rental-staging/report.jpg', contentType: 'image/jpeg', size: 10 },
            ],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      returnSchema.safeParse({
        expectedVersion: 2,
        items: [
          {
            orderItemId: itemId,
            isMissing: false,
            evidence: [
              { uploadKey: 'rental-staging/return.jpg', contentType: 'image/jpeg', size: 10 },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('validates optimistic extension and amendment payloads', () => {
    expect(
      extendOrderSchema.safeParse({
        expectedVersion: 4,
        newDueAt: '2026-10-20T08:00:00.000Z',
        reason: 'Customer requested more time',
      }).success,
    ).toBe(true);
    expect(
      extendOrderSchema.safeParse({ expectedVersion: 0, reason: 'Missing date' }).success,
    ).toBe(false);
    expect(
      amendOrderItemSchema.safeParse({
        expectedVersion: 4,
        newVariantId: variantId,
        newUnitId: unitId,
        reason: 'Size exchange',
      }).success,
    ).toBe(true);
  });
});
