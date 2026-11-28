import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DEMO, ensureDemoRun, gotoRoute } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('generating a class plan produces an editable rule draft', async ({ page }) => {
  await gotoRoute(page, '/teaching/class', '班级教学建议');

  await page.getByRole('button', { name: /生成规则方案|按当前证据重新生成/ }).click();
  await expect(page.getByText(/已生成第 \d+ 版规则草稿|已存在同一版草稿/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '编辑方案' }).click();

  const editor = page.getByTestId('class-plan-editor').locator('textarea');
  await expect(editor).toHaveCount(7);
  expect((await editor.first().inputValue()).length).toBeGreaterThan(0);
  await page.getByLabel('审核人').fill('QA 教师');
  await page.getByLabel('审核说明').fill('已核对当前证据。');
  await expect(page.getByRole('button', { name: '采纳并保存' })).toBeEnabled();
});

test('teacher edits and accepts the class plan without losing history', async ({ page }) => {
  await gotoRoute(page, '/teaching/class', '班级教学建议');
  await page.getByRole('button', { name: /生成规则方案|按当前证据重新生成/ }).click();
  await expect(page.getByText(/已生成第 \d+ 版规则草稿|已存在同一版草稿/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '编辑方案' }).click();

  const firstSection = page.getByTestId('class-plan-editor').locator('textarea').first();
  await firstSection.fill('演示：先集中处理方程类共同问题，再做一次同型题重练。');
  await page.getByLabel('审核人').fill('QA 教师');
  await page.getByLabel('审核说明').fill('已核对证据并修订教学动作。');
  await expect(page.getByRole('button', { name: '采纳并保存' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '保存教师修改' })).toBeEnabled();
  await page.getByRole('button', { name: '保存教师修改' }).click();
  await expect(page.getByText(/已保存第 \d+ 版：教师修改/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: '采纳并保存' })).toBeEnabled();
  await page.getByRole('button', { name: '采纳并保存' }).click();
  await expect(page.getByText(/已保存第 \d+ 版：已采纳/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: '方案版本历史' })).toBeVisible();
  await expect(page.getByText(/第 \d+ 版 · 已采纳/).first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('class plan page binds the current class and node', async ({ page }) => {
  await gotoRoute(page, '/teaching/class', '班级教学建议');

  const scope = page.getByLabel('班级教学方案范围');
  await expect(scope).toBeVisible();
  await expect(scope).toContainText(DEMO.classId);
  await expect(scope).toContainText(DEMO.nodeId);
});

test('class plan is readable by default and switches to a growing editor', async ({ page }) => {
  await gotoRoute(page, '/teaching/class', '班级教学建议');
  await page.getByRole('button', { name: /生成规则方案|按当前证据重新生成/ }).click();
  await expect(page.getByText(/已生成第 \d+ 版规则草稿|已存在同一版草稿/).first()).toBeVisible({ timeout: 20_000 });

  const reader = page.getByTestId('class-plan-reader');
  await expect(reader).toBeVisible();
  await expect(reader.locator('article')).toHaveCount(7);
  await expect(page.getByTestId('class-plan-editor')).toHaveCount(0);
  await page.getByRole('button', { name: /编辑方案|创建修订版本/ }).click();

  const editor = page.getByTestId('class-plan-editor');
  await expect(editor.locator('textarea')).toHaveCount(7);
  const firstSection = editor.locator('textarea').first();
  const initialHeight = await firstSection.evaluate(element => element.getBoundingClientRect().height);
  await firstSection.fill(`${'自动高度验证内容。'.repeat(80)}\\n换行之后仍然可以完整阅读。`);
  await expect.poll(() => firstSection.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(initialHeight);
  await expect(firstSection).toHaveValue(new RegExp('换行之后仍然可以完整阅读'));
});

test('class teaching page has working internal navigation and compact plan guidance', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoRoute(page, '/teaching/class', '班级教学建议');
  const nav = page.getByRole('navigation', { name: '班级教学建议页面导航' });
  await expect(nav.getByRole('button')).toHaveCount(6);
  await nav.getByRole('button', { name: '诊断证据' }).click();
  await expect(page).toHaveURL(/#\/teaching\/class/);
  await expect(page.getByTestId('class-evidence-area')).toBeInViewport();

  await page.getByRole('button', { name: /生成规则方案|按当前证据重新生成/ }).click();
  await expect(page.getByTestId('class-plan-reader')).toBeVisible();
  await expect(page.getByTestId('class-plan-section-teaching-actions')).toBeVisible();
  await page.getByRole('button', { name: /编辑方案|创建修订版本/ }).click();
  const editor = page.getByTestId('class-plan-editor');
  await expect(editor.locator('textarea')).toHaveCount(7);
  await expect(editor.getByText('每行一条：来自班级诊断的具体证据')).toBeVisible();
  await expect(editor.getByText('选填').first()).toBeVisible();
  await expect(editor.locator('[data-section="teaching_actions"]')).toHaveCSS('grid-column', '1 / -1');
  await expect(page.getByRole('button', { name: '采纳并保存' })).toBeDisabled();
});

test('class teaching page has no horizontal overflow at required viewports', async ({ page }) => {
  for (const viewport of [
    { width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1280, height: 800 },
    { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await gotoRoute(page, '/teaching/class', '班级教学建议');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${viewport.width}×${viewport.height} 横向溢出 ${overflow}px`).toBeLessThanOrEqual(1);
    if (viewport.width === 390) {
      await expect(page.getByRole('navigation', { name: '班级教学建议页面导航' }).getByRole('button', { name: 'AI 分析' })).toBeVisible();
    }
  }
});

test('class teaching acceptance screenshots show overview, plan, implementation and mobile', async ({ page }) => {
  const screenshotDir = path.resolve('test-results/class-teaching-acceptance');
  mkdirSync(screenshotDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoRoute(page, '/teaching/class', '班级教学建议');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('heading', { name: '本班指标表现' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '本班已核验问题观察' })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, '班级教学建议-桌面端-首屏.png') });

  await page.getByRole('button', { name: /生成规则方案|按当前证据重新生成/ }).click();
  await expect(page.getByTestId('class-plan-reader')).toBeVisible();
  await page.getByRole('button', { name: '教学方案' }).click();
  await page.screenshot({ path: path.join(screenshotDir, '班级教学建议-桌面端-教学方案.png') });

  await page.getByRole('button', { name: /编辑方案|创建修订版本/ }).click();
  await page.getByLabel('审核人').fill('验收教师');
  await page.getByLabel('审核说明').fill('已核对当前班级诊断依据与方案正文。');
  await page.getByRole('button', { name: '采纳并保存' }).click();
  await expect(page.getByText(/已保存第 \d+ 版：已采纳/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '实施复测' }).click();
  await expect(page.getByRole('heading', { name: '班级教学实施与复测' })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, '班级教学建议-桌面端-实施复测.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoRoute(page, '/teaching/class', '班级教学建议');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await expect(page.getByTestId('class-teaching-page')).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, '班级教学建议-移动端-首屏.png') });
});
