import { defineConfig, devices } from '@playwright/test';

const e2eFull = Boolean(process.env.E2E_FULL);
const externalBase = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Full-stack specs share one database and fixture hospital: a broadcast in one reaches the other's donor.
  workers: e2eFull ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: e2eFull ? 180_000 : 60_000,
  use: {
    baseURL: externalBase || (e2eFull ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:4173'),
    trace: 'on-first-retry',
    // A stuck click should fail at that step, not silently consume the whole test timeout.
    actionTimeout: 20_000,
  },
  projects: e2eFull
    ? [
        { name: 'full-loop', use: { ...devices['Desktop Chrome'] }, testMatch: /(full-loop|fresh-donor)\.spec\.js/ },
      ]
    : [
        { name: 'mobile', use: { ...devices['iPhone 13'] }, testIgnore: /(full-loop|fresh-donor)\.spec\.js/ },
        { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /(full-loop|fresh-donor)\.spec\.js/ },
      ],
  webServer: externalBase
    ? undefined
    : e2eFull
      ? [
          {
            command: 'node src/server.js',
            cwd: '../backend',
            url: 'http://127.0.0.1:3001/api/health',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
              ...process.env,
              NODE_ENV: 'test',
              PORT: '3001',
              DATABASE_URL: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL,
              JWT_SECRET: process.env.JWT_SECRET || 'ci-e2e-jwt-secret-not-for-production',
              FRONTEND_ORIGINS: process.env.FRONTEND_ORIGINS
                || 'http://127.0.0.1:5173,http://localhost:5173',
            },
          },
          {
            command: 'npm run dev -- --host 127.0.0.1 --port 5173',
            url: 'http://127.0.0.1:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ]
      : {
          command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
          url: 'http://127.0.0.1:4173',
          reuseExistingServer: !process.env.CI,
        },
});
