import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';

const MAX_AI_RESPONSE_BYTES = 1_000_000;
export const RENTAL_READINESS_RULE_CODES = [
  'PREVIOUS_RENTAL_NOT_RETURNED',
  'ALLOCATED_UNIT_NOT_READY',
  'ORDER_PREPARATION_DELAYED',
  'RENTAL_RETURN_OVERDUE',
  'OPERATIONAL_CAPACITY_SHORTFALL',
] as const;
export type RentalReadinessRuleCode = (typeof RENTAL_READINESS_RULE_CODES)[number];

const internalFindingSchema = z.object({
  findingId: z.uuid(),
  caseId: z.uuid(),
  branchId: z.uuid(),
  ruleCode: z.enum(RENTAL_READINESS_RULE_CODES),
  ruleVersion: z.string().min(1),
  dedupeKey: z.string().min(1),
  primaryEntityId: z.uuid(),
  affectedEntityId: z.uuid().nullable(),
  unitId: z.uuid().nullable(),
  windowStart: z.iso.datetime({ offset: true }),
  windowEnd: z.iso.datetime({ offset: true }),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  status: z.literal('OPEN'),
  evidence: z.record(z.string(), z.unknown()),
  firstDetectedAt: z.iso.datetime({ offset: true }),
  lastDetectedAt: z.iso.datetime({ offset: true }),
  sourceObservedAt: z.iso.datetime({ offset: true }),
  resolvedAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

const findingListEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(internalFindingSchema),
    nextCursor: z.string().nullable().optional(),
  }),
});

const upsertEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.object({ caseId: z.uuid(), state: z.string() }).passthrough(),
});

const resolveEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.object({
    caseId: z.uuid(),
    dedupeKey: z.string(),
    outcome: z.enum(['RESOLVED', 'ALREADY_RESOLVED', 'STALE']),
    sourceObservedAt: z.iso.datetime({ offset: true }),
  }),
});

export type AgentInternalFinding = z.infer<typeof internalFindingSchema>;

export interface AgentFindingUpsertInput {
  ruleCode: RentalReadinessRuleCode;
  ruleVersion: 'v1';
  dedupeKey: string;
  branchId: string;
  primaryEntityId: string;
  affectedEntityId: string | null;
  unitId: string | null;
  windowStart: string;
  windowEnd: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  deadlineAt: string;
  evidence: Record<string, unknown>;
  observedAt: string;
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AI_RESPONSE_BYTES) {
    throw invalidResponse();
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return body + decoder.decode();
    bytes += value.byteLength;
    if (bytes > MAX_AI_RESPONSE_BYTES) {
      await reader.cancel();
      throw invalidResponse();
    }
    body += decoder.decode(value, { stream: true });
  }
}

function invalidResponse() {
  return new AppError(503, 'AI_SERVICE_INVALID_RESPONSE', 'Agent service returned invalid data');
}

async function callInternal<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  if (!env.AI_SERVICE_URL || !env.AI_INTERNAL_API_KEY) {
    throw new AppError(503, 'AI_SERVICE_NOT_CONFIGURED', 'Agent service is not configured');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_SERVICE_TIMEOUT_MS);
  timeout.unref();
  try {
    const response = await fetch(new URL(path, env.AI_SERVICE_URL), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Service-Key': env.AI_INTERNAL_API_KEY,
        ...init.headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 409) {
        throw new AppError(
          409,
          'AGENT_FINDING_RESOLUTION_CONFLICT',
          'Agent finding cannot be resolved while its case is executing',
        );
      }
      if (response.status === 504) {
        throw new AppError(504, 'AI_SERVICE_TIMEOUT', 'Agent service timed out');
      }
      throw new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'Agent service is unavailable');
    }
    let json: unknown;
    try {
      json = JSON.parse(await readBoundedBody(response));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw invalidResponse();
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw invalidResponse();
    return parsed.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError(504, 'AI_SERVICE_TIMEOUT', 'Agent service timed out');
    }
    throw new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'Agent service is unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

export async function listOpenRentalReadinessFindings(
  cursor?: string,
  limit = 100,
  ruleCode: RentalReadinessRuleCode = 'PREVIOUS_RENTAL_NOT_RETURNED',
) {
  const url = new URL('/api/v1/agent/internal/findings', env.AI_SERVICE_URL ?? 'http://invalid');
  url.searchParams.set('ruleCode', ruleCode);
  url.searchParams.set('status', 'OPEN');
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 100)));
  if (cursor) url.searchParams.set('cursor', cursor);
  const result = await callInternal(
    `${url.pathname}${url.search}`,
    { method: 'GET' },
    findingListEnvelopeSchema,
  );
  return result.data;
}

export async function upsertRentalReadinessFinding(input: AgentFindingUpsertInput) {
  const result = await callInternal(
    '/api/v1/agent/internal/findings/upsert',
    { method: 'POST', body: JSON.stringify(input) },
    upsertEnvelopeSchema,
  );
  return result.data;
}

export async function resolveRentalReadinessFinding(
  dedupeKey: string,
  observedAt: Date,
  evidence: Record<string, unknown>,
  ruleCode: RentalReadinessRuleCode = 'PREVIOUS_RENTAL_NOT_RETURNED',
) {
  const result = await callInternal(
    '/api/v1/agent/internal/findings/resolve',
    {
      method: 'POST',
      body: JSON.stringify({
        dedupeKey,
        ruleCode,
        observedAt: observedAt.toISOString(),
        resolutionCode: 'RISK_NO_LONGER_PRESENT',
        evidence,
      }),
    },
    resolveEnvelopeSchema,
  );
  return result.data;
}
