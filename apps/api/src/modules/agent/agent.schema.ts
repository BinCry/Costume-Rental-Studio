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

const agentEvidenceSchema = z.object({
  sourceType: z.enum(['knowledge', 'live_tool']),
  sourceId: z.string().min(1),
  citation: z.string().nullable().optional(),
  observedAt: z.string().nullable().optional(),
});

// This is the browser-facing projection. Zod strips upstream-only planner
// metrics, tool traces, and nested debug metadata from objects at every level.
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
    .object({ confirmationId: z.uuid(), summary: z.string(), expiresAt: z.string() })
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

export type AgentMessageInput = z.infer<typeof agentMessageInputSchema>;
export type AgentDecisionInput = z.infer<typeof agentDecisionInputSchema>;
export type AgentCaseResult = z.infer<typeof agentCaseResultSchema>;
