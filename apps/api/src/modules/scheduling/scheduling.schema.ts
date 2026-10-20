import { z } from 'zod';

const blockTypes = [
  'CLEANING',
  'REPAIR',
  'ALTERATION',
  'INSPECTION',
  'INTERNAL_USE',
  'MANUAL',
  'OTHER',
] as const;
const statuses = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export const blockIdSchema = z.object({ blockId: z.uuid() });
const unitBlockFields = {
  unitId: z.uuid(),
  capacityWindowId: z.uuid().nullable().optional(),
  blockType: z.enum(blockTypes),
  blockedFrom: z.coerce.date(),
  blockedUntil: z.coerce.date(),
  assignedTo: z.uuid().nullable().optional(),
  estimatedEffortMinutes: z.coerce.number().int().min(1).max(10_080).nullable().optional(),
  costVnd: z.coerce.bigint().min(0n).nullable().optional(),
  reason: z.string().trim().min(1).max(10_000),
  notes: z.string().trim().max(10_000).nullable().optional(),
};
export const createUnitBlockSchema = z
  .object(unitBlockFields)
  .strict()
  .refine((value) => value.blockedUntil > value.blockedFrom, {
    path: ['blockedUntil'],
    message: 'blockedUntil must be after blockedFrom',
  });
export const updateUnitBlockSchema = z
  .object({
    blockType: unitBlockFields.blockType.optional(),
    capacityWindowId: unitBlockFields.capacityWindowId,
    blockedFrom: unitBlockFields.blockedFrom.optional(),
    blockedUntil: unitBlockFields.blockedUntil.optional(),
    assignedTo: unitBlockFields.assignedTo,
    estimatedEffortMinutes: unitBlockFields.estimatedEffortMinutes,
    remainingEffortMinutes: z.coerce.number().int().min(0).max(10_080).nullable().optional(),
    costVnd: unitBlockFields.costVnd,
    reason: unitBlockFields.reason.optional(),
    notes: unitBlockFields.notes,
    expectedUpdatedAt: z.coerce.date(),
  })
  .strict();
export const completionSchema = z
  .object({
    notes: z.string().trim().max(10_000).nullable().optional(),
    costVnd: z.coerce.bigint().min(0n).nullable().optional(),
    nextOperationalStatus: z.enum(['READY', 'REPAIR', 'RETIRED']).optional(),
  })
  .strict();
export const cancelSchema = z.object({ reason: z.string().trim().min(1).max(10_000) }).strict();
export const listUnitBlocksSchema = z
  .object({
    unitId: z.uuid().optional(),
    branchId: z.uuid().optional(),
    status: z.enum(statuses).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => !value.from || !value.to || value.to > value.from, {
    path: ['to'],
    message: 'to must be after from',
  });
export type CreateUnitBlockInput = z.infer<typeof createUnitBlockSchema>;
export type UpdateUnitBlockInput = z.infer<typeof updateUnitBlockSchema>;
export type CompletionInput = z.infer<typeof completionSchema>;
export type ListUnitBlocksInput = z.infer<typeof listUnitBlocksSchema>;

export const capacityWindowIdSchema = z.object({ capacityWindowId: z.uuid() });
const capacityWindowFields = {
  branchId: z.uuid(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  availableMinutes: z.coerce.number().int().min(1).max(100_800),
  notes: z.string().trim().max(10_000).nullable().optional(),
};
export const createCapacityWindowSchema = z
  .object(capacityWindowFields)
  .strict()
  .refine((value) => value.endsAt > value.startsAt, {
    path: ['endsAt'],
    message: 'endsAt must be after startsAt',
  });
export const updateCapacityWindowSchema = z
  .object({
    startsAt: capacityWindowFields.startsAt.optional(),
    endsAt: capacityWindowFields.endsAt.optional(),
    availableMinutes: capacityWindowFields.availableMinutes.optional(),
    notes: capacityWindowFields.notes,
    expectedUpdatedAt: z.coerce.date(),
  })
  .strict();
export const listCapacityWindowsSchema = z
  .object({
    branchId: z.uuid(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => !value.from || !value.to || value.to > value.from, {
    path: ['to'],
    message: 'to must be after from',
  });
export type CreateCapacityWindowInput = z.infer<typeof createCapacityWindowSchema>;
export type UpdateCapacityWindowInput = z.infer<typeof updateCapacityWindowSchema>;
export type ListCapacityWindowsInput = z.infer<typeof listCapacityWindowsSchema>;
