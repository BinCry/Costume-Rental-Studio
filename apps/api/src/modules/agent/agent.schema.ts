import { z } from 'zod';

export const agentMessageInputSchema = z
  .object({
    message: z.string().trim().min(2).max(2_000),
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

export const agentCaseResultSchema = z.object({
  caseId: z.uuid(),
  state: z.string().min(1),
  message: z.string(),
  evidence: z.array(agentEvidenceSchema),
  runStatus: z.string().min(1).nullable().optional(),
  goal: z
    .object({
      summary: z.string(),
      status: z.string(),
      goalType: z.string().nullable().optional(),
      skillName: z.string().nullable().optional(),
      constraints: z.record(z.string(), z.unknown()).optional(),
      plan: z.array(z.record(z.string(), z.unknown())).optional(),
      successCriteria: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
  stepsUsed: z.number().int().nonnegative().optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  terminationReason: z.string().min(1).nullable().optional(),
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
      reason: z.string(),
      goal: z.string().nullable().optional(),
      attemptedTools: z.array(z.string()),
      successfulTools: z.array(z.string()),
      failedTools: z.array(z.string()),
      evidenceCount: z.number().int().nonnegative(),
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
