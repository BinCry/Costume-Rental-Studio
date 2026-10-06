import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../../../common/errors/app-error.js';
import { env } from '../../../config/env.js';
import { accessSecret } from '../token.service.js';

const flowCookieName = 'googleOAuthFlow';
const flowLifetimeMs = 10 * 60 * 1000;
const flowSchema = z
  .object({
    state: z.string().min(32).max(128),
    nonce: z.string().min(32).max(128),
    codeVerifier: z.string().min(43).max(128),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export type GoogleOAuthFlow = z.infer<typeof flowSchema>;

function flowCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth/google/callback',
  };
}

function signature(payload: string) {
  return createHmac('sha256', accessSecret())
    .update(`google-oauth-flow:${payload}`)
    .digest('base64url');
}

function invalidFlow() {
  return new AppError(400, 'INVALID_GOOGLE_OAUTH_FLOW', 'Google login flow is invalid or expired');
}

export function setGoogleOAuthFlowCookie(
  response: Response,
  flow: Omit<GoogleOAuthFlow, 'expiresAt'>,
) {
  const payload = Buffer.from(
    JSON.stringify({ ...flow, expiresAt: Date.now() + flowLifetimeMs }),
  ).toString('base64url');
  response.cookie(flowCookieName, `${payload}.${signature(payload)}`, {
    ...flowCookieOptions(),
    maxAge: flowLifetimeMs,
  });
}

export function readGoogleOAuthFlowCookie(request: Request): GoogleOAuthFlow {
  const values = (request.get('cookie') ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(`${flowCookieName}=`));
  if (values.length !== 1) throw invalidFlow();

  let value: string;
  try {
    value = decodeURIComponent(values[0]!.slice(flowCookieName.length + 1));
  } catch {
    throw invalidFlow();
  }
  const parts = value.split('.');
  if (parts.length !== 2) throw invalidFlow();
  const [payload, actualSignature] = parts as [string, string];
  const expectedSignature = signature(payload);
  const actual = Buffer.from(actualSignature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalidFlow();

  try {
    const parsed = flowSchema.parse(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown,
    );
    if (parsed.expiresAt <= Date.now()) throw invalidFlow();
    return parsed;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalidFlow();
  }
}

export function clearGoogleOAuthFlowCookie(response: Response) {
  response.clearCookie(flowCookieName, flowCookieOptions());
}
