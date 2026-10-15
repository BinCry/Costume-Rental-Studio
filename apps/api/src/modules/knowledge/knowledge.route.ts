import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { AppError } from '../../common/errors/app-error.js';
import { sendError, sendSuccess } from '../../common/http/response.js';
import type { AuthenticatedActor } from '../auth/authorization.js';
import { optionalAuthentication } from '../auth/auth.middleware.js';
import { knowledgeAnswerInputSchema } from './knowledge.schema.js';
import * as service from './knowledge.service.js';

export const knowledgeRouter = Router();

const knowledgeRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (request, response) => {
    const actor = response.locals.actor as { id?: unknown } | undefined;
    return typeof actor?.id === 'string'
      ? `actor:${actor.id}`
      : `guest:${ipKeyGenerator(request.ip ?? 'unknown')}`;
  },
  handler: (request, response) => {
    sendError(request, response, 429, 'KNOWLEDGE_RATE_LIMITED', 'Too many knowledge requests');
  },
});

knowledgeRouter.post('/answer', optionalAuthentication, knowledgeRateLimit, async (req, res) => {
  const parsed = knowledgeAnswerInputSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid knowledge answer request');
  }

  const result = await service.answerKnowledge(parsed.data, {
    actor: service.knowledgeActorContext(res.locals.actor as AuthenticatedActor | undefined),
    requestId: typeof req.id === 'string' ? req.id : undefined,
  });
  return sendSuccess(res, { result }, 'Knowledge answer completed');
});
