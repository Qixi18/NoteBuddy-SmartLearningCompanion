import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { allRoutes, ensureDemoRun, gotoRoute } from './fixtures/demoContext';

const DESKTOP = path.resolve('artifacts/frontend-acceptance/desktop');
const MOBILE = path.resolve('artifacts/frontend-acceptance/mobile');
const PAGE_READY_HEADINGS: Record<string, string | RegExp> = {
  '/': '当前运行整体数据质量',
  '/knowledge/overview': '主题学习要求与资源映射',
  '/knowledge/structure': '知识结构图',
  '/knowledge/items': /题目关联清单/,
  '/diagnosis/class': '共同题目指标比较',
  '/diagnosis/student': '本次作答表现',
  '/diagnosis/evidence': '题目信息',
  '/teaching/student': '学习建议草稿',
  '/teaching/class': '班级教学分析报告',
};

function slug(routePath: string): string {
  if (routePath === '/') return 'dashboard';
  return routePath.replace(/^\//, '').replace(/\//g, '-');
}

async function waitForPageReady(page: import('@playwright/test').Page, route: string): Promise<void> {
  await expect(page.getByRole('heading', { name: PAGE_READY_HEADINGS[route] })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('status', { name: '正在打开页面…' })).toHaveCount(0);
  await expect(page.getByText(/^(?:正在读取|读取.+…|正在汇总|正在分析|正在核对|正在生成|正在请求模型)/)).toHaveCount(0);
  await expect(page.getByText('证据包读取中')).toHaveCount(0);
}

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
  mkdirSync(DESKTOP, { recursive: true });
  mkdirSync(MOBILE, { recursive: true });
});

test('desktop acceptance: nine pages render with real data and saved screenshots', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const [index, route] of allRoutes.entries()) {
    await gotoRoute(page, route.path, route.title);
    await waitForPageReady(page, route.path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({
      path: path.join(DESKTOP, `${String(index + 1).padStart(2, '0')}-${slug(route.path)}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test('desktop acceptance: charts render as real canvas on data pages', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const route of ['/', '/diagnosis/class']) {
    const definition = allRoutes.find(item => item.path === route)!;
    await gotoRoute(page, route, definition.title);
    await waitForPageReady(page, route);
    await expect(page.locator('canvas').first(), `${route} 没有渲染图表`).toBeVisible();
  }
});

test('mobile acceptance: nine pages stack without horizontal overflow and save screenshots', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const [index, route] of allRoutes.entries()) {
    await gotoRoute(page, route.path, route.title);
    await waitForPageReady(page, route.path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${route.path} 在手机视口横向溢出`).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: path.join(MOBILE, `${String(index + 1).padStart(2, '0')}-${slug(route.path)}.png`),
      fullPage: true,
    });
  }
});
