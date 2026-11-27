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

test('auto source verification runs from the overview and explains every result', async ({ page }) => {
  await gotoRoute(page, '/knowledge/overview', '课程知识');

  const panel = page.locator('section').filter({ hasText: '课程来源自动核验' }).first();
  await expect(panel.getByText('课程来源自动核验')).toBeVisible();
  await expect(panel.getByRole('button', { name: /自动核验全部指标/ })).toBeVisible();

  await panel.getByRole('button', { name: /自动核验全部指标/ }).click();

  // 批量核验结束后必须给出真实汇总，而不是只把状态改成绿色。
  await expect(panel.getByText(/本次执行：通过 \d+ · 待核验 \d+ · 跳过 \d+/)).toBeVisible({ timeout: 60_000 });
  // 证据不足时展示稳定原因码，教师据此判断是缺文件、缺文本还是内容不匹配。
  await expect(
    panel.getByText(/SOURCE_MISSING|SOURCE_UNREADABLE|TEXT_UNAVAILABLE|CURRICULUM_MISMATCH|TEXTBOOK_MISMATCH|MATERIAL_NOT_LINKED|REFERENCE_INVALID/).first(),
  ).toBeVisible();
});

test('knowledge structure tab keeps scope and shows indicator detail', async ({ page }) => {
  await gotoRoute(page, '/knowledge/overview', '课程知识');
  await page.getByRole('link', { name: '知识结构' }).first().click();
  await expect(page).toHaveURL(/#\/knowledge\/structure/);

  expect(hashSearch(page).get('node')).toBe(DEMO.nodeId);
  expect(hashSearch(page).get('class')).toBe(DEMO.classId);
  await expect(page.getByText(/主题|指标|知识/).first()).toBeVisible();
});

test('topic overview filters materials and paginates the item list', async ({ page }) => {
  await gotoRoute(page, '/knowledge/overview', '课程知识');

  const itemPanel = page.locator('section').filter({ hasText: '相关题目 / 材料列表' }).first();
  await expect(itemPanel.getByText('第 1 / 2 页 · 共 12 项')).toBeVisible();
  await itemPanel.getByRole('button', { name: '下一页' }).click();
  await expect(itemPanel.getByText('第 2 / 2 页 · 共 12 项')).toBeVisible();
  await expect(itemPanel.getByText('Q010')).toBeVisible();

  await page.getByRole('combobox', { name: '筛选主题' }).selectOption('T01');
  await expect(page.getByText('当前显示 3 项题目与材料')).toBeVisible();
  await expect(itemPanel.getByText('Q001')).toBeVisible();
  await expect(itemPanel.getByText('Q010')).toHaveCount(0);

  await page.getByRole('combobox', { name: '筛选观察指标' }).selectOption('I011');
  await expect(page.getByText('当前显示 1 项题目与材料')).toBeVisible();
  await expect(itemPanel.getByText('Q001')).toBeVisible();
  await expect(itemPanel.getByText('Q002')).toHaveCount(0);
});

test('item relations pagination keeps detail and source linked to the selected item', async ({ page }) => {
  await gotoRoute(page, '/knowledge/items', '课程知识');

  const listPanel = page.locator('section').filter({ hasText: '题目关联清单' }).first();
  await expect(listPanel.getByText('第 1 / 2 页 · 共 12 项')).toBeVisible();
  await listPanel.getByRole('button', { name: '下一页' }).click();
  await expect(listPanel.getByText('第 2 / 2 页 · 共 12 项')).toBeVisible();
  const detailPanel = page.locator('section').filter({ hasText: '当前题目详情' }).first();
  await listPanel.getByRole('button', { name: /Q010/ }).click();
  await expect(page.getByText('当前题目详情')).toBeVisible();
  await expect(detailPanel.getByRole('heading', { name: 'Q010', level: 3 })).toBeVisible();
  await expect(page.getByText('关联课程来源与材料')).toBeVisible();

  await page.getByRole('combobox', { name: '筛选观察指标' }).selectOption('I021');
  await expect(page.getByText('2 项题目与材料 · 9 项关联指标')).toBeVisible();
  await expect(listPanel.getByRole('button', { name: /Q004/ })).toBeVisible();
  await listPanel.getByRole('button', { name: /Q004/ }).click();
  await expect(detailPanel.getByRole('heading', { name: 'Q004', level: 3 })).toBeVisible();
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
