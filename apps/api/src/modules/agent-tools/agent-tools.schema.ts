import { z } from 'zod';

import { overdueFollowUpOutcome } from '../crm/crm.schema.js';

const baseCallSchema = z
  .object({
    caseId: z.uuid(),
    toolCallId: z.uuid(),
    idempotencyKey: z.string().trim().min(1).max(255),
    expectedVersion: z.coerce.number().int().positive().nullable().optional(),
    confirmationId: z.uuid().nullable().optional(),
    approvalId: z.uuid().nullable().optional(),
    payloadHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    readbackTool: z.string().trim().min(1).max(80).optional(),
    actionSnapshot: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

// The internal caller supplies this authenticated case scope separately from
// the tool arguments so the model cannot widen it.

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
    toolName: z.literal('get_rental_readiness_context'),
    arguments: z
      .object({
        ruleCode: z.enum([
          'PREVIOUS_RENTAL_NOT_RETURNED',
          'ALLOCATED_UNIT_NOT_READY',
          'ORDER_PREPARATION_DELAYED',
          'UNIT_SCHEDULE_CONFLICT',
        ]),
        primaryOrderId: z.uuid(),
        affectedOrderId: z.uuid().optional(),
        unitId: z.uuid().optional(),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.ruleCode !== 'ORDER_PREPARATION_DELAYED' && !value.unitId) {
          context.addIssue({
            code: 'custom',
            path: ['unitId'],
            message: 'unitId is required for unit-level readiness rules',
          });
        }
        if (
          ['PREVIOUS_RENTAL_NOT_RETURNED', 'UNIT_SCHEDULE_CONFLICT'].includes(value.ruleCode) &&
          !value.affectedOrderId
        ) {
          context.addIssue({
            code: 'custom',
            path: ['affectedOrderId'],
            message: 'affectedOrderId is required for two-order readiness rules',
          });
        }
      }),
  }),
  baseCallSchema.extend({
    toolName: z.literal('get_overdue_rental_context'),
    arguments: z.object({ orderId: z.uuid() }).strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('get_customer_interaction_by_idempotency_key'),
    arguments: z.object({ idempotencyKey: z.string().trim().min(1).max(255) }).strict(),
  }),
  baseCallSchema.extend({
    toolName: z.literal('get_operational_capacity_context'),
    arguments: z
      .object({
        branchId: z.uuid(),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
      })
      .strict()
      .refine((value) => value.endsAt > value.startsAt, {
        path: ['endsAt'],
        message: 'endsAt must be after startsAt',
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
        capacityWindowId: z.uuid().nullable().optional(),
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
        estimatedEffortMinutes: z.coerce.number().int().min(1).max(10_080).nullable().optional(),
        costVnd: z.coerce.bigint().min(0n).nullable().optional(),
        reason: z.string().trim().min(1).max(10_000),
        notes: z.string().trim().max(10_000).nullable().optional(),
      })
      .strict()
      .refine((value) => value.blockedUntil > value.blockedFrom, {
        path: ['blockedUntil'],
        message: 'blockedUntil must be after blockedFrom',
      }),
  }),
  baseCallSchema.extend({
    toolName: z.literal('update_unit_block'),
    arguments: z
      .object({
        blockId: z.uuid(),
        capacityWindowId: z.uuid().nullable().optional(),
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
        estimatedEffortMinutes: z.coerce.number().int().min(1).max(10_080).nullable().optional(),
        remainingEffortMinutes: z.coerce.number().int().min(0).max(10_080).nullable().optional(),
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
    toolName: z.literal('record_overdue_follow_up'),
    arguments: z
      .object({
        orderId: z.uuid(),
        channel: z.enum(['IN_PERSON', 'PHONE', 'EMAIL', 'CHAT', 'SOCIAL']),
        outcome: overdueFollowUpOutcome,
        occurredAt: z.coerce.date(),
        promisedReturnAt: z.coerce.date().optional(),
        nextFollowUpAt: z.coerce.date().optional(),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.occurredAt > new Date()) {
          context.addIssue({
            code: 'custom',
            path: ['occurredAt'],
            message: 'occurredAt cannot be in the future',
          });
        }
        if (value.outcome === 'PROMISED_RETURN' && !value.promisedReturnAt) {
          context.addIssue({
            code: 'custom',
            path: ['promisedReturnAt'],
            message: 'promisedReturnAt is required for PROMISED_RETURN',
          });
        }
        if (value.outcome !== 'PROMISED_RETURN' && value.promisedReturnAt) {
          context.addIssue({
            code: 'custom',
            path: ['promisedReturnAt'],
            message: 'promisedReturnAt is only allowed for PROMISED_RETURN',
          });
        }
        if (value.promisedReturnAt && value.promisedReturnAt <= value.occurredAt) {
          context.addIssue({
            code: 'custom',
            path: ['promisedReturnAt'],
            message: 'promisedReturnAt must be after occurredAt',
          });
        }
        if (value.nextFollowUpAt && value.nextFollowUpAt <= value.occurredAt) {
          context.addIssue({
            code: 'custom',
            path: ['nextFollowUpAt'],
            message: 'nextFollowUpAt must be after occurredAt',
          });
        }
        if (
          ['NO_ANSWER', 'REQUESTED_EXTENSION', 'REFUSED_RETURN'].includes(value.outcome) &&
          !value.nextFollowUpAt
        ) {
          context.addIssue({
            code: 'custom',
            path: ['nextFollowUpAt'],
            message: `nextFollowUpAt is required for ${value.outcome}`,
          });
        }
      }),
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
    caseBranchId: z.uuid(),
    contract: z.literal('agent-tools/v2'),
  })
  .strict();

export type InternalActorHeaders = z.infer<typeof internalActorHeadersSchema>;

export const agentApprovalAuthorizationSchema = z
  .object({
    requiredPermission: z.enum(['transfers:manage', 'payments:manage']),
    branchIds: z.array(z.uuid()).min(1).max(2),
  })
  .strict();

export type AgentToolExecutionInput = z.infer<typeof agentToolExecutionSchema>;
export type AgentToolName = AgentToolExecutionInput['toolName'];
export type AgentApprovalAuthorizationInput = z.infer<typeof agentApprovalAuthorizationSchema>;
