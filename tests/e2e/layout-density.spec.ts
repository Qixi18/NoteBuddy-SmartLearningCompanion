import { expect, test } from '@playwright/test';
import { ensureDemoRun, gotoRoute } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('topic overview stacks its resource modules and expands one indicator at a time', async ({ page }) => {
  await gotoRoute(page, '/knowledge/overview', '课程知识');
  const columns = await page.locator('[class*="overviewResourceStack"]').evaluate(element => getComputedStyle(element).gridTemplateColumns);
  expect(columns.trim().split(/\s+/)).toHaveLength(1);
  const catalog = page.locator('[class*="catalogList"]');
  await expect(catalog.locator('button[aria-expanded="true"]')).toHaveCount(1);
  const collapsed = catalog.locator('button[aria-expanded="false"]').first();
  await collapsed.click();
  await expect(catalog.locator('button[aria-expanded="true"]')).toHaveCount(1);
});

test('knowledge structure keeps related items in a full-width row below the three-column map', async ({ page }) => {
  await gotoRoute(page, '/knowledge/structure', '课程知识');
  const columns = page.getByTestId('knowledge-structure-columns');
  const related = page.getByTestId('structure-related-items');
  await expect(related).toBeVisible();
  const positions = await page.evaluate(() => {
    const map = document.querySelector('[data-testid="knowledge-structure-columns"]')!;
    const items = document.querySelector('[data-testid="structure-related-items"]')!;
    return { mapBottom: map.getBoundingClientRect().bottom, itemsTop: items.getBoundingClientRect().top, itemsWidth: items.getBoundingClientRect().width };
  });
  await expect(columns.locator(':scope > section')).toHaveCount(3);
  expect(positions.itemsTop).toBeGreaterThanOrEqual(positions.mapBottom);
  expect(positions.itemsWidth).toBeGreaterThan(800);
});

test('item sources use a full-width panel after the item list and detail', async ({ page }) => {
  await gotoRoute(page, '/knowledge/items', '课程知识');
  const source = page.getByTestId('item-relation-sources');
  await expect(source).toBeVisible();
  const dimensions = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="item-relation-grid"]')!.getBoundingClientRect();
    const detail = document.querySelector('[data-testid="item-relation-detail-column"] > section')!.getBoundingClientRect();
    const sourcePanel = document.querySelector('[data-testid="item-relation-sources"]')!.getBoundingClientRect();
    return { gridWidth: grid.width, detailBottom: detail.bottom, sourceWidth: sourcePanel.width, sourceTop: sourcePanel.top };
  });
  expect(dimensions.sourceWidth).toBeGreaterThan(dimensions.gridWidth - 2);
  expect(dimensions.sourceTop).toBeGreaterThan(dimensions.detailBottom);
  await expect(page.getByText('关联课程来源与材料')).toBeVisible();
});

test('class candidates and key evidence occupy separate responsive rows', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/class', '班级诊断');
  const candidates = page.getByTestId('class-candidate-grid');
  const evidence = page.getByTestId('class-key-evidence-grid');
  await expect(candidates).toBeVisible();
  await expect(evidence).toBeVisible();
  const candidateRows = await candidates.evaluate(element => getComputedStyle(element).gridTemplateColumns);
  const evidenceRows = await evidence.evaluate(element => getComputedStyle(element).gridTemplateColumns);
  expect(candidateRows.split(' ').filter(Boolean).length).toBeGreaterThanOrEqual(1);
  expect(evidenceRows.split(' ').filter(Boolean).length).toBeGreaterThanOrEqual(2);
  const positions = await page.evaluate(() => ({
    candidates: document.querySelector('[data-testid="class-candidate-panel"]')!.getBoundingClientRect(),
    evidence: document.querySelector('[data-testid="class-evidence-panel"]')!.getBoundingClientRect(),
  }));
  expect(positions.evidence.top).toBeGreaterThanOrEqual(positions.candidates.bottom);
  expect(positions.candidates.width).toBeGreaterThan(800);
});

test('student diagnosis uses readable text metrics and matching grid columns', async ({ page }) => {
  await gotoRoute(page, '/diagnosis/student', '学生个人诊断');
  const metric = page.getByTestId('student-metric-text');
  await expect(metric).toBeVisible();
  const style = await metric.evaluate(element => ({ size: parseFloat(getComputedStyle(element).fontSize), whiteSpace: getComputedStyle(element).whiteSpace }));
  expect(style.size).toBeLessThanOrEqual(20);
  expect(style.whiteSpace).not.toBe('nowrap');
  const pairs = await page.locator('[data-testid="student-diagnosis-pair"]').evaluateAll(elements => elements.map(element => getComputedStyle(element).gridTemplateColumns));
  expect(pairs).toHaveLength(2);
  expect(pairs[0]).toBe(pairs[1]);
});

test('evidence, plan and review sections stack as full-width rows', async ({ page }) => {
  await gotoRoute(page, '/teaching/student', '学生个性化学习建议');
  const review = page.getByTestId('student-review-plan-panel');
  await expect(review).toBeVisible();
  const dimensions = await page.evaluate(() => {
    const evidence = document.getElementById('student-evidence')!.getBoundingClientRect();
    const plan = document.getElementById('student-plan')!.getBoundingClientRect();
    const reviewPanel = document.querySelector('[data-testid="student-review-plan-panel"]')!.getBoundingClientRect();
    return {
      evidenceWidth: evidence.width,
      planWidth: plan.width,
      reviewWidth: reviewPanel.width,
      evidenceBottom: evidence.bottom,
      planTop: plan.top,
      planBottom: plan.bottom,
      reviewTop: reviewPanel.top,
    };
  });
  expect(dimensions.planTop).toBeGreaterThanOrEqual(dimensions.evidenceBottom - 2);
  expect(dimensions.reviewTop).toBeGreaterThanOrEqual(dimensions.planBottom - 2);
  expect(Math.abs(dimensions.planWidth - dimensions.reviewWidth)).toBeLessThanOrEqual(2);
  expect(dimensions.planWidth).toBeGreaterThan(800);
});
