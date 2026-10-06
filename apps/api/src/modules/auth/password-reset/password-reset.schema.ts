import { z } from 'zod';

import { emailSchema } from '../../../common/validation/email.js';

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

export const verifyResetOtpSchema = z
  .object({
    challengeId: z.uuid(),
    otp: z.string().regex(/^\d{6}$/, 'OTP must contain 6 digits'),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    resetToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid reset token format'),
    newPassword: z.string().min(12).max(128),
  })
  .strict();

export type VerifyResetOtpInput = z.infer<typeof verifyResetOtpSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
