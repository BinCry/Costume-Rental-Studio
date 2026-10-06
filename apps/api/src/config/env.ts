import 'dotenv/config';

import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

const optionalPort = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().min(1).max(65_535).optional(),
);

const optionalBoolean = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
);

const optionalEmail = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().email().optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().min(1).max(65_535),
    WEB_URL: z.string().url(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_ACCESS_SECRET: z.string().min(32).optional(),
    JWT_ISSUER: z.string().min(1).default('costume-api'),
    JWT_AUDIENCE: z.string().min(1).default('costume-web'),
    OTP_HASH_SECRET: z.string().min(32).optional(),
    OTP_DELIVERY_MODE: z.enum(['disabled', 'console', 'smtp']).default('disabled'),
    SMTP_HOST: optionalString,
    SMTP_PORT: optionalPort,
    SMTP_SECURE: optionalBoolean,
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    MAIL_FROM_NAME: optionalString,
    MAIL_FROM_ADDRESS: optionalEmail,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GOOGLE_REDIRECT_URI: optionalUrl,
  })
  .superRefine((value, context) => {
    if (value.OTP_DELIVERY_MODE !== 'smtp') return;
    const required = [
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_SECURE',
      'SMTP_USER',
      'SMTP_PASSWORD',
      'MAIL_FROM_NAME',
      'MAIL_FROM_ADDRESS',
    ] as const;
    for (const key of required) {
      if (value[key] === undefined) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when OTP_DELIVERY_MODE=smtp`,
        });
      }
    }
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment configuration:', z.prettifyError(result.error));
  throw new Error('Invalid environment configuration');
}

export const env = result.data;
