import { z } from 'zod';
import { emailSchema } from '../../../common/validation/email.js';

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    deviceId: z.string().trim().min(1).max(100).optional(),
    deviceName: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid refresh token format'),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

export const sessionIdSchema = z.object({ sessionId: z.uuid() });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(12).max(128),
  })
  .strict();

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
