import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';
import { sendError, sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireActiveEmployee } from '../auth/authorization.js';
import type { AuthenticatedActor } from '../auth/authorization.js';
import { agentDecisionInputSchema, agentMessageInputSchema } from './agent.schema.js';
import {
  cancelAgentCase,
  approveAgentAction,
  confirmAgentCase,
  getAgentCase,
  rejectAgentCaseConfirmation,
  rejectAgentAction,
  sendAgentMessage,
} from './agent.service.js';

export const agentRouter = Router();

const requireOpsAgentAccess: RequestHandler = (_req, res, next) => {
  requireActiveEmployee(res.locals.actor as AuthenticatedActor | undefined);
  next();
};

const agentRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (_request, response) => {
    const actor = response.locals.actor as { id?: unknown } | undefined;
    return `actor:${typeof actor?.id === 'string' ? actor.id : 'unknown'}`;
  },
  handler: (request, response) => {
    sendError(request, response, 429, 'AGENT_RATE_LIMITED', 'Too many agent requests');
  },
});

agentRouter.post(
  '/messages',
  requireAuthentication,
  requireOpsAgentAccess,
  agentRateLimit,
  async (req, res) => {
    const parsed = agentMessageInputSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid agent message request');
    const result = await sendAgentMessage(
      parsed.data,
      res.locals.actor as AuthenticatedActor,
      typeof req.id === 'string' ? req.id : undefined,
    );
    return sendSuccess(res, result, 'Agent message completed');
  },
);

agentRouter.get(
  '/cases/:caseId',
  requireAuthentication,
  requireOpsAgentAccess,
  async (req, res) => {
    const caseId = z.uuid().safeParse(req.params.caseId);
    if (!caseId.success)
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid agent case identifier');
    const result = await getAgentCase(
      caseId.data,
      parseId(req.header('X-Branch-Id'), 'Invalid agent branch identifier'),
      res.locals.actor as AuthenticatedActor,
      typeof req.id === 'string' ? req.id : undefined,
    );
    return sendSuccess(res, result, 'Agent case retrieved');
  },
);

function parseId(value: unknown, message: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return parsed.data;
}

agentRouter.post(
  '/cases/:caseId/confirmations/:confirmationId/confirm',
  requireAuthentication,
  requireOpsAgentAccess,
  async (req, res) => {
    const result = await confirmAgentCase(
      parseId(req.params.caseId, 'Invalid agent case identifier'),
      parseId(req.params.confirmationId, 'Invalid confirmation identifier'),
      parseId(req.header('X-Branch-Id'), 'Invalid agent branch identifier'),
      res.locals.actor as AuthenticatedActor,
      typeof req.id === 'string' ? req.id : undefined,
    );
    return sendSuccess(res, result, 'Agent confirmation recorded');
  },
);

agentRouter.post(
  '/cases/:caseId/confirmations/:confirmationId/reject',
  requireAuthentication,
  requireOpsAgentAccess,
  async (req, res) => {
    const result = await rejectAgentCaseConfirmation(
      parseId(req.params.caseId, 'Invalid agent case identifier'),
      parseId(req.params.confirmationId, 'Invalid confirmation identifier'),
      parseId(req.header('X-Branch-Id'), 'Invalid agent branch identifier'),
      res.locals.actor as AuthenticatedActor,
      typeof req.id === 'string' ? req.id : undefined,
    );
    return sendSuccess(res, result, 'Agent confirmation rejected');
  },
);

agentRouter.post(
  '/cases/:caseId/cancel',
  requireAuthentication,
  requireOpsAgentAccess,
  async (req, res) => {
    const result = await cancelAgentCase(
      parseId(req.params.caseId, 'Invalid agent case identifier'),
      parseId(req.header('X-Branch-Id'), 'Invalid agent branch identifier'),
      res.locals.actor as AuthenticatedActor,
      typeof req.id === 'string' ? req.id : undefined,
    );
    return sendSuccess(res, result, 'Agent case cancelled');
  },
);

agentRouter.post(
  '/approvals/:approvalId/approve',
  requireAuthentication,
  requireOpsAgentAccess,
  async (req, res) => {
    const input = agentDecisionInputSchema.safeParse(req.body ?? {});
    if (!input.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid approval decision');
    const result = await approveAgentAction(
      parseId(req.params.approvalId, 'Invalid approval identifier'),
      parseId(req.header('X-Branch-Id'), 'Invalid agent branch identifier'),
      res.locals.actor as AuthenticatedActor,
      typeof req.id === 'string' ? req.id : undefined,
      input.data,
    );
    return sendSuccess(res, result, 'Agent approval recorded');
  },
);

agentRouter.post(
  '/approvals/:approvalId/reject',
  requireAuthentication,
  requireOpsAgentAccess,
  async (req, res) => {
    const input = agentDecisionInputSchema.safeParse(req.body ?? {});
    if (!input.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid approval decision');
    const result = await rejectAgentAction(
      parseId(req.params.approvalId, 'Invalid approval identifier'),
      parseId(req.header('X-Branch-Id'), 'Invalid agent branch identifier'),
      res.locals.actor as AuthenticatedActor,
      typeof req.id === 'string' ? req.id : undefined,
      input.data,
    );
    return sendSuccess(res, result, 'Agent approval rejected');
  },
);
