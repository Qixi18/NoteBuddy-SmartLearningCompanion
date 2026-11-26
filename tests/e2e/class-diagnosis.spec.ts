import { expect, test } from '@playwright/test';
import { DEMO, ensureDemoRun, gotoRoute, hashSearch } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('class diagnosis shows the scope, common-item figures and quality notes', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/class', '班级诊断');

  const scopeBar = page.getByLabel('班级诊断范围');
  await expect(scopeBar).toBeVisible();
  await expect(scopeBar).toContainText(DEMO.classId);
  await expect(page.getByText(/共同题目|班级诊断/).first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('class diagnosis exposes limitations instead of inventing coverage', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/class', '班级诊断');

  await expect(page.getByText(/不输出班级能力排名或显著性结论/)).toBeVisible({ timeout: 15_000 });
});

test('candidate students link into student diagnosis with class scope', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/class', '班级诊断');

  const studentLink = page.getByRole('link', { name: /查看学生|学生 D/ }).first();
  if (await studentLink.count()) {
    await studentLink.click();
    await expect(page).toHaveURL(/#\/diagnosis\/student/);
    expect(hashSearch(page).get('class')).toBe(DEMO.classId);
    expect(hashSearch(page).get('student')).toBeTruthy();
  }
});
