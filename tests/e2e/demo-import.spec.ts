import { expect, test } from '@playwright/test';
import { demoCsvPayloads, ensureDemoRun } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('imports the six demo CSVs and keeps the run after refresh', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { level: 1 }).waitFor();
  const input = page.locator('input[type=file]').first();
  await input.setInputFiles(demoCsvPayloads());

  await expect(page.getByText(/导入完成，新运行/)).toBeVisible({ timeout: 30_000 });
  const runText = await page.getByText(/当前运行：/).innerText();
  expect(runText).toMatch(/当前运行：\w{8,}/);

  await page.reload();
  await expect(page.getByText('数据已同步')).toBeVisible();
  await expect(page.getByText(/当前运行：/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('importing rejects unsupported files with a visible error', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { level: 1 }).waitFor();
  const input = page.locator('input[type=file]').first();
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a data file') });
  await expect(page.getByText(/不支持的文件类型/)).toBeVisible();
});
