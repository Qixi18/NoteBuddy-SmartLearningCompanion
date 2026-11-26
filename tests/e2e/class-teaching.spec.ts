import { expect, test } from '@playwright/test';
import { DEMO, ensureDemoRun, gotoRoute } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('generating a class plan produces an editable rule draft', async ({ page }) => {
  await gotoRoute(page, '/teaching/class', '班级教学建议');

  await page.getByRole('button', { name: /生成规则方案|按当前证据重新生成/ }).click();
  await expect(page.getByText(/已生成第 \d+ 版规则草稿|已存在同一版草稿/).first()).toBeVisible({ timeout: 20_000 });

  const editor = page.getByTestId('class-plan-editor').locator('textarea');
  await expect(editor).toHaveCount(7);
  expect((await editor.first().inputValue()).length).toBeGreaterThan(0);
  await page.getByLabel('审核人').fill('QA 教师');
  await page.getByLabel('审核说明').fill('已核对当前证据。');
  await expect(page.getByRole('button', { name: '采纳并保存' })).toBeEnabled();
});

test('teacher edits and accepts the class plan without losing history', async ({ page }) => {
  await gotoRoute(page, '/teaching/class', '班级教学建议');
  await page.getByRole('button', { name: /生成规则方案|按当前证据重新生成/ }).click();
  await expect(page.getByText(/已生成第 \d+ 版规则草稿|已存在同一版草稿/).first()).toBeVisible({ timeout: 20_000 });

  const firstSection = page.getByTestId('class-plan-editor').locator('textarea').first();
  await firstSection.fill('演示：先集中处理方程类共同问题，再做一次同型题重练。');
  await page.getByLabel('审核人').fill('QA 教师');
  await page.getByLabel('审核说明').fill('已核对证据并修订教学动作。');
  await expect(page.getByRole('button', { name: '采纳并保存' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '保存教师修改' })).toBeEnabled();
  await page.getByRole('button', { name: '保存教师修改' }).click();
  await expect(page.getByText(/已保存第 \d+ 版：教师修改/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: '采纳并保存' })).toBeEnabled();
  await page.getByRole('button', { name: '采纳并保存' }).click();
  await expect(page.getByText(/已保存第 \d+ 版：已采纳/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('方案版本历史')).toBeVisible();
  await expect(page.getByText(/第 \d+ 版 · 已采纳/).first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('class plan page binds the current class and node', async ({ page }) => {
  await gotoRoute(page, '/teaching/class', '班级教学建议');

  const scope = page.getByLabel('班级教学方案范围');
  await expect(scope).toBeVisible();
  await expect(scope).toContainText(DEMO.classId);
  await expect(scope).toContainText(DEMO.nodeId);
});
