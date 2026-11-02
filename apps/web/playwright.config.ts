import { defineConfig, devices } from '@playwright/test';

const e2eBaseUrl = process.env.E2E_BASE_URL?.trim();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: e2eBaseUrl ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'msedge' } }],
  ...(e2eBaseUrl ? {} : {
    webServer: {
      command: 'pnpm dev --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_URL: 'http://127.0.0.1:4173',
      },
    },
  }),
});
