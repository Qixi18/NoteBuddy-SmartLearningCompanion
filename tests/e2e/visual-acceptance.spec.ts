import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { allRoutes, ensureDemoRun, gotoRoute } from './fixtures/demoContext';

const DESKTOP = path.resolve('artifacts/frontend-acceptance/desktop');
const MOBILE = path.resolve('artifacts/frontend-acceptance/mobile');
const PAGE_READY_HEADINGS: Record<string, string | RegExp> = {
  '/': '当前运行整体数据质量',
  '/knowledge/overview': '主题学习要求与资源映射',
  '/knowledge/structure': '知识结构图',
  '/knowledge/items': '题目关联',
  '/diagnosis/class': '共同题目指标比较',
  '/diagnosis/student': '本次作答表现',
  '/diagnosis/evidence': '题目信息',
  '/teaching/student': '学生当前学习情况',
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

test('css keeps a readable font-size floor', async () => {
  const files = [
    'apps/web/src/styles/tokens.css',
    'apps/web/src/styles/global.css',
    'apps/web/src/layout/AppLayout.module.css',
    'apps/web/src/components/PageBits.module.css',
    'apps/web/src/features/dashboard/DashboardPage.module.css',
    'apps/web/src/features/shared/WorkbenchPages.module.css',
  ];
  const offenders: string[] = [];
  for (const file of files) {
    const css = readFileSync(path.resolve(file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) {
      const size = Number(match[1]);
      if (size < 12) offenders.push(`${file}: ${size}px`);
    }
  }
  expect(offenders).toEqual([]);
});

async function auditTypography(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    };
    const textElements = [...document.querySelectorAll('main *')].filter(element => element.children.length === 0 && (element.textContent ?? '').trim().length > 0 && visible(element));
    const small = textElements
      .map(element => ({ text: (element.textContent ?? '').trim().slice(0, 60), size: parseFloat(getComputedStyle(element).fontSize) }))
      .filter(item => item.size < 12);
    const clippedHeadings = [...document.querySelectorAll('main h1, main h2, main h3')].filter(element => visible(element) && element.scrollWidth > element.clientWidth + 2).map(element => (element.textContent ?? '').trim().slice(0, 80));
    const clippedCritical = [...document.querySelectorAll('main [class*="metricText"] strong, main [class*="priorityItem"] strong')].filter(element => visible(element) && getComputedStyle(element).textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth + 2).map(element => (element.textContent ?? '').trim().slice(0, 80));
    const readingSelectors = [
      'main [class*="studentAnswerText"] p',
      'main [class*="evidenceItemPrompt"] h2',
      'main [class*="itemRelationPromptBlock"] p',
      'main [class*="draftFields"] p',
      'main [class*="reviewPlanForm"] textarea',
      'main [class*="caseForm"] textarea',
      'main [class*="answerCols"] p',
      'main [class*="responseBody"]',
      'main [class*="claimHeading"] b',
    ];
    const lowReading = readingSelectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(visible).map(element => ({ selector, size: parseFloat(getComputedStyle(element).fontSize) }))).filter(item => item.size < 15);
    const lowControls = [...document.querySelectorAll('main button, main select, main input:not([type="checkbox"]), main textarea')].filter(visible).map(element => ({ tag: element.tagName, text: (element.textContent ?? '').trim().slice(0, 40), size: parseFloat(getComputedStyle(element).fontSize) })).filter(item => item.size < 14);
    return { small, clippedHeadings, clippedCritical, lowReading, lowControls };
  });
}

test('desktop acceptance: nine pages render with real data and saved screenshots', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const [index, route] of allRoutes.entries()) {
    await gotoRoute(page, route.path, route.title);
    await waitForPageReady(page, route.path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.screenshot({
      path: path.join(DESKTOP, `${String(index + 1).padStart(2, '0')}-${slug(route.path)}.png`),
      fullPage: true,
    });
    const audit = await auditTypography(page);
    expect(audit.small, `${route.path} 存在低于 12px 的可见文字`).toEqual([]);
    expect(audit.clippedHeadings, `${route.path} 标题被横向截断`).toEqual([]);
    expect(audit.clippedCritical, `${route.path} 核心指标名称被截断`).toEqual([]);
    expect(audit.lowReading, `${route.path} 主要阅读内容低于 15px`).toEqual([]);
    expect(audit.lowControls, `${route.path} 按钮/筛选器/表单低于 14px`).toEqual([]);
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
