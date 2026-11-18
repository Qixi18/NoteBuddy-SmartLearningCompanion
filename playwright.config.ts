import { defineConfig, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const backendPort = Number(process.env.PLAYWRIGHT_BACKEND_PORT ?? 8876);
const frontendPort = Number(process.env.PLAYWRIGHT_FRONTEND_PORT ?? 5174);
const runId = process.env.PLAYWRIGHT_RUN_ID ?? randomUUID();
process.env.PLAYWRIGHT_RUN_ID = runId;
const databasePath = process.env.PLAYWRIGHT_DATABASE_PATH ?? `data/playwright-${runId}.sqlite`;
const dataPath = process.env.PLAYWRIGHT_DATA_PATH ?? `data/playwright-${runId}`;
mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
mkdirSync(path.resolve(dataPath), { recursive: true });

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `python -m app.cli db-upgrade --database-url sqlite:///${databasePath.replaceAll('\\', '/')} && python -m app.main`,
      cwd: 'apps/backend',
      url: `http://127.0.0.1:${backendPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PLAYWRIGHT_RUN_ID: runId,
        PLAYWRIGHT_DATABASE_PATH: databasePath,
        PLAYWRIGHT_DATA_PATH: dataPath,
        SMART_LEARNING_HOST: '127.0.0.1',
        SMART_LEARNING_PORT: String(backendPort),
        SMART_LEARNING_DATA_DIR: dataPath,
        SMART_LEARNING_DATABASE_URL: `sqlite:///${databasePath.replaceAll('\\', '/')}`,
        MODEL_PROVIDER: 'deepseek',
        MODEL_API_KEY: '',
      },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      cwd: 'apps/web',
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { SMART_LEARNING_API_TARGET: `http://127.0.0.1:${backendPort}` },
    },
  ],
});
