import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    env: {
      NODE_ENV: 'test',
      PORT: '4000',
      WEB_URL: 'http://localhost:3000',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/costume_rental_test',
      PAYOS_CLIENT_ID: 'test-client-id',
      PAYOS_API_KEY: 'test-api-key',
      PAYOS_CHECKSUM_KEY: 'test-checksum-key',
      PAYOS_ORDER_CODE_PREFIX: '999',
      PAYOS_RETURN_URL: 'http://localhost:3000/payments/success',
      PAYOS_CANCEL_URL: 'http://localhost:3000/payments/cancel',
      AI_SERVICE_URL: 'http://localhost:8001',
      AI_SERVICE_TIMEOUT_MS: '30000',
      AI_INTERNAL_API_KEY: 'test-ai-internal-key-at-least-32-characters',
    },
  },
});
