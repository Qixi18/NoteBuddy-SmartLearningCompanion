import { expect, test } from '@playwright/test';
import { allRoutes, ensureDemoRun, gotoRoute } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

test('nine routes never cause page-level horizontal overflow', async ({ page }) => {
  test.setTimeout(240_000);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const route of allRoutes) {
      await gotoRoute(page, route.path, route.title);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${route.path} 在 ${viewport.width}px 下横向溢出 ${overflow}px`).toBeLessThanOrEqual(1);
    }
  }
});

test('mobile first screen keeps a title, a description and an action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoRoute(page, '/', '教学工作台');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const description = page.locator('header ~ *, main p').first();
  await expect(description).toBeVisible();
  const actionable = page.getByRole('button').or(page.getByRole('link'));
  expect(await actionable.count()).toBeGreaterThan(0);
});

test('every button exposes an accessible name', async ({ page }) => {
  for (const route of ['/', '/knowledge/overview', '/diagnosis/class', '/teaching/class']) {
    const definition = allRoutes.find(item => item.path === route)!;
    await gotoRoute(page, route, definition.title);
    const unnamed = await page.evaluate(() => Array.from(document.querySelectorAll('button')).filter(button => {
      const text = (button.textContent ?? '').trim();
      return !text && !button.getAttribute('aria-label') && !button.getAttribute('title');
    }).length);
    expect(unnamed, `${route} 存在没有可访问名称的按钮`).toBe(0);
  }
});
