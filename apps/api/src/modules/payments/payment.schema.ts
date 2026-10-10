import { z } from 'zod';

const purpose = ['RENTAL', 'DEPOSIT', 'EXTRA'] as const;

export const orderIdSchema = z.object({ orderId: z.uuid() });
export const paymentIdSchema = z.object({ paymentId: z.uuid() });
export const refundIdSchema = z.object({ refundId: z.uuid() });

const createPaymentBaseSchema = z
  .object({
    purpose: z.enum(purpose),
    amountVnd: z.coerce.bigint().positive(),
    idempotencyKey: z.string().trim().min(1).max(255),
  })
  .strict();

export const createCashPaymentSchema = createPaymentBaseSchema;
export const createCheckoutSchema = createPaymentBaseSchema;

export const prepareSettlementSchema = z
  .object({
    expectedVersion: z.coerce.number().int().positive(),
    otherFeeVnd: z.coerce.bigint().min(0n).default(0n),
    depositDeductionVnd: z.coerce.bigint().min(0n).default(0n),
    settlementNote: z.string().trim().max(10_000).nullable().optional(),
  })
  .strict();

export const cancelPaymentSchema = z
  .object({ reason: z.string().trim().min(1).max(10_000) })
  .strict();

export const createRefundSchema = z
  .object({
    amountVnd: z.coerce.bigint().positive(),
    reason: z.string().trim().min(1).max(10_000),
    idempotencyKey: z.string().trim().min(1).max(255),
  })
  .strict();

export const completeRefundSchema = z
  .object({ transactionReference: z.string().trim().min(1).max(255) })
  .strict();

export const failRefundSchema = z.object({ reason: z.string().trim().min(1).max(10_000) }).strict();

export type CreatePaymentInput = z.infer<typeof createPaymentBaseSchema>;
export type PrepareSettlementInput = z.infer<typeof prepareSettlementSchema>;
export type CancelPaymentInput = z.infer<typeof cancelPaymentSchema>;
export type CreateRefundInput = z.infer<typeof createRefundSchema>;
export type CompleteRefundInput = z.infer<typeof completeRefundSchema>;
export type FailRefundInput = z.infer<typeof failRefundSchema>;
