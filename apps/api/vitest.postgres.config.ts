import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/*-postgres-concurrency.test.ts'],
    env: {
      NODE_ENV: 'test',
      PORT: '4000',
      WEB_URL: 'http://localhost:3000',
      LOG_LEVEL: 'silent',
      RUN_DATABASE_TESTS: '1',
    },
  },
});
