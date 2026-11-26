import { expect, test } from '@playwright/test';
import { DEMO, ensureDemoRun, gotoRoute, hashSearch } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('student diagnosis shows evidence summary, scores and claims', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/student', '学生个人诊断');

  await expect(page.getByText('本次作答表现')).toBeVisible();
  await expect(page.getByText('学生画像与诊断结论')).toBeVisible();
  await expect(page.getByText('典型作答证据')).toBeVisible();
  await expect(page.getByText('评分点本次表现')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('switching student updates the URL and keeps the class', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/student', '学生个人诊断');

  await page.getByLabel('学生', { exact: true }).selectOption('D02');
  await expect.poll(() => hashSearch(page).get('student')).toBe('D02');
  expect(hashSearch(page).get('class')).toBe(DEMO.classId);
  await expect(page.getByRole('heading', { level: 1, name: '学生个人诊断' })).toBeVisible();
});
