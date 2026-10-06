import { z } from 'zod';

const date = z.coerce.date();
export const promotionIdSchema = z.object({ id: z.uuid() });
export const promotionListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isActive: z.coerce.boolean().optional(),
});
export const promotionSchema = z
  .object({
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
    minOrderAmountVnd: z.coerce.bigint().nonnegative().default(0n),
    startAt: date,
    endAt: date,
    totalUsageLimit: z.coerce.number().int().positive().nullable().optional(),
    perCustomerLimit: z.coerce.number().int().positive().default(1),
  })
  .superRefine((v, ctx) => {
    if (v.endAt <= v.startAt)
      ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'endAt must be after startAt' });
    if (v.discountType === 'PERCENT' && v.discountValue > 100n)
      ctx.addIssue({
        code: 'custom',
        path: ['discountValue'],
        message: 'Percent discount must be <= 100',
      });
  });
export type PromotionInput = z.infer<typeof promotionSchema>;
