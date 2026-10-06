import type { CookieOptions, Request, RequestHandler, Response } from 'express';

import { AppError } from '../../../common/errors/app-error.js';
import { env } from '../../../config/env.js';
import { refreshSchema } from './session.schema.js';

const refreshCookieName = 'refreshToken';

export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
  };
}

// CORS alone does not prevent another origin from submitting cookie-authenticated requests.
export const requireTrustedOrigin: RequestHandler = (request, _response, next) => {
  const origin = request.get('origin');
  if (
    (origin && origin !== new URL(env.WEB_URL).origin) ||
    (!origin && request.get('sec-fetch-site') === 'cross-site')
  ) {
    throw new AppError(403, 'UNTRUSTED_ORIGIN', 'Authentication request origin is not allowed');
  }
  next();
};

export function readRefreshCookie(request: Request): string | undefined {
  const values = (request.get('cookie') ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(`${refreshCookieName}=`));
  if (values.length === 0) return undefined;
  if (values.length !== 1)
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh cookie');
  const parsed = refreshSchema.safeParse({
    refreshToken: values[0]!.slice(refreshCookieName.length + 1),
  });
  if (!parsed.success) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh cookie');
  return parsed.data.refreshToken;
}

export function setRefreshCookie<T extends { refreshToken: string; refreshExpiresIn: number }>(
  response: Response,
  result: T,
) {
  response.cookie(refreshCookieName, result.refreshToken, {
    ...refreshCookieOptions(),
    maxAge: result.refreshExpiresIn * 1000,
  });
  const { refreshToken, ...publicResult } = result;
  void refreshToken;
  return publicResult;
}

export function clearRefreshCookie(response: Response) {
  response.clearCookie(refreshCookieName, refreshCookieOptions());
}
