import { z } from 'zod';

const transferStatuses = [
  'REQUESTED',
  'APPROVED',
  'IN_TRANSIT',
  'RECEIVED',
  'REJECTED',
  'CANCELLED',
] as const;
const conditionGrades = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;

export const transferIdSchema = z.object({ transferId: z.uuid() });

export const listTransfersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  branchId: z.uuid().optional(),
  fromBranchId: z.uuid().optional(),
  toBranchId: z.uuid().optional(),
  status: z.enum(transferStatuses).optional(),
  sortBy: z.enum(['transferCode', 'status', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createTransferSchema = z
  .object({
    fromBranchId: z.uuid(),
    toBranchId: z.uuid(),
    unitIds: z.array(z.uuid()).min(1).max(100),
    requestNote: z.string().trim().max(10_000).optional(),
  })
  .strict()
  .refine((input) => input.fromBranchId !== input.toBranchId, {
    message: 'Source and destination branches must differ',
    path: ['toBranchId'],
  })
  .refine((input) => new Set(input.unitIds).size === input.unitIds.length, {
    message: 'Unit ids must be unique',
    path: ['unitIds'],
  });

export const updateTransferSchema = z
  .object({
    expectedVersion: z.coerce.number().int().positive(),
    requestNote: z.string().trim().max(10_000).nullable().optional(),
    unitIds: z.array(z.uuid()).min(1).max(100).optional(),
  })
  .strict()
  .refine((input) => input.requestNote !== undefined || input.unitIds !== undefined, {
    message: 'At least one field must be supplied',
  })
  .refine((input) => !input.unitIds || new Set(input.unitIds).size === input.unitIds.length, {
    message: 'Unit ids must be unique',
    path: ['unitIds'],
  });

export const approveTransferSchema = z
  .object({ expectedVersion: z.coerce.number().int().positive() })
  .strict();
export const endTransferSchema = z
  .object({
    expectedVersion: z.coerce.number().int().positive(),
    reason: z.string().trim().min(1).max(10_000),
  })
  .strict();

const shipItemSchema = z.object({
  unitId: z.uuid(),
  conditionOut: z.enum(conditionGrades),
  conditionOutNotes: z.string().trim().max(10_000).optional(),
});
export const shipTransferSchema = z
  .object({
    expectedVersion: z.coerce.number().int().positive(),
    items: z.array(shipItemSchema).min(1).max(100),
  })
  .strict()
  .refine((input) => new Set(input.items.map((item) => item.unitId)).size === input.items.length, {
    message: 'Transfer item unit ids must be unique',
    path: ['items'],
  });

const receiveItemSchema = z.object({
  unitId: z.uuid(),
  conditionIn: z.enum(conditionGrades),
  conditionInNotes: z.string().trim().max(10_000).optional(),
  receivedOperationalStatus: z.enum(['READY', 'CLEANING', 'REPAIR']),
});
export const receiveTransferSchema = z
  .object({
    expectedVersion: z.coerce.number().int().positive(),
    items: z.array(receiveItemSchema).min(1).max(100),
  })
  .strict()
  .refine((input) => new Set(input.items.map((item) => item.unitId)).size === input.items.length, {
    message: 'Transfer item unit ids must be unique',
    path: ['items'],
  })
  .refine(
    (input) =>
      input.items.every(
        (item) => item.conditionIn !== 'DAMAGED' || item.receivedOperationalStatus === 'REPAIR',
      ),
    { message: 'Damaged units must be received into repair', path: ['items'] },
  );

export type ListTransfersInput = z.infer<typeof listTransfersSchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type UpdateTransferInput = z.infer<typeof updateTransferSchema>;
export type ApproveTransferInput = z.infer<typeof approveTransferSchema>;
export type EndTransferInput = z.infer<typeof endTransferSchema>;
export type ShipTransferInput = z.infer<typeof shipTransferSchema>;
export type ReceiveTransferInput = z.infer<typeof receiveTransferSchema>;
