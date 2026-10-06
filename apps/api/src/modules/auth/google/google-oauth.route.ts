import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';

import { AppError } from '../../../common/errors/app-error.js';
import { sendError } from '../../../common/http/response.js';
import { env } from '../../../config/env.js';
import { requireTrustedOrigin, setRefreshCookie } from '../session/session.cookie.js';
import {
  clearGoogleOAuthFlowCookie,
  readGoogleOAuthFlowCookie,
  setGoogleOAuthFlowCookie,
} from './google-oauth.cookie.js';
import { googleCallbackSchema } from './google-oauth.schema.js';
import { completeGoogleAuthorization, createGoogleAuthorization } from './google-oauth.service.js';

export const googleOAuthRouter = Router();
const limit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (request, response) =>
    sendError(request, response, 429, 'AUTH_RATE_LIMITED', 'Too many authentication attempts'),
});

function requestMetadata(request: Request) {
  return {
    userAgent: request.get('user-agent')?.slice(0, 500),
    ip: request.ip?.slice(0, 45),
  };
}

function frontendResultUrl(status: 'success' | 'error', errorCode?: string) {
  const url = new URL('/auth/google/callback', env.WEB_URL);
  url.searchParams.set('status', status);
  if (errorCode) url.searchParams.set('error', errorCode);
  return url.toString();
}

googleOAuthRouter.get('/google', requireTrustedOrigin, limit, (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const { authorizationUrl, flow } = createGoogleAuthorization();
  setGoogleOAuthFlowCookie(response, flow);
  return response.redirect(302, authorizationUrl);
});

googleOAuthRouter.get('/google/callback', limit, async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  try {
    const parsed = googleCallbackSchema.safeParse(request.query);
    if (!parsed.success || !parsed.data.state) {
      throw new AppError(
        400,
        'INVALID_GOOGLE_OAUTH_CALLBACK',
        'Google authentication was not completed',
      );
    }
    const flow = readGoogleOAuthFlowCookie(request);
    if (parsed.data.state !== flow.state) {
      throw new AppError(
        400,
        'INVALID_GOOGLE_OAUTH_FLOW',
        'Google login flow is invalid or expired',
      );
    }
    if (parsed.data.error || !parsed.data.code) {
      throw new AppError(
        400,
        parsed.data.error === 'access_denied'
          ? 'GOOGLE_AUTH_CANCELLED'
          : 'INVALID_GOOGLE_OAUTH_CALLBACK',
        'Google authentication was not completed',
      );
    }
    const result = await completeGoogleAuthorization(
      parsed.data.code,
      parsed.data.state,
      flow,
      requestMetadata(request),
    );
    clearGoogleOAuthFlowCookie(response);
    setRefreshCookie(response, result);
    return response.redirect(303, frontendResultUrl('success'));
  } catch (error) {
    clearGoogleOAuthFlowCookie(response);
    if (!(error instanceof AppError)) {
      request.log.error(
        { err: error, event: 'google_oauth_callback_failed' },
        'Google login failed',
      );
    }
    const code = error instanceof AppError ? error.code : 'GOOGLE_AUTH_FAILED';
    return response.redirect(303, frontendResultUrl('error', code));
  }
});
