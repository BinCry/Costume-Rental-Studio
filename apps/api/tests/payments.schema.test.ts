import { describe, expect, it } from 'vitest';

import {
  completeRefundSchema,
  createCashPaymentSchema,
  createCheckoutSchema,
  createRefundSchema,
  prepareSettlementSchema,
} from '../src/modules/payments/payment.schema.js';

describe('payment schemas', () => {
  it('accepts positive cash and gateway requests without a client-controlled method', () => {
    expect(
      createCashPaymentSchema.safeParse({
        purpose: 'DEPOSIT',
        amountVnd: '1000000',
        idempotencyKey: 'order-1-deposit-1',
      }).success,
    ).toBe(true);
    expect(
      createCheckoutSchema.safeParse({
        purpose: 'DEPOSIT',
        amountVnd: 1,
        idempotencyKey: 'payment-gateway-1',
      }).success,
    ).toBe(true);
    expect(
      createCashPaymentSchema.safeParse({
        purpose: 'RENTAL',
        amountVnd: 0,
        idempotencyKey: 'zero-payment',
      }).success,
    ).toBe(false);
    expect(
      createCheckoutSchema.safeParse({
        purpose: 'RENTAL',
        method: 'BANK_TRANSFER',
        amountVnd: 1000,
        idempotencyKey: 'method-not-accepted',
      }).success,
    ).toBe(false);
  });

  it('requires references for refund completion', () => {
    expect(completeRefundSchema.safeParse({ transactionReference: 'REF-001' }).success).toBe(true);
  });

  it('requires a positive, idempotent refund request', () => {
    expect(
      createRefundSchema.safeParse({
        amountVnd: '500000',
        reason: 'Remaining deposit',
        idempotencyKey: 'refund-1',
      }).success,
    ).toBe(true);
    expect(
      createRefundSchema.safeParse({
        amountVnd: -1,
        reason: 'Invalid',
        idempotencyKey: 'refund-2',
      }).success,
    ).toBe(false);
  });

  it('requires an optimistic version for a settlement draft', () => {
    expect(
      prepareSettlementSchema.safeParse({
        expectedVersion: 3,
        otherFeeVnd: '200000',
        depositDeductionVnd: '200000',
      }).success,
    ).toBe(true);
    expect(prepareSettlementSchema.safeParse({ expectedVersion: 0, otherFeeVnd: 0 }).success).toBe(
      false,
    );
  });
});
