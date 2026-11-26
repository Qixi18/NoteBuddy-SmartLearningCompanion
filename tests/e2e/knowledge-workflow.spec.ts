import { expect, test } from '@playwright/test';
import { DEMO, ensureDemoRun, gotoRoute, hashSearch } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('topic overview lists real topics, indicators and source status', async ({ page }) => {
  await gotoRoute(page, '/knowledge/overview', '课程知识');

  await expect(page.getByText('主题学习要求与资源映射')).toBeVisible();
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByText('主题重点提示')).toBeVisible();
  await expect(page.getByText('教师来源核验').first()).toBeVisible();
});

test('knowledge structure tab keeps scope and shows indicator detail', async ({ page }) => {
  await gotoRoute(page, '/knowledge/overview', '课程知识');
  await page.getByRole('link', { name: '知识结构' }).first().click();
  await expect(page).toHaveURL(/#\/knowledge\/structure/);

  expect(hashSearch(page).get('node')).toBe(DEMO.nodeId);
  expect(hashSearch(page).get('class')).toBe(DEMO.classId);
  await expect(page.getByText(/主题|指标|知识/).first()).toBeVisible();
});

test('item relations search and detail keep the item scope', async ({ page }) => {
  await gotoRoute(page, '/knowledge/items', '课程知识');

  await expect(page.getByText(/题目关联清单（\d+）/)).toBeVisible();
  const search = page.getByPlaceholder('输入题目编号、题干或指标');
  await search.fill('Q001');
  await expect(page.getByRole('button', { name: /Q001/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /Q001/ }).first().click();

  await expect(page.getByText('当前题目详情')).toBeVisible();
  await expect(page.getByText('题目内容')).toBeVisible();
  await expect(page.getByRole('heading', { name: '评分点' })).toBeVisible();
  await expect(page.getByRole('link', { name: /查看该题证据/ })).toBeVisible();
});
