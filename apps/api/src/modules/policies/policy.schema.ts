import { z } from 'zod';
export const policyIdSchema = z.object({ id: z.uuid() });
export const policySchema = z
  .object({
    versionCode: z.string().trim().min(2).max(50),
    effectiveFrom: z.coerce.date(),
    effectiveTo: z.coerce.date().nullable().optional(),
    billingDayMode: z.enum(['CALENDAR_DAY', 'ROLLING_24_HOURS']),
    minRentalDays: z.coerce.number().int().min(1).default(1),
    maxRentalDays: z.coerce.number().int().min(1).nullable().optional(),
    quoteValidHours: z.coerce.number().int().positive(),
    noShowGraceMinutes: z.coerce.number().int().nonnegative().default(0),
    lateGraceMinutes: z.coerce.number().int().nonnegative().default(0),
    lateFeePercentPerDay: z.coerce.number().min(0).max(100).default(0),
    lateReturnBufferMinutes: z.coerce.number().int().nonnegative().max(10_080).default(0),
    freeCancelBeforeHours: z.coerce.number().int().nonnegative().default(0),
    lateCancelFeePercent: z.coerce.number().min(0).max(100).default(0),
    refundSlaBusinessDays: z.coerce.number().int().positive().nullable().optional(),
    changeReason: z.string().trim().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.effectiveTo && v.effectiveTo <= v.effectiveFrom)
      ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'Invalid effective range' });
    if (v.maxRentalDays && v.maxRentalDays < v.minRentalDays)
      ctx.addIssue({
        code: 'custom',
        path: ['maxRentalDays'],
        message: 'maxRentalDays must be >= minRentalDays',
      });
  });
export type PolicyInput = z.infer<typeof policySchema>;
