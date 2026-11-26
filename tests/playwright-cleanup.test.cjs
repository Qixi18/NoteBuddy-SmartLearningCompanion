const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { cleanupGeneratedPlaywrightData } = require('../playwright-cleanup.cjs');

test('removes only the matching generated UUID data directory, database, and sidecars', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runId = 'b32dc04a-7bf4-4fd9-9701-0b08228bea56';
  const dataRoot = path.join(root, 'data');
  const dataDir = path.join(dataRoot, `playwright-${runId}`);
  const databasePath = path.join(dataRoot, `playwright-${runId}.sqlite`);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'bundle.csv'), 'synthetic');
  fs.writeFileSync(databasePath, 'synthetic database');
  fs.writeFileSync(`${databasePath}-wal`, 'synthetic sidecar');
  fs.writeFileSync(`${databasePath}-shm`, 'synthetic sidecar');
  const unrelated = path.join(dataRoot, 'smart_learning.db');
  fs.writeFileSync(unrelated, 'keep');

  const result = cleanupGeneratedPlaywrightData({ root, dataDir, databasePath, runId });

  assert.equal(result.cleaned, true);
  assert.equal(fs.existsSync(dataDir), false);
  assert.equal(fs.existsSync(databasePath), false);
  assert.equal(fs.existsSync(`${databasePath}-wal`), false);
  assert.equal(fs.existsSync(`${databasePath}-shm`), false);
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'keep');
});

test('refuses custom paths, mismatched UUIDs, and symlink targets', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runId = 'b32dc04a-7bf4-4fd9-9701-0b08228bea56';
  const dataRoot = path.join(root, 'data');
  const dataDir = path.join(dataRoot, `playwright-${runId}`);
  const databasePath = path.join(dataRoot, `playwright-${runId}.sqlite`);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(databasePath, 'keep');

  assert.equal(cleanupGeneratedPlaywrightData({ root, dataDir, databasePath, runId, custom: true }).cleaned, false);
  assert.equal(cleanupGeneratedPlaywrightData({ root, dataDir, databasePath, runId: 'other' }).cleaned, false);
  assert.equal(fs.existsSync(dataDir), true);
  assert.equal(fs.existsSync(databasePath), true);
});

test('refuses a generated-looking symlink without touching its external target', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runId = 'b32dc04a-7bf4-4fd9-9701-0b08228bea56';
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(dataRoot);
  const dataDir = path.join(dataRoot, `playwright-${runId}`);
  const databasePath = path.join(dataRoot, `playwright-${runId}.sqlite`);
  const external = path.join(root, 'valuable.db');
  fs.writeFileSync(external, 'keep external data');
  fs.mkdirSync(dataDir);
  fs.writeFileSync(databasePath, 'link placeholder');
  const originalLstatSync = fs.lstatSync;
  let inspectedSymlink = false;
  fs.lstatSync = function(target, ...args) {
    if (path.resolve(String(target)) === databasePath) {
      inspectedSymlink = true;
      return { isSymbolicLink: () => true };
    }
    return originalLstatSync.call(this, target, ...args);
  };
  let result;
  try {
    result = cleanupGeneratedPlaywrightData({ root, dataDir, databasePath, runId });
  } finally {
    fs.lstatSync = originalLstatSync;
  }

  assert.equal(result.cleaned, false);
  assert.equal(result.reason, 'target-is-symlink');
  assert.equal(inspectedSymlink, true);
  assert.equal(fs.existsSync(dataDir), true);
  assert.equal(fs.readFileSync(databasePath, 'utf8'), 'link placeholder');
  assert.equal(fs.readFileSync(external, 'utf8'), 'keep external data');
});
