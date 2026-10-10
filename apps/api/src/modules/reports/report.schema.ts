import { z } from 'zod';

const dayMs = 24 * 60 * 60 * 1_000;

export const reportQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    branchId: z.uuid().optional(),
    groupBy: z.enum(['day', 'week', 'month']).default('day'),
    channel: z.string().trim().min(1).max(30).optional(),
  })
  .strict()
  .transform((input, context) => {
    const to = input.to ?? new Date();
    const from = input.from ?? new Date(to.getTime() - 30 * dayMs);
    if (from >= to)
      context.addIssue({ code: 'custom', message: 'from must be before to', path: ['from'] });
    if (to.getTime() - from.getTime() > 366 * dayMs)
      context.addIssue({
        code: 'custom',
        message: 'Report range cannot exceed 366 days',
        path: ['to'],
      });
    return { ...input, from, to };
  });

export type ReportQueryInput = z.infer<typeof reportQuerySchema>;
