import { z } from 'zod';

const baseCallSchema = z
  .object({
    caseId: z.uuid(),
    toolCallId: z.uuid(),
    idempotencyKey: z.string().trim().min(1).max(255),
    expectedVersion: z.coerce.number().int().positive().nullable().optional(),
    approvalId: z.uuid().nullable().optional(),
  })
  .strict();

export const agentToolExecutionSchema = z.discriminatedUnion('toolName', [
  baseCallSchema.extend({
    toolName: z.literal('get_rental_order'),
    arguments: z.object({ orderId: z.uuid() }).strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('check_availability'),
    arguments: z
      .object({
        variantId: z.uuid(),
        pickupBranchId: z.uuid(),
        plannedStartAt: z.coerce.date(),
        plannedDueAt: z.coerce.date(),
      })
      .strict()
      .refine((value) => value.plannedDueAt > value.plannedStartAt, {
        path: ['plannedDueAt'],
        message: 'plannedDueAt must be after plannedStartAt',
      }),
  }),
  baseCallSchema.extend({
    toolName: z.literal('get_payment_summary'),
    arguments: z.object({ orderId: z.uuid() }).strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('find_rental_orders'),
    arguments: z
      .object({
        search: z.string().trim().min(1).max(100),
        pageSize: z.coerce.number().int().min(1).max(20).default(10),
      })
      .strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('get_unit_schedule'),
    arguments: z
      .object({
        unitId: z.uuid(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
      .strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('get_stock_transfer'),
    arguments: z.object({ transferId: z.uuid() }).strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('get_unit_block'),
    arguments: z.object({ blockId: z.uuid() }).strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('get_payment_by_idempotency_key'),
    arguments: z.object({ idempotencyKey: z.string().trim().min(1).max(255) }).strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('get_payment'),
    arguments: z.object({ paymentId: z.uuid() }).strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('get_refund_by_idempotency_key'),
    arguments: z.object({ idempotencyKey: z.string().trim().min(1).max(255) }).strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('create_unit_block'),
    arguments: z
      .object({
        unitId: z.uuid(),
        blockType: z.enum([
          'CLEANING',
          'REPAIR',
          'ALTERATION',
          'INSPECTION',
          'INTERNAL_USE',
          'MANUAL',
          'OTHER',
        ]),
        blockedFrom: z.coerce.date(),
        blockedUntil: z.coerce.date(),
        assignedTo: z.uuid().nullable().optional(),
        costVnd: z.coerce.bigint().min(0n).nullable().optional(),
        reason: z.string().trim().min(1).max(10_000),
        notes: z.string().trim().max(10_000).nullable().optional(),
      })
      .strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('update_unit_block'),
    arguments: z
      .object({
        blockId: z.uuid(),
        blockType: z
          .enum([
            'CLEANING',
            'REPAIR',
            'ALTERATION',
            'INSPECTION',
            'INTERNAL_USE',
            'MANUAL',
            'OTHER',
          ])
          .optional(),
        blockedFrom: z.coerce.date().optional(),
        blockedUntil: z.coerce.date().optional(),
        assignedTo: z.uuid().nullable().optional(),
        costVnd: z.coerce.bigint().min(0n).nullable().optional(),
        reason: z.string().trim().min(1).max(10_000).optional(),
        notes: z.string().trim().max(10_000).nullable().optional(),
        expectedUpdatedAt: z.coerce.date(),
      })
      .strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('cancel_unit_block'),
    arguments: z
      .object({ blockId: z.uuid(), reason: z.string().trim().min(1).max(10_000) })
      .strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('extend_rental_order'),
    arguments: z
      .object({
        orderId: z.uuid(),
        newDueAt: z.coerce.date(),
        reason: z.string().trim().min(1).max(10_000),
      })
      .strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('reallocate_rental_item'),
    arguments: z
      .object({
        orderId: z.uuid(),
        orderItemId: z.uuid(),
        unitId: z.uuid(),
        reason: z.string().trim().min(1).max(10_000),
      })
      .strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('cancel_rental_order'),
    arguments: z
      .object({ orderId: z.uuid(), reason: z.string().trim().min(1).max(10_000) })
      .strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('create_stock_transfer'),
    arguments: z
      .object({
        fromBranchId: z.uuid(),
        toBranchId: z.uuid(),
        unitIds: z.array(z.uuid()).min(1).max(100),
        requestNote: z.string().trim().max(10_000).optional(),
      })
      .strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('approve_stock_transfer'),
    arguments: z.object({ transferId: z.uuid() }).strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('reject_stock_transfer'),
    arguments: z
      .object({ transferId: z.uuid(), reason: z.string().trim().min(1).max(10_000) })
      .strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('create_payment_checkout'),
    arguments: z
      .object({
        orderId: z.uuid(),
        purpose: z.enum(['RENTAL', 'DEPOSIT', 'EXTRA']),
        amountVnd: z.coerce.bigint().positive(),
      })
      .strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('request_refund'),
    arguments: z
      .object({
        paymentId: z.uuid(),
        amountVnd: z.coerce.bigint().positive(),
        reason: z.string().trim().min(1).max(10_000),
      })
      .strict(),
  }),
]);

export const internalActorHeadersSchema = z
  .object({
    actorId: z.uuid(),
    requestId: z.uuid(),
    contract: z.literal('agent-tools/v1'),
  })
  .strict();

export const agentApprovalAuthorizationSchema = z
  .object({
    requiredPermission: z.enum(['transfers:manage', 'payments:manage']),
    branchIds: z.array(z.uuid()).min(1).max(2),
  })
  .strict();

export type AgentToolExecutionInput = z.infer<typeof agentToolExecutionSchema>;
export type AgentToolName = AgentToolExecutionInput['toolName'];
export type AgentApprovalAuthorizationInput = z.infer<typeof agentApprovalAuthorizationSchema>;
