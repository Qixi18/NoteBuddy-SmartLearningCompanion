import { expect, test } from '@playwright/test';
import { ensureDemoRun } from './fixtures/demoContext';

const TEACHER = '视觉验收合成教师';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('capture redesigned page at six widths', async ({ page, request }) => {
  test.setTimeout(240_000);
  const signOff = await request.post('/api/source-verification', {
    data: {
      indicator_id: 'I011',
      status: 'verified',
      curriculum_locator: 'I011 合成课标定位',
      textbook_locator: 'I011 合成教材定位',
      material_ids: ['Q001'],
      reviewer: TEACHER,
      reason: '仅用于视觉验收的隔离合成环境。',
    },
  });
  expect(signOff.ok()).toBeTruthy();

  await page.goto('/#/teaching/student?node=N01&class=C1&student=D01&indicator=I011', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: '接受方案' })).toBeVisible({ timeout: 30_000 });
  for (const width of [1920, 1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 900 : 1024 });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `tmp/ia-${width}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`width ${width} overflow ${overflow}`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/teaching/student?node=N01&class=C1&student=D01&indicator=I011', { waitUntil: 'networkidle' });
  await page.getByLabel('复核教师').fill(TEACHER);
  await page.getByLabel('复核理由').fill('视觉验收：核对目标与材料后采纳当前方案。');
  await page.getByRole('button', { name: '接受方案' }).click();
  await expect(page.getByText('教师复核已保存。页面已按最新有效版本更新方案展示。')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tmp/ia-accepted-1440.png', fullPage: true });
});
