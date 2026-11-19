const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { cleanupGeneratedPlaywrightData } = require('./playwright-cleanup.cjs');

const root = __dirname;
const cleanupTests = spawnSync(process.execPath, ['--test', 'tests/playwright-cleanup.test.cjs'], {
  cwd: root,
  stdio: 'inherit',
});
if (cleanupTests.status !== 0) process.exit(cleanupTests.status ?? 2);
const env = { ...process.env };
const generatedRunId = !env.PLAYWRIGHT_RUN_ID;
const customPaths = Boolean(env.PLAYWRIGHT_DATABASE_PATH || env.PLAYWRIGHT_DATA_PATH);
const runId = env.PLAYWRIGHT_RUN_ID || randomUUID();
env.PLAYWRIGHT_RUN_ID = runId;
const dataDir = path.resolve(root, env.PLAYWRIGHT_DATA_PATH || `data/playwright-${runId}`);
const databasePath = path.resolve(root, env.PLAYWRIGHT_DATABASE_PATH || `data/playwright-${runId}.sqlite`);
const cleanupEligible = generatedRunId && !customPaths
  && !require('node:fs').existsSync(dataDir)
  && !require('node:fs').existsSync(databasePath);
if (cleanupEligible) {
  env.PLAYWRIGHT_DATA_PATH = dataDir;
  env.PLAYWRIGHT_DATABASE_PATH = databasePath;
}

let runResult;
let cleanupError;
try {
  runResult = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
} finally {
  if (cleanupEligible) {
    try {
      const cleanup = cleanupGeneratedPlaywrightData({ root, dataDir, databasePath, runId });
      if (cleanup.cleaned) process.stdout.write('Removed this run’s isolated Playwright database and fixture directory.\n');
      else process.stderr.write(`Playwright temporary cleanup skipped: ${cleanup.reason}\n`);
    } catch (error) {
      cleanupError = error;
      process.stderr.write(`Playwright temporary cleanup failed (${error.code || error.name}).\n`);
    }
  }
}

if (cleanupError) process.exitCode = 2;
else if (runResult.error) {
  process.stderr.write(`Unable to run Playwright (${runResult.error.code || runResult.error.name}).\n`);
  process.exitCode = 2;
} else process.exitCode = runResult.status ?? 2;
