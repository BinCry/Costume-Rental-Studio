import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { assertPermission, hasPermission, type AuthenticatedActor } from '../auth/authorization.js';
import {
  knowledgeActorContext,
  opsAgentKnowledgeActorContext,
  type KnowledgeActorContext,
} from '../knowledge/knowledge.service.js';
import {
  aiAgentCaseListResponseSchema,
  aiAgentCaseResponseSchema,
  aiAgentResponseSchema,
  type AgentCaseListQuery,
  type AgentCaseBrowserListData,
  type AgentCaseBrowserResult,
  type AgentCaseResult,
  type AgentDecisionInput,
  type AgentMessageInput,
  type AgentOverdueFollowUpConfirmationInput,
} from './agent.schema.js';

const MAX_AI_RESPONSE_BYTES = 1_000_000;
const OPERATIONAL_CASE_RULES = new Set([
  'PREVIOUS_RENTAL_NOT_RETURNED',
  'ALLOCATED_UNIT_NOT_READY',
  'ORDER_PREPARATION_DELAYED',
  'RENTAL_RETURN_OVERDUE',
  'OPERATIONAL_CAPACITY_SHORTFALL',
  'UNIT_SCHEDULE_CONFLICT',
]);

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

async function upstreamError(response: Response): Promise<AppError> {
  const status = response.status;
  if (status === 401) return new AppError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid');
  if (status === 403) return new AppError(403, 'FORBIDDEN', 'Agent access is not permitted');
  if (status === 404) return new AppError(404, 'AGENT_CASE_NOT_FOUND', 'Agent case not found');
  if (status === 400 || status === 422)
    return new AppError(400, 'VALIDATION_ERROR', 'Agent request is invalid');
  if (status === 409) {
    const allowedCodes = new Set([
      'AGENT_CASE_ALREADY_CLAIMED',
      'AGENT_CASE_VERSION_CONFLICT',
      'AGENT_CASE_NOT_OWNER',
      'AGENT_CASE_RELEASE_FORBIDDEN',
      'AGENT_CASE_CLAIM_FORBIDDEN',
      'AGENT_CASE_NOT_CLAIMED',
      'AGENT_CASE_BUSY',
      'AGENT_ANALYSIS_NOT_SUPPORTED',
      'AGENT_ANALYSIS_STALE',
      'AGENT_FINDING_NOT_OPEN',
      'AGENT_RECOMMENDATION_NOT_EXECUTABLE',
    ]);
    try {
      const body = JSON.parse(await readBoundedBody(response)) as {
        error?: { code?: unknown; message?: unknown; details?: unknown };
      };
      const code = typeof body.error?.code === 'string' ? body.error.code : '';
      if (allowedCodes.has(code)) {
        const message =
          typeof body.error?.message === 'string'
            ? body.error.message
            : 'Agent case update conflicted';
        const details =
          body.error?.details && typeof body.error.details === 'object'
            ? (body.error.details as Record<string, unknown>)
            : undefined;
        return new AppError(409, code, message, details);
      }
    } catch {
      // Fall through to the stable generic conflict contract.
    }
    return new AppError(409, 'AGENT_CASE_CONFLICT', 'Agent case cannot be resumed');
  }
  if (status === 504) return new AppError(504, 'AI_SERVICE_TIMEOUT', 'Agent service timed out');
  if (status === 429) return new AppError(429, 'AI_RATE_LIMITED', 'Agent service is rate limited');
  if (status === 503) {
    try {
      const body = JSON.parse(await readBoundedBody(response)) as {
        error?: { code?: unknown; message?: unknown };
      };
      const code = body.error?.code;
      if (
        code === 'AGENT_READINESS_ANALYSIS_DISABLED' ||
        code === 'AGENT_ANALYSIS_DEPENDENCY_FAILURE'
      ) {
        return new AppError(
          503,
          code,
          typeof body.error?.message === 'string'
            ? body.error.message
            : 'Agent analysis is unavailable',
        );
      }
    } catch {
      // Preserve the generic unavailable contract below.
    }
  }
  return new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'Agent service is unavailable');
}

function branchIdsWithPermission(actor: AuthenticatedActor, action: 'read' | 'manage') {
  return [
    ...new Set(
      actor.roleAssignments
        .filter(
          (assignment) =>
            assignment.branchId &&
            assignment.branch?.status === 'ACTIVE' &&
            assignment.role.isActive &&
            assignment.role.rolePermissions.some(
              ({ permission }) =>
                permission.module === 'agents' &&
                permission.action === action &&
                permission.scope === 'BRANCH',
            ),
        )
        .map((assignment) => assignment.branchId!),
    ),
  ];
}

function agentHeaders(
  actor: AuthenticatedActor,
  knowledge: KnowledgeActorContext,
  requestId?: string,
  branchId?: string,
): Headers {
  if (!env.AI_INTERNAL_API_KEY) {
    throw new AppError(503, 'AI_SERVICE_NOT_CONFIGURED', 'Agent service is not configured');
  }
  const readBranchIds = branchIdsWithPermission(actor, 'read');
  const manageBranchIds = branchIdsWithPermission(actor, 'manage');
  const readAll = hasPermission(actor, { module: 'agents', action: 'read' });
  const manageAll = hasPermission(actor, { module: 'agents', action: 'manage' });
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-AI-Service-Key': env.AI_INTERNAL_API_KEY,
    'X-Actor-Id': knowledge.userId,
    'X-Knowledge-Audiences': knowledge.audiences.join(','),
    'X-Agent-Read-Branch-Ids': readBranchIds.join(','),
    'X-Agent-Manage-Branch-Ids': manageBranchIds.join(','),
    'X-Agent-Read-All': String(readAll),
    'X-Agent-Manage-All': String(manageAll),
  });
  if (branchId) headers.set('X-Case-Branch-Id', branchId);
  if (requestId) headers.set('X-Request-Id', requestId);
  return headers;
}

async function authorizeAgentBranch(
  actor: AuthenticatedActor,
  branchId: string,
  agentPermission?: 'read' | 'manage',
): Promise<KnowledgeActorContext> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { status: true },
  });
  if (branch?.status !== 'ACTIVE') {
    throw new AppError(400, 'INVALID_AGENT_BRANCH', 'Selected branch is not active');
  }
  if (
    agentPermission &&
    hasPermission(actor, { module: 'agents', action: agentPermission, branchId })
  ) {
    return { userId: actor.id, audiences: ['staff_internal', 'shared'] };
  }
  const knowledgeActor = opsAgentKnowledgeActorContext(actor);
  assertPermission(actor, {
    module: 'knowledge',
    action: 'read',
    scope: 'BRANCH',
    branchId,
  });
  return knowledgeActor;
}

async function callAgent(
  path: string,
  init: RequestInit,
  actor: AuthenticatedActor,
  requestId?: string,
  responseEnvelope: 'message' | 'case' = 'case',
  scopeOnly = false,
  branchId?: string,
  knowledgeActor?: KnowledgeActorContext,
): Promise<AgentCaseResult> {
  if (!env.AI_SERVICE_URL) {
    throw new AppError(503, 'AI_SERVICE_NOT_CONFIGURED', 'Agent service is not configured');
  }
  const knowledge =
    knowledgeActor ??
    (scopeOnly
      ? { userId: actor.id, audiences: ['staff_internal', 'shared'] }
      : knowledgeActorContext(actor));
  const headers = agentHeaders(actor, knowledge, requestId, branchId);
  let response: Response;
  try {
    response = await fetch(new URL(path, env.AI_SERVICE_URL), {
      ...init,
      headers,
      signal: AbortSignal.timeout(env.AI_SERVICE_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    if (isTimeout(error)) throw new AppError(504, 'AI_SERVICE_TIMEOUT', 'Agent service timed out');
    throw new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'Agent service is unavailable');
  }
  if (!response.ok) throw await upstreamError(response);
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
): Promise<AgentCaseBrowserResult> {
  const knowledgeActor = await authorizeAgentBranch(actor, input.branchId);
  const result = await callAgent(
    '/api/v1/agent/messages',
    { method: 'POST', body: JSON.stringify(input) },
    actor,
    requestId,
    'message',
    input.caseId !== undefined,
    input.branchId,
    knowledgeActor,
  );
  return (await enrichAgentCases([result], input.branchId, actor))[0]!;
}

export async function getAgentCase(
  caseId: string,
  branchId: string,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseBrowserResult> {
  const result = await callAgent(
    `/api/v1/agent/cases/${encodeURIComponent(caseId)}`,
    { method: 'GET' },
    actor,
    requestId,
    'case',
    true,
    branchId,
    await authorizeAgentBranch(actor, branchId, 'read'),
  );
  return (await enrichAgentCases([result], branchId, actor))[0]!;
}

async function caseAction(
  path: string,
  actor: AuthenticatedActor,
  requestId?: string,
  input?: unknown,
  scopeOnly = true,
  branchId?: string,
): Promise<AgentCaseBrowserResult> {
  const knowledgeActor = branchId
    ? await authorizeAgentBranch(actor, branchId, 'manage')
    : undefined;
  const result = await callAgent(
    path,
    { method: 'POST', body: input ? JSON.stringify(input) : undefined },
    actor,
    requestId,
    'case',
    scopeOnly,
    branchId,
    knowledgeActor,
  );
  const resultBranchId = branchId ?? result.branchId ?? undefined;
  if (!resultBranchId) {
    const { ownerActorId, ...safeResult } = result;
    return {
      ...safeResult,
      ownership: ownerActorId ? (ownerActorId === actor.id ? 'MINE' : 'OTHER') : 'UNCLAIMED',
    };
  }
  return (await enrichAgentCases([result], resultBranchId, actor))[0]!;
}

export async function confirmAgentCase(
  caseId: string,
  confirmationId: string,
  branchId: string,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  return caseAction(
    `/api/v1/agent/cases/${encodeURIComponent(caseId)}/confirmations/${encodeURIComponent(confirmationId)}/confirm`,
    actor,
    requestId,
    undefined,
    true,
    branchId,
  );
}

export async function rejectAgentCaseConfirmation(
  caseId: string,
  confirmationId: string,
  branchId: string,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  return caseAction(
    `/api/v1/agent/cases/${encodeURIComponent(caseId)}/confirmations/${encodeURIComponent(confirmationId)}/reject`,
    actor,
    requestId,
    undefined,
    true,
    branchId,
  );
}

export async function cancelAgentCase(
  caseId: string,
  branchId: string,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  return caseAction(
    `/api/v1/agent/cases/${encodeURIComponent(caseId)}/cancel`,
    actor,
    requestId,
    undefined,
    true,
    branchId,
  );
}

export async function approveAgentAction(
  approvalId: string,
  branchId: string,
  actor: AuthenticatedActor,
  requestId?: string,
  input?: AgentDecisionInput,
): Promise<AgentCaseResult> {
  return caseAction(
    `/api/v1/agent/approvals/${encodeURIComponent(approvalId)}/approve`,
    actor,
    requestId,
    input,
    true,
    branchId,
  );
}

export async function rejectAgentAction(
  approvalId: string,
  branchId: string,
  actor: AuthenticatedActor,
  requestId?: string,
  input?: AgentDecisionInput,
): Promise<AgentCaseResult> {
  return caseAction(
    `/api/v1/agent/approvals/${encodeURIComponent(approvalId)}/reject`,
    actor,
    requestId,
    input,
    true,
    branchId,
  );
}

export async function listAgentCases(
  input: AgentCaseListQuery,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseBrowserListData> {
  const query = new URLSearchParams({ ownership: input.ownership, limit: String(input.limit) });
  if (input.branchId) query.set('branchId', input.branchId);
  if (input.state) query.set('state', input.state);
  if (input.cursor) query.set('cursor', input.cursor);
  if (!env.AI_SERVICE_URL) {
    throw new AppError(503, 'AI_SERVICE_NOT_CONFIGURED', 'Agent service is not configured');
  }
  const headers = agentHeaders(
    actor,
    { userId: actor.id, audiences: ['staff_internal', 'shared'] },
    requestId,
  );
  let response: Response;
  try {
    response = await fetch(new URL(`/api/v1/agent/cases?${query}`, env.AI_SERVICE_URL), {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(env.AI_SERVICE_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    if (isTimeout(error)) throw new AppError(504, 'AI_SERVICE_TIMEOUT', 'Agent service timed out');
    throw new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'Agent service is unavailable');
  }
  if (!response.ok) throw await upstreamError(response);
  let body: unknown;
  try {
    body = JSON.parse(await readBoundedBody(response)) as unknown;
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'AI_SERVICE_INVALID_RESPONSE', 'Agent service returned invalid data');
  }
  const parsed = aiAgentCaseListResponseSchema.safeParse(body);
  if (!parsed.success)
    throw new AppError(503, 'AI_SERVICE_INVALID_RESPONSE', 'Agent service returned invalid data');
  const scopedCases = parsed.data.data.items.filter(
    (item) =>
      item.branchId === input.branchId &&
      Boolean(item.finding && OPERATIONAL_CASE_RULES.has(item.finding.ruleCode)),
  );
  return {
    ...parsed.data.data,
    items: await enrichAgentCases(scopedCases, input.branchId, actor),
  };
}

function evidenceUnitIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(evidenceUnitIds);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) => {
    if (/^unitIds?$/i.test(key)) {
      const candidates = Array.isArray(nested) ? nested : [nested];
      return candidates.filter(
        (candidate): candidate is string =>
          typeof candidate === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate),
      );
    }
    return evidenceUnitIds(nested);
  });
}

async function enrichAgentCases(
  cases: AgentCaseResult[],
  branchId: string,
  actor: AuthenticatedActor,
): Promise<AgentCaseBrowserResult[]> {
  const entityIds = [
    ...new Set(
      cases.flatMap((item) =>
        [item.finding?.primaryEntityId, item.finding?.affectedEntityId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ),
  ];
  const unitIds = [
    ...new Set(
      cases.flatMap((item) =>
        [item.finding?.unitId, ...evidenceUnitIds(item.finding?.evidence)].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ),
  ];
  const [orders, units] = await Promise.all([
    entityIds.length &&
    hasPermission(actor, {
      module: 'rentals',
      action: 'read',
      scope: 'BRANCH',
      branchId,
    })
      ? prisma.rentalOrder.findMany({
          where: { id: { in: entityIds }, pickupBranchId: branchId },
          select: {
            id: true,
            orderCode: true,
            status: true,
            plannedStartAt: true,
            plannedDueAt: true,
          },
        })
      : Promise.resolve([]),
    unitIds.length &&
    hasPermission(actor, {
      module: 'inventory',
      action: 'read',
      scope: 'BRANCH',
      branchId,
    })
      ? prisma.costumeUnit.findMany({
          where: { id: { in: unitIds }, currentBranchId: branchId },
          select: {
            id: true,
            unitCode: true,
            operationalStatus: true,
            conditionGrade: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const ordersById = new Map(orders.map((item) => [item.id, item]));
  const unitsById = new Map(units.map((item) => [item.id, item]));
  return cases.map((item) => {
    const { ownerActorId, finding, ...safeCase } = item;
    const orderIds = [finding?.primaryEntityId, finding?.affectedEntityId].filter(
      (id): id is string => Boolean(id),
    );
    const relatedOrders = [...new Set(orderIds)]
      .map((id) => ordersById.get(id))
      .filter((order): order is NonNullable<typeof order> => Boolean(order))
      .map(({ orderCode, status, plannedStartAt, plannedDueAt }) => ({
        orderCode,
        status,
        plannedStartAt: plannedStartAt.toISOString(),
        plannedDueAt: plannedDueAt.toISOString(),
      }));
    const relatedUnits = [...new Set([finding?.unitId, ...evidenceUnitIds(finding?.evidence)])]
      .filter((id): id is string => Boolean(id))
      .map((id) => unitsById.get(id))
      .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit))
      .map(({ unitCode, operationalStatus, conditionGrade }) => ({
        unitCode,
        operationalStatus,
        conditionGrade,
      }));
    return {
      ...safeCase,
      ...(finding ? { finding } : {}),
      ownership: ownerActorId ? (ownerActorId === actor.id ? 'MINE' : 'OTHER') : 'UNCLAIMED',
      ...(relatedOrders.length ? { relatedOrders } : {}),
      ...(relatedUnits.length ? { relatedUnits } : {}),
    };
  });
}

export async function claimAgentCase(
  caseId: string,
  expectedVersion: number,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  return caseAction(
    `/api/v1/agent/cases/${encodeURIComponent(caseId)}/claim`,
    actor,
    requestId,
    { expectedVersion },
    true,
  );
}

export async function releaseAgentCase(
  caseId: string,
  expectedVersion: number,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  return caseAction(
    `/api/v1/agent/cases/${encodeURIComponent(caseId)}/release`,
    actor,
    requestId,
    { expectedVersion },
    true,
  );
}

export async function analyzeAgentCase(
  caseId: string,
  expectedVersion: number,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  if (!env.AGENT_READINESS_ANALYSIS_ENABLED) {
    throw new AppError(
      503,
      'AGENT_READINESS_ANALYSIS_DISABLED',
      'Rental readiness analysis is disabled',
    );
  }
  return caseAction(
    `/api/v1/agent/cases/${encodeURIComponent(caseId)}/analyze`,
    actor,
    requestId,
    { expectedVersion },
    true,
  );
}

export async function prepareReadinessConfirmation(
  caseId: string,
  analysisId: string,
  expectedVersion: number,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  if (!env.AGENT_READINESS_EXECUTION_ENABLED) {
    throw new AppError(
      503,
      'AGENT_READINESS_EXECUTION_DISABLED',
      'Rental readiness execution is disabled',
    );
  }
  return caseAction(
    `/api/v1/agent/cases/${encodeURIComponent(caseId)}/confirmations`,
    actor,
    requestId,
    { analysisId, expectedVersion },
    true,
  );
}

export async function prepareOverdueFollowUpConfirmation(
  caseId: string,
  input: AgentOverdueFollowUpConfirmationInput,
  actor: AuthenticatedActor,
  requestId?: string,
): Promise<AgentCaseResult> {
  if (!env.AGENT_CRM_WRITE_ENABLED) {
    throw new AppError(
      503,
      'AGENT_CRM_WRITE_DISABLED',
      'Agent CRM follow-up recording is disabled',
    );
  }
  return caseAction(
    `/api/v1/agent/cases/${encodeURIComponent(caseId)}/overdue-follow-ups/confirmations`,
    actor,
    requestId,
    input,
    true,
  );
}
