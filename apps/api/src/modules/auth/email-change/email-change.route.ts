import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { z } from 'zod';

import { AppError } from '../../../common/errors/app-error.js';
import { sendError, sendSuccess } from '../../../common/http/response.js';
import type { CustomerActor } from '../../customers/customer.service.js';
import { requireAuthentication } from '../auth.middleware.js';
import { clearRefreshCookie, requireTrustedOrigin } from '../session/session.cookie.js';
import { confirmEmailChangeSchema, requestEmailChangeSchema } from './email-change.schema.js';
import { confirmEmailChange, requestEmailChange } from './email-change.service.js';

export const emailChangeRouter = Router();

const emailChangeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (request, response) =>
    sendError(request, response, 429, 'AUTH_RATE_LIMITED', 'Too many authentication attempts'),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid email change information', {
      fields: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

emailChangeRouter.post(
  '/change-email/otp',
  requireTrustedOrigin,
  emailChangeRateLimit,
  requireAuthentication,
  async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const actor = response.locals.actor as CustomerActor;
    const input = parse(requestEmailChangeSchema, request.body);
    return sendSuccess(
      response,
      await requestEmailChange(actor.id, input),
      'Verification code sent to the new email',
      202,
    );
  },
);

emailChangeRouter.post(
  '/change-email/confirm',
  requireTrustedOrigin,
  emailChangeRateLimit,
  requireAuthentication,
  async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const actor = response.locals.actor as CustomerActor;
    const input = parse(confirmEmailChangeSchema, request.body);
    await confirmEmailChange(actor.id, input);
    clearRefreshCookie(response);
    return sendSuccess(response, null, 'Email changed; log in again');
  },
);
