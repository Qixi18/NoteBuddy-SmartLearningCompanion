import { expect, test } from '@playwright/test';
import { allRoutes, ensureDemoRun, gotoRoute } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
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

test('200% zoom equivalent keeps core pages reachable', async ({ page }) => {
  test.setTimeout(120_000);
  // 1440×900 在 200% 浏览器缩放下约等于 720×450 CSS 像素视口。
  await page.setViewportSize({ width: 720, height: 450 });
  for (const route of ['/', '/knowledge/overview', '/diagnosis/class', '/teaching/class', '/teaching/student']) {
    const definition = allRoutes.find(item => item.path === route)!;
    await gotoRoute(page, route, definition.title);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${route} 在 200% 等效视口下横向溢出 ${overflow}px`).toBeLessThanOrEqual(1);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const actionable = page.getByRole('button').or(page.getByRole('link'));
    expect(await actionable.count(), `${route} 在 200% 等效视口下没有可操作入口`).toBeGreaterThan(0);
  }
});

test('mobile drawer opens, navigates and closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoRoute(page, '/', '教学工作台');

  const menu = page.getByRole('button', { name: '打开导航' });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  const drawer = page.getByRole('complementary', { name: '移动导航' });
  await expect(drawer.getByRole('link', { name: '课程知识' })).toBeVisible();
  await drawer.getByRole('link', { name: '课程知识' }).click();
  await expect(page).toHaveURL(/#\/knowledge\/overview/);
  await expect(page.getByRole('button', { name: '打开导航' })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: '打开导航' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '打开导航' })).toHaveAttribute('aria-expanded', 'false');
});

test.describe('200% device scale factor', () => {
  test.use({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });

  test('dashboard keeps layout at 2x device scale', async ({ page }) => {
    await gotoRoute(page, '/', '教学工作台');
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
