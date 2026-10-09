import { z } from 'zod';

const statuses = [
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'ACTIVE',
  'RETURN_INSPECTION',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'NO_SHOW',
] as const;
const grade = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;
const activeStatuses = [
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'ACTIVE',
  'RETURN_INSPECTION',
] as const;

export const orderIdSchema = z.object({ orderId: z.uuid() });
const accessorySchema = z
  .object({ modelAccessoryId: z.uuid(), quantity: z.coerce.number().int().min(1).max(20) })
  .strict();
const itemSchema = z
  .object({ variantId: z.uuid(), accessories: z.array(accessorySchema).max(20).default([]) })
  .strict();
const orderBase = z
  .object({
    customerUserId: z.uuid(),
    pickupBranchId: z.uuid(),
    channel: z.string().trim().min(1).max(30).default('STAFF'),
    plannedStartAt: z.coerce.date(),
    plannedDueAt: z.coerce.date(),
    customerNote: z.string().trim().max(10_000).nullable().optional(),
    promotionCode: z.string().trim().min(1).max(100).optional(),
    items: z.array(itemSchema).min(1).max(50),
  })
  .strict()
  .refine((v) => v.plannedDueAt > v.plannedStartAt, {
    path: ['plannedDueAt'],
    message: 'plannedDueAt must be after plannedStartAt',
  });

export const createOrderSchema = orderBase;
export const updateOrderSchema = orderBase.extend({
  expectedVersion: z.coerce.number().int().positive(),
});
export const listOrdersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  customerUserId: z.uuid().optional(),
  pickupBranchId: z.uuid().optional(),
  status: z.enum(statuses).optional(),
  plannedFrom: z.coerce.date().optional(),
  plannedTo: z.coerce.date().optional(),
  sortBy: z
    .enum(['orderCode', 'status', 'plannedStartAt', 'plannedDueAt', 'createdAt', 'updatedAt'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export const availabilitySchema = z
  .object({
    variantId: z.uuid(),
    pickupBranchId: z.uuid(),
    plannedStartAt: z.coerce.date(),
    plannedDueAt: z.coerce.date(),
  })
  .refine((v) => v.plannedDueAt > v.plannedStartAt, {
    path: ['plannedDueAt'],
    message: 'plannedDueAt must be after plannedStartAt',
  });
export const versionSchema = z
  .object({ expectedVersion: z.coerce.number().int().positive() })
  .strict();
export const reasonSchema = versionSchema
  .extend({ reason: z.string().trim().min(1).max(10_000) })
  .strict();
export const confirmSchema = versionSchema
  .extend({
    allocations: z
      .array(z.object({ orderItemId: z.uuid(), unitId: z.uuid() }).strict())
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.allocations.map((allocation) => allocation.unitId)).size ===
      input.allocations.length,
    {
      message: 'Unit ids must be unique',
      path: ['allocations'],
    },
  );
export const reallocateSchema = versionSchema
  .extend({ orderItemId: z.uuid(), unitId: z.uuid(), reason: z.string().trim().min(1).max(10_000) })
  .strict();
const evidenceSchema = z
  .object({
    uploadKey: z.string().trim().min(1).max(500),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    size: z.coerce.number().int().positive(),
    capturedAt: z.coerce.date().optional(),
  })
  .strict();
export const pickupSchema = versionSchema
  .extend({
    items: z
      .array(
        z
          .object({
            orderItemId: z.uuid(),
            conditionGrade: z.enum(grade),
            conditionNotes: z.string().trim().max(10_000).optional(),
            evidence: z.array(evidenceSchema).min(1).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export const returnSchema = versionSchema
  .extend({
    returnNotes: z.string().trim().max(10_000).nullable().optional(),
    items: z
      .array(
        z
          .object({
            orderItemId: z.uuid(),
            returnConditionGrade: z.enum(grade),
            isMissing: z.boolean().default(false),
            damageNotes: z.string().trim().max(10_000).nullable().optional(),
            damageFeeVnd: z.coerce.bigint().min(0n).default(0n),
            missingFeeVnd: z.coerce.bigint().min(0n).default(0n),
            nextOperationalStatus: z.enum(['CLEANING', 'REPAIR']),
            evidence: z.array(evidenceSchema).min(1).max(10),
            accessories: z
              .array(
                z
                  .object({
                    accessoryId: z.uuid(),
                    quantityReturned: z.coerce.number().int().min(0).max(100),
                    conditionIn: z.enum(grade).nullable().optional(),
                    damageFeeVnd: z.coerce.bigint().min(0n).default(0n),
                    missingFeeVnd: z.coerce.bigint().min(0n).default(0n),
                  })
                  .strict(),
              )
              .default([]),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export const completeSchema = versionSchema
  .extend({
    otherFeeVnd: z.coerce.bigint().min(0n).default(0n),
    depositDeductionVnd: z.coerce.bigint().min(0n).default(0n),
    settlementNote: z.string().trim().max(10_000).nullable().optional(),
  })
  .strict();
export const eventListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export { activeStatuses };
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type ListOrdersInput = z.infer<typeof listOrdersSchema>;
export type ConfirmInput = z.infer<typeof confirmSchema>;
export type ReallocateInput = z.infer<typeof reallocateSchema>;
export type PickupInput = z.infer<typeof pickupSchema>;
export type ReturnInput = z.infer<typeof returnSchema>;
export type CompleteInput = z.infer<typeof completeSchema>;
