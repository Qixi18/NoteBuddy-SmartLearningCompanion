import { expect, test } from '@playwright/test';
import { ensureDemoRun, gotoRoute, hashSearch } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('evidence detail is reachable from student diagnosis and keeps scope', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/student', '学生个人诊断');
  const before = hashSearch(page);

  await page.getByRole('link', { name: /查看完整证据/ }).first().click();
  await expect(page).toHaveURL(/#\/diagnosis\/evidence/);
  await expect(page.getByRole('heading', { level: 1, name: '题目证据详情' })).toBeVisible();

  const after = hashSearch(page);
  expect(after.get('node')).toBe(before.get('node'));
  expect(after.get('student')).toBe(before.get('student'));
  expect(after.get('indicator')).toBe(before.get('indicator'));
});

test('evidence detail shows the original item, response and rubric evidence', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/evidence', '题目证据详情');

  await expect(page.getByText(/题目|题干|证据|作答/).first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('going back from evidence returns to student diagnosis with scope', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/student', '学生个人诊断');
  const before = page.url();
  await page.getByRole('link', { name: /查看完整证据/ }).first().click();
  await expect(page).toHaveURL(/\/diagnosis\/evidence/);
  await page.goBack();
  await expect(page).toHaveURL(before);
});
