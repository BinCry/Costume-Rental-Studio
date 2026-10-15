import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { hasPermission, type AuthenticatedActor } from '../auth/authorization.js';
import {
  aiKnowledgeResponseSchema,
  type KnowledgeAnswer,
  type KnowledgeAnswerInput,
} from './knowledge.schema.js';

interface AnswerKnowledgeOptions {
  actor: KnowledgeActorContext;
  requestId?: string;
}

type KnowledgeAudience = 'customer' | 'staff_internal' | 'shared';

export interface KnowledgeActorContext {
  userId: string;
  audiences: readonly KnowledgeAudience[];
}

export function knowledgeActorContext(
  actor: AuthenticatedActor | undefined,
): KnowledgeActorContext {
  if (!actor) return { userId: 'guest', audiences: ['customer', 'shared'] };

  const activeAssignments = actor.roleAssignments.filter(
    ({ branchId, branch, role }) =>
      role.isActive && (branchId === null || branch?.status === 'ACTIVE'),
  );
  const canReadInternal = hasPermission(actor, {
    module: 'knowledge',
    action: 'read',
    scope: 'ALL',
  });
  if (canReadInternal) {
    return { userId: actor.id, audiences: ['staff_internal', 'shared'] };
  }

  const isCustomer = activeAssignments.some(({ role }) => role.actorGroup === 'CUSTOMER');
  if (isCustomer) return { userId: actor.id, audiences: ['customer', 'shared'] };

  throw new AppError(403, 'FORBIDDEN', 'Knowledge access is not permitted for this account');
}

const MAX_AI_RESPONSE_BYTES = 1_000_000;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name);
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AI_RESPONSE_BYTES) {
    throw new AppError(
      503,
      'AI_SERVICE_INVALID_RESPONSE',
      'Knowledge service returned invalid data',
    );
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
      throw new AppError(
        503,
        'AI_SERVICE_INVALID_RESPONSE',
        'Knowledge service returned invalid data',
      );
    }
    text += decoder.decode(value, { stream: true });
  }
}

function upstreamError(status: number): AppError {
  if (status === 401) {
    return new AppError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid or expired');
  }
  if (status === 403) {
    return new AppError(403, 'FORBIDDEN', 'Knowledge access is not permitted for this account');
  }
  if (status === 429) {
    return new AppError(429, 'AI_RATE_LIMITED', 'Knowledge service is temporarily rate limited');
  }
  return new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'Knowledge service is unavailable');
}

export async function answerKnowledge(
  input: KnowledgeAnswerInput,
  options: AnswerKnowledgeOptions,
): Promise<KnowledgeAnswer> {
  if (!env.AI_SERVICE_URL || !env.AI_INTERNAL_API_KEY) {
    throw new AppError(503, 'AI_SERVICE_NOT_CONFIGURED', 'Knowledge service is not configured');
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-AI-Service-Key': env.AI_INTERNAL_API_KEY,
    'X-Actor-Id': options.actor.userId,
    'X-Knowledge-Audiences': options.actor.audiences.join(','),
  });
  if (options.requestId) headers.set('X-Request-Id', options.requestId);

  let response: Response;
  try {
    response = await fetch(new URL('/api/v1/knowledge/answer', env.AI_SERVICE_URL), {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(env.AI_SERVICE_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    if (isTimeout(error)) {
      throw new AppError(504, 'AI_SERVICE_TIMEOUT', 'Knowledge service timed out');
    }
    throw new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'Knowledge service is unavailable');
  }

  if (!response.ok) throw upstreamError(response.status);

  let body: unknown;
  try {
    body = JSON.parse(await readBoundedBody(response)) as unknown;
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    if (isTimeout(error)) {
      throw new AppError(504, 'AI_SERVICE_TIMEOUT', 'Knowledge service timed out');
    }
    throw new AppError(
      503,
      'AI_SERVICE_INVALID_RESPONSE',
      'Knowledge service returned invalid data',
    );
  }
  const parsed = aiKnowledgeResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      503,
      'AI_SERVICE_INVALID_RESPONSE',
      'Knowledge service returned invalid data',
    );
  }
  return parsed.data.data.result;
}
