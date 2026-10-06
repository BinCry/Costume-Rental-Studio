import { z } from 'zod';
import { emailSchema } from '../../../common/validation/email.js';
import { phoneSchema } from '../../../common/validation/phone.js';

export const requestRegistrationOtpSchema = z.object({ email: emailSchema }).strict();

export const registerCustomerSchema = z
  .object({
    email: emailSchema,
    phone: phoneSchema.optional(),
    challengeId: z.uuid(),
    otp: z.string().regex(/^\d{6}$/, 'OTP must contain 6 digits'),
    displayName: z.string().trim().min(1).max(255),
    password: z.string().min(12).max(128),
    preferredBranchId: z.uuid().optional(),
    deviceId: z.string().trim().min(1).max(100).optional(),
    deviceName: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;
