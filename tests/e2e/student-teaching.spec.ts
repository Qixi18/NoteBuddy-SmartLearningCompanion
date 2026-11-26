import { expect, test } from '@playwright/test';
import { ensureDemoRun, gotoRoute } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('student teaching page shows the rule draft with evidence', async ({ page }) => {
  await gotoRoute(page, '/teaching/student', '学生个性化学习建议');

  await expect(page.getByText('学习建议草稿')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('证据与资源')).toBeVisible();
  await expect(page.getByText('诊断依据')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('teacher can reject a draft and the decision is persisted', async ({ page }) => {
  await gotoRoute(page, '/teaching/student', '学生个性化学习建议');
  await expect(page.getByText('学习建议草稿')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: '拒绝草稿' }).click();
  await expect(page.getByText('复核结果已保存')).toBeVisible();

  await page.reload();
  await page.getByRole('heading', { level: 1, name: '学生个性化学习建议' }).waitFor();
  await expect(page.getByText(/当前最新复核状态为「rejected」/).first()).toBeVisible();
});
