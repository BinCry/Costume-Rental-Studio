import { z } from 'zod';

import { emailSchema } from '../../../common/validation/email.js';

export const requestEmailChangeSchema = z
  .object({
    newEmail: emailSchema,
    currentPassword: z.string().min(1).max(128),
  })
  .strict();

export const confirmEmailChangeSchema = z
  .object({
    challengeId: z.uuid(),
    otp: z.string().regex(/^\d{6}$/, 'OTP must contain 6 digits'),
  })
  .strict();

export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>;
