import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import type { z } from 'zod';

import { AppError } from '../../../common/errors/app-error.js';
import { sendError, sendSuccess } from '../../../common/http/response.js';
import { registerCustomerSchema, requestRegistrationOtpSchema } from './registration.schema.js';
import { registerCustomer, requestRegistrationOtp } from './registration.service.js';
import { requireTrustedOrigin, setRefreshCookie } from '../session/session.cookie.js';

export const registrationRouter = Router();

const registrationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (request, response) =>
    sendError(request, response, 429, 'AUTH_RATE_LIMITED', 'Too many authentication attempts'),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid registration information', {
      fields: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  return parsed.data;
}

function requestMetadata(request: Request, input?: { deviceId?: string; deviceName?: string }) {
  return {
    deviceId: input?.deviceId,
    deviceName: input?.deviceName,
    userAgent: request.get('user-agent')?.slice(0, 500),
    ip: request.ip?.slice(0, 45),
  };
}

registrationRouter.post(
  '/register/otp',
  requireTrustedOrigin,
  registrationRateLimit,
  async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const input = parse(requestRegistrationOtpSchema, request.body);
    return sendSuccess(
      response,
      await requestRegistrationOtp(input.email),
      'Verification code requested',
      202,
    );
  },
);

registrationRouter.post(
  '/register',
  requireTrustedOrigin,
  registrationRateLimit,
  async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const input = parse(registerCustomerSchema, request.body);
    const result = await registerCustomer(input, requestMetadata(request, input));
    return sendSuccess(
      response,
      setRefreshCookie(response, result),
      result.created ? 'Customer registered' : 'Customer account linked',
      result.created ? 201 : 200,
    );
  },
);
