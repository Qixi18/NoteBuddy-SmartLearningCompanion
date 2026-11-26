import { expect, test } from '@playwright/test';
import { demoCsvPayloads, ensureDemoRun, gotoRoute } from './fixtures/demoContext';

/**
 * 一次完整的教师流程：导入 → 工作台 → 课程知识 → 班级诊断 → 学生诊断 → 证据追溯
 * → 学生建议 → 班级方案生成与采纳 → 班级实施与复测记录。
 * 需要真实来源签核的三案例确认/发布预检仍由各自的专项流程覆盖。
 */
test('a teacher can run the whole class workflow end to end', async ({ page }) => {
  test.setTimeout(300_000);
  await ensureDemoRun(page.request);

  await page.goto('/#/');
  const input = page.locator('input[type=file]').first();
  await input.setInputFiles(demoCsvPayloads());
  await expect(page.getByText(/导入完成，新运行/)).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText('当前班级有效评分').first()).toBeVisible();

  await gotoRoute(page, '/knowledge/overview', '课程知识');
  await expect(page.getByText('主题学习要求与资源映射')).toBeVisible();
  await expect(page.locator('table tbody tr').first()).toBeVisible();

  await gotoRoute(page, '/diagnosis/class', '班级诊断');
  await expect(page.getByLabel('班级诊断范围')).toBeVisible();

  await gotoRoute(page, '/diagnosis/student', '学生个人诊断');
  await expect(page.getByText('本次作答表现')).toBeVisible();

  await page.getByRole('link', { name: /查看完整证据/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: '题目证据详情' })).toBeVisible();

  await gotoRoute(page, '/teaching/student', '学生个性化学习建议');
  await expect(page.getByText('学习建议草稿')).toBeVisible({ timeout: 30_000 });

  await gotoRoute(page, '/teaching/class', '班级教学建议');
  await page.getByRole('button', { name: /生成规则方案|按当前证据重新生成/ }).click();
  await expect(page.getByText(/已生成第 \d+ 版规则草稿|已存在同一版草稿/).first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('审核人').fill('演示教师');
  await page.getByLabel('审核说明').fill('已核对当前班级证据。');
  await page.getByRole('button', { name: '采纳并保存' }).click();
  await expect(page.getByText(/已保存第 \d+ 版：已采纳/)).toBeVisible({ timeout: 30_000 });

  const panel = page.locator('section', { hasText: '班级教学实施与复测' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('实施活动').fill('集中处理方程类共同问题，按四步推进');
  await panel.getByLabel('练习安排（每行一条）').fill('Q004 同型题重练');
  await panel.getByLabel('观察点（每行一条）').fill('复测时比较方程指标得分率');
  await panel.getByRole('button', { name: '保存班级实施计划' }).click();
  await expect(panel.getByText('班级教学实施计划已保存')).toBeVisible({ timeout: 30_000 });

  await panel.locator('summary').first().click();
  const followupNode = panel.getByLabel('复测节点');
  await expect(followupNode.locator('option[value="N01"]')).toBeDisabled();
  await followupNode.selectOption('N02');
  await expect(panel.getByText(/R0145/)).toBeAttached({ timeout: 20_000 });
  await expect(panel.getByRole('checkbox', { name: /R0001/ })).toHaveCount(0);
  await panel.getByLabel('实施记录').fill('已完成第一节：典型错误归类与示范');
  await panel.getByLabel('效果观察').fill('学生能说出移项依据');
  await panel.getByLabel('实施状态').selectOption('partial');
  await panel.getByRole('checkbox', { name: /R0145/ }).check();
  await panel.getByRole('button', { name: /保存实施与复测/ }).click();
  await expect(panel.getByText(/实施情况与复测证据已保存/)).toBeVisible({ timeout: 30_000 });

  await expect(panel.locator('summary').first()).toContainText('部分完成');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
