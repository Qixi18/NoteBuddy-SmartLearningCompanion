import { expect, test } from '@playwright/test';
import { DEMO, ensureDemoRun, gotoRoute } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('node selector orders valid dates rather than API array order', async ({ page }) => {
  await page.route('**/api/run', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.nodes.reverse();
    await route.fulfill({ response, json: body });
  });

  await gotoRoute(page, '/', '教学工作台');

  await expect(page.getByLabel('测验节点').locator('option').nth(0)).toHaveAttribute('value', DEMO.nodeId);
  await expect(page.getByLabel('测验节点').locator('option').nth(1)).toHaveAttribute('value', DEMO.otherNodeId);
});

test('missing or tied node dates are visibly unresolved', async ({ page }) => {
  await page.route('**/api/run', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const first = body.nodes.find((node: Record<string, unknown>) => node['节点编号'] === DEMO.nodeId);
    const second = body.nodes.find((node: Record<string, unknown>) => node['节点编号'] === DEMO.otherNodeId);
    first['模拟测验日期'] = '2026-09-18';
    second['模拟测验日期'] = '2026-09-18';
    await route.fulfill({ response, json: body });
  });

  await gotoRoute(page, '/', '教学工作台');

  await expect(page.getByText('测验日期缺失或重复，相关节点的先后关系待确认')).toBeVisible();
  await expect(page.getByRole('option', { name: /日期待确认/ })).toHaveCount(2);
});
