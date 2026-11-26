import { expect, test } from '@playwright/test';
import { allRoutes, DEMO, ensureDemoRun, gotoRoute, hashSearch } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('nine routes open directly with the current analysis scope', async ({ page }) => {
  for (const route of allRoutes) {
    await gotoRoute(page, route.path, route.title);
    const params = hashSearch(page);
    expect(params.get('node')).toBe(DEMO.nodeId);
    expect(params.get('class')).toBe(DEMO.classId);
  }
});

test('refreshing keeps the scope and the current run', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/class', '班级诊断');
  await page.reload();
  await page.getByRole('heading', { level: 1, name: '班级诊断' }).waitFor();
  const params = hashSearch(page);
  expect(params.get('node')).toBe(DEMO.nodeId);
  expect(params.get('class')).toBe(DEMO.classId);
  await expect(page.getByText('数据已同步')).toBeVisible();
});

test('switching class clears the student scope and updates the URL', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/student', '学生个人诊断');
  await page.getByLabel('班级').selectOption(DEMO.otherClassId);
  await expect.poll(() => hashSearch(page).get('class')).toBe(DEMO.otherClassId);
  expect(hashSearch(page).get('student')).toBeNull();
});

test('switching the quiz node keeps class scope and updates the URL', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/class', '班级诊断');
  await page.getByLabel('测验节点').selectOption(DEMO.otherNodeId);
  await expect.poll(() => hashSearch(page).get('node')).toBe(DEMO.otherNodeId);
  expect(hashSearch(page).get('class')).toBe(DEMO.classId);
});

test('browser back and forward preserve the page scope', async ({ page }) => {
  await gotoRoute(page, '/knowledge/overview', '课程知识');
  await page.getByRole('link', { name: '题目关联' }).first().click();
  await expect(page).toHaveURL(/#\/knowledge\/items/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/knowledge\/overview/);
  await page.goForward();
  await expect(page).toHaveURL(/#\/knowledge\/items/);
  expect(hashSearch(page).get('node')).toBe(DEMO.nodeId);
});
