import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import {
  knowledgeActorContext,
  type KnowledgeActorContext,
} from '../knowledge/knowledge.service.js';
import type { AuthenticatedActor } from '../auth/authorization.js';
import {
  aiAgentCaseResponseSchema,
  aiAgentResponseSchema,
  type AgentCaseResult,
  type AgentDecisionInput,
  type AgentMessageInput,
} from './agent.schema.js';

const MAX_AI_RESPONSE_BYTES = 1_000_000;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name);
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AI_RESPONSE_BYTES) {
    throw new AppError(503, 'AI_SERVICE_INVALID_RESPONSE', 'Agent service returned invalid data');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    total += value.byteLength;
    if (total > MAX_AI_RESPONSE_BYTES) {
      await reader.cancel();
      throw new AppError(503, 'AI_SERVICE_INVALID_RESPONSE', 'Agent service returned invalid data');
    }
    text += decoder.decode(value, { stream: true });
  }
}

function upstreamError(status: number): AppError {
  if (status === 401) return new AppError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid');
  if (status === 403) return new AppError(403, 'FORBIDDEN', 'Agent access is not permitted');
  if (status === 404) return new AppError(404, 'AGENT_CASE_NOT_FOUND', 'Agent case not found');
  if (status === 409)
    return new AppError(409, 'AGENT_CASE_CONFLICT', 'Agent case cannot be resumed');
  if (status === 504) return new AppError(504, 'AI_SERVICE_TIMEOUT', 'Agent service timed out');
  if (status === 429) return new AppError(429, 'AI_RATE_LIMITED', 'Agent service is rate limited');
  return new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'Agent service is unavailable');
}

function agentHeaders(actor: KnowledgeActorContext, requestId?: string): Headers {
  if (!env.AI_INTERNAL_API_KEY) {
    throw new AppError(503, 'AI_SERVICE_NOT_CONFIGURED', 'Agent service is not configured');
  }
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-AI-Service-Key': env.AI_INTERNAL_API_KEY,
    'X-Actor-Id': actor.userId,
    'X-Knowledge-Audiences': actor.audiences.join(','),
  });
  if (requestId) headers.set('X-Request-Id', requestId);
  return headers;
}

async function callAgent(
  path: string,
  init: RequestInit,
  actor: KnowledgeActorContext,
  requestId?: string,
  responseEnvelope: 'message' | 'case' = 'case',
): Promise<AgentCaseResult> {
  if (!env.AI_SERVICE_URL) {
    throw new AppError(503, 'AI_SERVICE_NOT_CONFIGURED', 'Agent service is not configured');
  }
  let response: Response;
  try {
    response = await fetch(new URL(path, env.AI_SERVICE_URL), {
      ...init,
      headers: agentHeaders(actor, requestId),
      signal: AbortSignal.timeout(env.AI_SERVICE_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    if (isTimeout(error)) throw new AppError(504, 'AI_SERVICE_TIMEOUT', 'Agent service timed out');
    throw new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'Agent service is unavailable');
  }
  if (!response.ok) throw upstreamError(response.status);
  let body: unknown;
  try {
    body = JSON.parse(await readBoundedBody(response)) as unknown;
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'AI_SERVICE_INVALID_RESPONSE', 'Agent service returned invalid data');
  }
  if (responseEnvelope === 'message') {
    const parsed = aiAgentResponseSchema.safeParse(body);
    if (parsed.success) return parsed.data.data.result;
  } else {
    const parsed = aiAgentCaseResponseSchema.safeParse(body);
    if (parsed.success) return parsed.data.data;
  }
  throw new AppError(503, 'AI_SERVICE_INVALID_RESPONSE', 'Agent service returned invalid data');
}

export async function sendAgentMessage(
  input: AgentMessageInput,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  return callAgent(
    '/api/v1/agent/messages',
    { method: 'POST', body: JSON.stringify(input) },
    knowledgeActorContext(actor),
    requestId,
    'message',
  );
}

export async function getAgentCase(
  caseId: string,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  return callAgent(
    `/api/v1/agent/cases/${encodeURIComponent(caseId)}`,
    { method: 'GET' },
    knowledgeActorContext(actor),
    requestId,
  );
}

async function caseAction(
  path: string,
  actor: AuthenticatedActor,
  requestId?: string,
  input?: AgentDecisionInput,
): Promise<AgentCaseResult> {
  return callAgent(
    path,
    { method: 'POST', body: input ? JSON.stringify(input) : undefined },
    knowledgeActorContext(actor),
    requestId,
  );
}

export async function confirmAgentCase(
  caseId: string,
  confirmationId: string,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  return caseAction(
    `/api/v1/agent/cases/${encodeURIComponent(caseId)}/confirmations/${encodeURIComponent(confirmationId)}/confirm`,
    actor,
    requestId,
  );
}

export async function rejectAgentCaseConfirmation(
  caseId: string,
  confirmationId: string,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  return caseAction(
    `/api/v1/agent/cases/${encodeURIComponent(caseId)}/confirmations/${encodeURIComponent(confirmationId)}/reject`,
    actor,
    requestId,
  );
}

export async function cancelAgentCase(
  caseId: string,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  return caseAction(`/api/v1/agent/cases/${encodeURIComponent(caseId)}/cancel`, actor, requestId);
}

export async function approveAgentAction(
  approvalId: string,
  actor: AuthenticatedActor,
  requestId?: string,
  input?: AgentDecisionInput,
): Promise<AgentCaseResult> {
  return caseAction(
    `/api/v1/agent/approvals/${encodeURIComponent(approvalId)}/approve`,
    actor,
    requestId,
    input,
  );
}

export async function rejectAgentAction(
  approvalId: string,
  actor: AuthenticatedActor,
  requestId?: string,
  input?: AgentDecisionInput,
): Promise<AgentCaseResult> {
  return caseAction(
    `/api/v1/agent/approvals/${encodeURIComponent(approvalId)}/reject`,
    actor,
    requestId,
    input,
  );
}
