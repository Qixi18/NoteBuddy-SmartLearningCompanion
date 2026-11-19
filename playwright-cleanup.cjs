const fs = require('node:fs');
const path = require('node:path');

function isWithin(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function cleanupGeneratedPlaywrightData({ root, dataDir, databasePath, runId, custom = false }) {
  if (custom || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId ?? '')) {
    return { cleaned: false, reason: 'custom-or-invalid-run' };
  }
  const projectRoot = path.resolve(root);
  const dataRoot = path.join(projectRoot, 'data');
  const expectedDir = path.join(dataRoot, `playwright-${runId}`);
  const expectedDatabase = path.join(dataRoot, `playwright-${runId}.sqlite`);
  const targetDir = path.resolve(dataDir);
  const targetDatabase = path.resolve(databasePath);
  if (targetDir !== expectedDir || targetDatabase !== expectedDatabase || !isWithin(projectRoot, dataRoot)) {
    return { cleaned: false, reason: 'path-does-not-match-generated-layout' };
  }
  try {
    if (fs.lstatSync(dataRoot).isSymbolicLink()) return { cleaned: false, reason: 'data-root-is-symlink' };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const target of [targetDir, targetDatabase]) {
    try {
      if (fs.lstatSync(target).isSymbolicLink()) return { cleaned: false, reason: 'target-is-symlink' };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${targetDatabase}${suffix}`;
    try {
      const stat = fs.lstatSync(file);
      if (stat.isFile() || stat.isSymbolicLink()) fs.unlinkSync(file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return { cleaned: true };
}

module.exports = { cleanupGeneratedPlaywrightData };
