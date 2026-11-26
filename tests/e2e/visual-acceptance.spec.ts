import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { allRoutes, ensureDemoRun, gotoRoute } from './fixtures/demoContext';

const DESKTOP = path.resolve('artifacts/frontend-acceptance/desktop');
const MOBILE = path.resolve('artifacts/frontend-acceptance/mobile');

function slug(routePath: string): string {
  if (routePath === '/') return 'dashboard';
  return routePath.replace(/^\//, '').replace(/\//g, '-');
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
    await page.waitForTimeout(700);
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
    await page.waitForTimeout(800);
    expect(await page.locator('canvas').count(), `${route} 没有渲染图表`).toBeGreaterThan(0);
  }
});

test('mobile acceptance: nine pages stack without horizontal overflow and save screenshots', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const [index, route] of allRoutes.entries()) {
    await gotoRoute(page, route.path, route.title);
    await page.waitForTimeout(700);
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
