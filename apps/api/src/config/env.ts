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

const optionalPositiveInteger = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().positive().optional(),
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
    S3_ENDPOINT: optionalUrl,
    S3_PUBLIC_ENDPOINT: optionalUrl,
    S3_REGION: optionalString,
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: optionalBoolean.default(true),
    S3_PRESIGN_TTL_SECONDS: optionalPositiveInteger.default(300),
    MEDIA_MAX_UPLOAD_BYTES: optionalPositiveInteger.default(10 * 1024 * 1024),
    MEDIA_MAX_MODEL_IMAGES: optionalPositiveInteger.default(10),
    MEDIA_MAX_VARIANT_IMAGES: optionalPositiveInteger.default(5),
    MEDIA_MAX_IMAGE_DIMENSION: optionalPositiveInteger.default(8_000),
    MEDIA_MAX_IMAGE_PIXELS: optionalPositiveInteger.default(40_000_000),
    MEDIA_DELETE_WORKER_INTERVAL_SECONDS: optionalPositiveInteger.default(10),
    MEDIA_DELETE_MAX_RETRIES: optionalPositiveInteger.default(10),
    MEDIA_OUTBOX_RETENTION_DAYS: optionalPositiveInteger.default(30),
    MEDIA_ORPHAN_RETENTION_HOURS: optionalPositiveInteger.default(24),
    MEDIA_ORPHAN_CLEANUP_INTERVAL_SECONDS: optionalPositiveInteger.default(60 * 60),
    MEDIA_PUBLIC_BASE_URL: optionalUrl,
  })
  .superRefine((value, context) => {
    if (value.OTP_DELIVERY_MODE === 'smtp') {
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
    }

    const storageKeys = [
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ] as const;
    const configuredStorageKeys = storageKeys.filter((key) => value[key] !== undefined);
    if (configuredStorageKeys.length > 0 && configuredStorageKeys.length !== storageKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['S3_ENDPOINT'],
        message:
          'S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY must be set together',
      });
    }
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment configuration:', z.prettifyError(result.error));
  throw new Error('Invalid environment configuration');
}

export const env = result.data;
