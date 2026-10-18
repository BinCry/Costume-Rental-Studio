import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { env } from '../../config/env.js';
import {
  agentApprovalAuthorizationSchema,
  agentToolExecutionSchema,
  internalActorHeadersSchema,
} from './agent-tools.schema.js';
import {
  authorizeAgentApproval,
  executeAgentTool,
  loadInternalToolActor,
} from './agent-tools.service.js';

export const agentToolsInternalRouter = Router();

function normalizedFailure(error: unknown, requestId: string) {
  if (!(error instanceof AppError)) return undefined;
  const notFoundCodes = new Set([
    'RENTAL_ORDER_NOT_FOUND',
    'PAYMENT_NOT_FOUND',
    'COSTUME_UNIT_NOT_FOUND',
    'UNIT_NOT_FOUND',
    'VARIANT_NOT_FOUND',
    'ORDER_ITEM_NOT_FOUND',
    'POLICY_NOT_FOUND',
    'UNIT_BLOCK_NOT_FOUND',
    'TRANSFER_NOT_FOUND',
    'REFUND_NOT_FOUND',
    'AGENT_CASE_RESOURCE_NOT_FOUND',
  ]);
  const versionConflictCodes = new Set([
    'ORDER_VERSION_CONFLICT',
    'TRANSFER_VERSION_CONFLICT',
    'UNIT_BLOCK_VERSION_CONFLICT',
  ]);
  const status = notFoundCodes.has(error.code)
    ? 'not_found'
    : error.statusCode === 403
      ? 'forbidden'
      : error.statusCode === 409 && versionConflictCodes.has(error.code)
        ? 'version_conflict'
        : error.statusCode === 409
          ? 'business_conflict'
          : error.statusCode === 400
            ? 'validation_error'
            : undefined;
  if (!status) return undefined;
  return {
    status,
    source: 'studio-api',
    observedAt: new Date().toISOString(),
    requestId,
    details: { code: error.code },
  };
}

function hasValidInternalKey(candidate: string | undefined): boolean {
  const configured = env.AI_INTERNAL_API_KEY;
  if (!configured || !candidate) return false;
  const configuredBytes = Buffer.from(configured, 'utf8');
  const candidateBytes = Buffer.from(candidate, 'utf8');
  return (
    configuredBytes.length === candidateBytes.length &&
    timingSafeEqual(configuredBytes, candidateBytes)
  );
}

agentToolsInternalRouter.post('/execute', async (req, res) => {
  const serviceKey = req.header('X-AI-Service-Key');
  if (!hasValidInternalKey(serviceKey)) {
    throw new AppError(
      401,
      'INVALID_INTERNAL_SERVICE_KEY',
      'Internal service authentication failed',
    );
  }

  const headers = internalActorHeadersSchema.safeParse({
    actorId: req.header('X-Actor-Id'),
    requestId: req.header('X-Request-Id'),
    caseBranchId: req.header('X-Case-Branch-Id'),
    contract: req.header('X-Agent-Tools-Contract'),
  });
  if (!headers.success) {
    throw new AppError(400, 'INVALID_ACTOR_CONTEXT', 'Internal actor context is invalid');
  }

  const parsed = agentToolExecutionSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid agent tool execution request');
  }

  try {
    const actor = await loadInternalToolActor(headers.data.actorId);
    const result = await executeAgentTool(
      actor,
      parsed.data,
      headers.data.requestId,
      headers.data.caseBranchId,
    );
    return sendSuccess(res, result, 'Agent tool executed');
  } catch (error: unknown) {
    const result = normalizedFailure(error, headers.data.requestId);
    if (result) return sendSuccess(res, result, 'Agent tool completed with a business outcome');
    throw error;
  }
});

agentToolsInternalRouter.post('/authorize-approval', async (req, res) => {
  const serviceKey = req.header('X-AI-Service-Key');
  if (!hasValidInternalKey(serviceKey)) {
    throw new AppError(
      401,
      'INVALID_INTERNAL_SERVICE_KEY',
      'Internal service authentication failed',
    );
  }
  const headers = internalActorHeadersSchema.safeParse({
    actorId: req.header('X-Actor-Id'),
    requestId: req.header('X-Request-Id'),
    caseBranchId: req.header('X-Case-Branch-Id'),
    contract: req.header('X-Agent-Tools-Contract'),
  });
  const input = agentApprovalAuthorizationSchema.safeParse(req.body);
  if (!headers.success || !input.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid approval authorization request');
  }
  const actor = await loadInternalToolActor(headers.data.actorId);
  return sendSuccess(
    res,
    await authorizeAgentApproval(actor, input.data, headers.data.caseBranchId),
    'Approval authorized',
  );
});
