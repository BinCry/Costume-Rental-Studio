import { z } from 'zod';

const date = z.coerce.date();
export const promotionIdSchema = z.object({ id: z.uuid() });
export const promotionListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isActive: z.coerce.boolean().optional(),
});
const promotionFields = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(1).max(255),
  discountType: z.enum(['PERCENT', 'FIXED_AMOUNT']),
  discountValue: z.coerce.bigint().positive(),
  maxDiscountVnd: z.coerce.bigint().nonnegative().nullable().optional(),
  minOrderAmountVnd: z.coerce.bigint().nonnegative(),
  startAt: date,
  endAt: date,
  totalUsageLimit: z.coerce.number().int().positive().nullable().optional(),
  perCustomerLimit: z.coerce.number().int().positive(),
});

function checkPromotionRules(
  v: {
    startAt?: Date;
    endAt?: Date;
    discountType?: 'PERCENT' | 'FIXED_AMOUNT';
    discountValue?: bigint;
  },
  ctx: z.RefinementCtx,
) {
  if (v.startAt && v.endAt && v.endAt <= v.startAt)
    ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'endAt must be after startAt' });
  if (v.discountType === 'PERCENT' && v.discountValue !== undefined && v.discountValue > 100n)
    ctx.addIssue({
      code: 'custom',
      path: ['discountValue'],
      message: 'Percent discount must be <= 100',
    });
}

export const promotionSchema = promotionFields
  .extend({
    minOrderAmountVnd: promotionFields.shape.minOrderAmountVnd.default(0n),
    perCustomerLimit: promotionFields.shape.perCustomerLimit.default(1),
  })
  .superRefine(checkPromotionRules);
// No defaults here: a PATCH must only touch the fields the client sent.
export const promotionUpdateSchema = promotionFields.partial().superRefine(checkPromotionRules);
export type PromotionInput = z.infer<typeof promotionSchema>;
export type PromotionUpdateInput = z.infer<typeof promotionUpdateSchema>;
