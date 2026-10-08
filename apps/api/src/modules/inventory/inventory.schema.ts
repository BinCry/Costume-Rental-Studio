import { z } from 'zod';

const unitStatuses = ['INBOUND', 'READY', 'CLEANING', 'REPAIR', 'IN_TRANSFER', 'RETIRED'] as const;
const conditionGrades = ['UNINSPECTED', 'NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;

export const unitIdSchema = z.object({ unitId: z.uuid() });
export const listUnitsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  branchId: z.uuid().optional(),
  variantId: z.uuid().optional(),
  operationalStatus: z.enum(unitStatuses).optional(),
  conditionGrade: z.enum(conditionGrades).optional(),
  sortBy: z
    .enum(['unitCode', 'operationalStatus', 'conditionGrade', 'createdAt', 'updatedAt'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export const createUnitSchema = z
  .object({
    unitCode: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(/^[A-Za-z0-9-]+$/),
    variantId: z.uuid(),
    branchId: z.uuid(),
    acquiredAt: z.coerce.date().optional(),
    acquisitionCostVnd: z.coerce.bigint().nonnegative().optional(),
    conditionNotes: z.string().trim().max(10_000).optional(),
  })
  .strict();
export const updateUnitSchema = z
  .object({
    acquiredAt: z.coerce.date().nullable().optional(),
    acquisitionCostVnd: z.coerce.bigint().nonnegative().nullable().optional(),
    conditionNotes: z.string().trim().max(10_000).nullable().optional(),
  })
  .strict();
export const inspectUnitSchema = z
  .object({
    conditionGrade: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']),
    nextStatus: z.enum(['READY', 'REPAIR']),
    notes: z.string().trim().max(10_000).optional(),
  })
  .strict();
export const changeUnitStatusSchema = z
  .object({
    targetStatus: z.enum(['READY', 'CLEANING', 'REPAIR']),
    notes: z.string().trim().max(10_000).optional(),
  })
  .strict();
export const retireUnitSchema = z.object({ notes: z.string().trim().min(1).max(10_000) }).strict();
export const eventListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.literal('occurredAt').default('occurredAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListUnitsInput = z.infer<typeof listUnitsSchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type InspectUnitInput = z.infer<typeof inspectUnitSchema>;
export type ChangeUnitStatusInput = z.infer<typeof changeUnitStatusSchema>;
export type RetireUnitInput = z.infer<typeof retireUnitSchema>;
export type EventListInput = z.infer<typeof eventListSchema>;
