import { z } from 'zod';

export const agentMessageInputSchema = z
  .object({
    message: z.string().trim().min(2).max(2_000),
    branchId: z.uuid(),
    caseId: z.uuid().optional(),
  })
  .strict();

export const agentDecisionInputSchema = z
  .object({ reason: z.string().trim().min(1).max(2_000).optional() })
  .strict();

export const agentCaseVersionInputSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const agentCaseAnalysisInputSchema = agentCaseVersionInputSchema;

export const agentReadinessConfirmationInputSchema = agentCaseVersionInputSchema
  .extend({ analysisId: z.uuid() })
  .strict();

export const agentOverdueFollowUpConfirmationInputSchema = agentCaseVersionInputSchema
  .extend({
    analysisId: z.uuid(),
    channel: z.enum(['IN_PERSON', 'PHONE', 'EMAIL', 'CHAT', 'SOCIAL']),
    outcome: z.enum([
      'PROMISED_RETURN',
      'NO_ANSWER',
      'REQUESTED_EXTENSION',
      'REFUSED_RETURN',
      'CONTACTED',
      'OTHER',
    ]),
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
    if (value.promisedReturnAt && value.promisedReturnAt <= new Date()) {
      context.addIssue({
        code: 'custom',
        path: ['promisedReturnAt'],
        message: 'promisedReturnAt must be in the future',
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
    if (value.nextFollowUpAt && value.nextFollowUpAt <= value.occurredAt) {
      context.addIssue({
        code: 'custom',
        path: ['nextFollowUpAt'],
        message: 'nextFollowUpAt must be after occurredAt',
      });
    }
  });

export const agentCaseListQuerySchema = z
  .object({
    branchId: z.uuid().optional(),
    state: z
      .enum([
        'NEW',
        'ANALYZING',
        'PLAN_READY',
        'WAITING_INPUT',
        'WAITING_CONFIRMATION',
        'WAITING_APPROVAL',
        'EXECUTING',
        'MONITORING',
        'SUCCEEDED',
        'INSUFFICIENT_DATA',
        'HANDED_OFF',
        'FAILED',
        'CANCELLED',
      ])
      .optional(),
    ownership: z.enum(['unassigned', 'mine', 'all']).default('all'),
    cursor: z.string().regex(/^\d+$/).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();

const agentEvidenceSchema = z.object({
  sourceType: z.enum(['knowledge', 'live_tool']),
  sourceId: z.string().min(1),
  citation: z.string().nullable().optional(),
  observedAt: z.string().nullable().optional(),
});

// This is the browser-facing projection. Zod strips upstream-only planner
// metrics, tool traces, and nested debug metadata from objects at every level.
const agentFindingSchema = z.object({
  findingId: z.uuid(),
  ruleCode: z.string().min(1),
  ruleVersion: z.string().min(1),
  dedupeKey: z.string().min(1),
  primaryEntityId: z.uuid(),
  affectedEntityId: z.uuid().nullable(),
  unitId: z.uuid().nullable(),
  windowStart: z.string(),
  windowEnd: z.string(),
  severity: z.string().min(1),
  status: z.string().min(1),
  evidence: z.record(z.string(), z.unknown()),
  firstDetectedAt: z.string(),
  lastDetectedAt: z.string(),
  resolvedAt: z.string().nullable().optional(),
});

const agentReadinessAnalysisSchema = z.object({
  analysisId: z.uuid(),
  status: z.enum(['ACTIVE', 'STALE']),
  outcome: z.enum(['READY', 'NO_FEASIBLE_OPTION']),
  observedAt: z.string(),
  sourceObservedAt: z.string(),
  simulatorVersion: z.string(),
  rankingPolicyVersion: z.string(),
  before: z.record(z.string(), z.unknown()),
  options: z.array(z.record(z.string(), z.unknown())),
  recommendedOptionId: z.string().nullable(),
  narrative: z.object({
    summary: z.string(),
    rationale: z.array(z.string()),
    risks: z.array(z.string()),
    nextStep: z.string(),
    fallback: z.boolean(),
  }),
});
export const agentCaseResultSchema = z.object({
  caseId: z.uuid(),
  state: z.string().min(1),
  message: z.string(),
  evidence: z.array(agentEvidenceSchema),
  goal: z
    .object({
      summary: z.string(),
      status: z.string(),
    })
    .nullable()
    .optional(),
  pendingInput: z.string().min(1).nullable().optional(),
  pendingConfirmation: z
    .object({
      confirmationId: z.uuid(),
      analysisId: z.uuid().nullable().optional(),
      optionId: z.string().nullable().optional(),
      summary: z.string(),
      expiresAt: z.string(),
      action: z
        .object({
          toolName: z.string(),
          arguments: z.record(z.string(), z.unknown()),
          expectedVersion: z.number().int().positive(),
          payloadHash: z.string(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  pendingApproval: z
    .object({
      approvalId: z.uuid(),
      summary: z.string(),
      requiredPermission: z.string(),
      expiresAt: z.string(),
    })
    .nullable()
    .optional(),
  handoff: z
    .object({
      nextAction: z.string(),
      sideEffects: z.string(),
    })
    .nullable()
    .optional(),
  completed: z.boolean(),
  origin: z.enum(['USER', 'SYSTEM']).nullable().optional(),
  caseType: z
    .enum(['INTERACTIVE', 'RENTAL_READINESS', 'RENTAL_RETURN', 'OPERATIONAL_CAPACITY'])
    .nullable()
    .optional(),
  branchId: z.uuid().nullable().optional(),
  ownerActorId: z.uuid().nullable().optional(),
  claimedAt: z.string().nullable().optional(),
  deadlineAt: z.string().nullable().optional(),
  version: z.number().int().positive().nullable().optional(),
  finding: agentFindingSchema.nullable().optional(),
  analysis: agentReadinessAnalysisSchema.nullable().optional(),
});

export const agentCaseListDataSchema = z.object({
  items: z.array(agentCaseResultSchema),
  nextCursor: z.string().nullable().optional(),
});

export const aiAgentResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ result: agentCaseResultSchema }),
  message: z.string(),
});

export const aiAgentCaseResponseSchema = z.object({
  success: z.literal(true),
  data: agentCaseResultSchema,
  message: z.string(),
});

export const aiAgentCaseListResponseSchema = z.object({
  success: z.literal(true),
  data: agentCaseListDataSchema,
  message: z.string(),
});

export type AgentMessageInput = z.infer<typeof agentMessageInputSchema>;
export type AgentDecisionInput = z.infer<typeof agentDecisionInputSchema>;
export type AgentOverdueFollowUpConfirmationInput = z.infer<
  typeof agentOverdueFollowUpConfirmationInputSchema
>;
export type AgentCaseListQuery = z.infer<typeof agentCaseListQuerySchema>;
export type AgentCaseListData = z.infer<typeof agentCaseListDataSchema>;
export type AgentCaseResult = z.infer<typeof agentCaseResultSchema>;
