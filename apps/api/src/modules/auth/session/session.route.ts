import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import type { z } from 'zod';

import { AppError } from '../../../common/errors/app-error.js';
import { sendError, sendSuccess } from '../../../common/http/response.js';
import type { CustomerActor } from '../../customers/customer.service.js';
import { requireAuthentication } from '../auth.middleware.js';
import { changePasswordSchema, loginSchema, sessionIdSchema } from './session.schema.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  requireTrustedOrigin,
  setRefreshCookie,
} from './session.cookie.js';
import {
  changePassword,
  currentUser,
  listSessions,
  login,
  logout,
  refresh,
  revokeAllSessions,
  revokeSession,
} from './session.service.js';

export const sessionRouter = Router();
const limit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (request, response) =>
    sendError(request, response, 429, 'AUTH_RATE_LIMITED', 'Too many authentication attempts'),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid authentication input');
  return result.data;
}

function requestMetadata(request: Request, input?: { deviceId?: string; deviceName?: string }) {
  return {
    deviceId: input?.deviceId,
    deviceName: input?.deviceName,
    userAgent: request.get('user-agent')?.slice(0, 500),
    ip: request.ip?.slice(0, 45),
  };
}

sessionRouter.post('/login', requireTrustedOrigin, limit, async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const input = parse(loginSchema, request.body);
  const result = await login(input, requestMetadata(request, input));
  return sendSuccess(response, setRefreshCookie(response, result), 'Logged in');
});

sessionRouter.post('/refresh', requireTrustedOrigin, limit, async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  try {
    const token = readRefreshCookie(request);
    if (!token)
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh cookie is required; log in again');
    const result = await refresh(token, requestMetadata(request), request.log);
    return sendSuccess(response, setRefreshCookie(response, result), 'Tokens refreshed');
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) clearRefreshCookie(response);
    throw error;
  }
});

sessionRouter.post('/logout', requireTrustedOrigin, async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const token = readRefreshCookie(request);
  if (token) await logout(token);
  clearRefreshCookie(response);
  return sendSuccess(response, null, 'Logged out');
});

sessionRouter.get('/sessions', requireAuthentication, async (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const actor = response.locals.actor as CustomerActor;
  return sendSuccess(response, await listSessions(actor.id), 'Sessions retrieved');
});

sessionRouter.delete('/sessions/:sessionId', requireAuthentication, async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const { sessionId } = parse(sessionIdSchema, request.params);
  const actor = response.locals.actor as CustomerActor;
  await revokeSession(actor.id, sessionId);
  return sendSuccess(response, null, 'Session revoked');
});

sessionRouter.post(
  '/logout-all',
  requireTrustedOrigin,
  requireAuthentication,
  async (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const actor = response.locals.actor as CustomerActor;
    await revokeAllSessions(actor.id);
    clearRefreshCookie(response);
    return sendSuccess(response, null, 'All sessions logged out');
  },
);

sessionRouter.post(
  '/change-password',
  requireTrustedOrigin,
  limit,
  requireAuthentication,
  async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const input = parse(changePasswordSchema, request.body);
    const actor = response.locals.actor as CustomerActor;
    await changePassword(actor.id, input);
    clearRefreshCookie(response);
    return sendSuccess(response, null, 'Password changed; log in again');
  },
);

sessionRouter.get('/me', requireAuthentication, (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  return sendSuccess(response, currentUser(response.locals.actor as CustomerActor), 'Current user');
});
