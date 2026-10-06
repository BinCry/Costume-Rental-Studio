import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { z } from 'zod';

import { AppError } from '../../../common/errors/app-error.js';
import { sendError, sendSuccess } from '../../../common/http/response.js';
import { clearRefreshCookie, requireTrustedOrigin } from '../session/session.cookie.js';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyResetOtpSchema,
} from './password-reset.schema.js';
import {
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetOtp,
} from './password-reset.service.js';

export const passwordResetRouter = Router();

const passwordResetRateLimit = rateLimit({
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
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid password recovery information', {
      fields: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

passwordResetRouter.post(
  '/forgot-password',
  requireTrustedOrigin,
  passwordResetRateLimit,
  async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const input = parse(forgotPasswordSchema, request.body);
    return sendSuccess(
      response,
      await requestPasswordReset(input.email),
      'If the account is eligible, a verification code has been sent',
      202,
    );
  },
);

passwordResetRouter.post(
  '/verify-reset-otp',
  requireTrustedOrigin,
  passwordResetRateLimit,
  async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const input = parse(verifyResetOtpSchema, request.body);
    return sendSuccess(response, await verifyPasswordResetOtp(input), 'Verification code accepted');
  },
);

passwordResetRouter.post(
  '/reset-password',
  requireTrustedOrigin,
  passwordResetRateLimit,
  async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const input = parse(resetPasswordSchema, request.body);
    await resetPassword(input);
    clearRefreshCookie(response);
    return sendSuccess(response, null, 'Password reset successfully');
  },
);
