import { expect, test } from '@playwright/test';
import { ensureDemoRun, gotoRoute } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('student teaching page shows the rule draft with evidence', async ({ page }) => {
  await gotoRoute(page, '/teaching/student', '学生个性化学习建议');

  await expect(page.getByText('学习建议草稿')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('证据与资源')).toBeVisible();
  await expect(page.getByText('诊断依据')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('teacher can reject a draft and the decision is persisted', async ({ page }) => {
  await gotoRoute(page, '/teaching/student', '学生个性化学习建议');
  await expect(page.getByText('学习建议草稿')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: '拒绝草稿' }).click();
  await expect(page.getByText('复核结果已保存')).toBeVisible();

  await page.reload();
  await page.getByRole('heading', { level: 1, name: '学生个性化学习建议' }).waitFor();
  await expect(page.getByText(/当前最新复核状态为「rejected」/).first()).toBeVisible();
});

test('synthetic fixture covers accepted review and student N01-to-N02 follow-up', async ({ page }) => {
  const signoff = await page.request.post('/api/source-verification', {
    data: {
      indicator_id: 'I022',
      status: 'verified',
      curriculum_locator: 'E2E 合成夹具；非正式课标定位',
      textbook_locator: 'E2E 合成夹具；非正式教材定位',
      material_ids: ['Q005'],
      reviewer: 'Playwright 合成测试',
      reason: '仅为隔离 E2E 环境解锁审核流程；不构成真实来源签核。',
    },
  });
  expect(signoff.ok()).toBeTruthy();

  await page.goto('/#/teaching/student?node=N01&class=C1&student=D01&indicator=I022');
  await expect(page.getByRole('heading', { level: 1, name: '学生个性化学习建议' })).toBeVisible();
  await expect(page.getByText('学习建议草稿')).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('教学活动').fill('E2E 合成测试：针对 Q005 演示方程组解法。');
  await page.getByLabel('实施步骤').fill('核对消元依据\n分步示范');
  await page.getByLabel('配套练习').fill('Q005 同型题练习');
  await page.getByLabel('观察点').fill('观察消元步骤与验算');
  await page.getByRole('checkbox', { name: 'Q005' }).check();
  await page.getByLabel('复核教师').fill('Playwright 合成测试');
  await page.getByLabel('复核理由').fill('仅验证隔离 E2E 流程，非真实教师复核。');
  await page.getByRole('button', { name: '采纳建议并保存方案' }).click();
  await expect(page.getByText('复核结果已保存。')).toBeVisible({ timeout: 20_000 });

  await page.getByLabel(/计划活动|計畫活動/).fill('E2E 合成测试：练习 Q005 同型题。');
  await page.getByLabel('练习安排').fill('完成一题 Q005 同型练习');
  await page.getByLabel('观察要点').fill('核对消元步骤');
  await page.getByLabel('教师', { exact: true }).fill('Playwright 合成测试');
  await page.getByRole('button', { name: '保存教学调整计划' }).click();
  await expect(page.getByText('教学调整计划已保存，并关联了起始复核与作答来源。')).toBeVisible({ timeout: 20_000 });

  const adjustment = page.locator('details').filter({ hasText: 'E2E 合成测试：练习 Q005 同型题。' });
  await expect(adjustment).toBeVisible();
  await adjustment.locator('summary').click();
  const followupNode = adjustment.getByLabel('后续测验节点');
  await expect(followupNode.locator('option[value="N01"]')).toBeDisabled();
  await followupNode.selectOption('N02');
  const followupEvidence = adjustment.getByRole('checkbox', { name: /R0146.*Q005/ });
  await expect(followupEvidence).toBeVisible({ timeout: 20_000 });
  await followupEvidence.check();
  await adjustment.getByLabel('实施记录').fill('E2E 合成流程模拟；非真实教学活动。');
  await adjustment.getByLabel('效果观察').fill('只验证 N02 证据路径，不推断真实教学效果。');
  await adjustment.getByLabel('实施状态').selectOption('partial');
  await adjustment.getByLabel('比较口径').selectOption('comparable');
  await adjustment.getByLabel('比较说明').fill('仅依据 N01/N02 共同题 Q005 的有效评分。');
  await adjustment.getByLabel('教师结论').fill('E2E 合成验收，不代表真实教学效果。');
  await adjustment.getByLabel('记录教师').fill('Playwright 合成测试');
  await adjustment.getByRole('button', { name: '保存实施与后续结论' }).click();
  await expect(adjustment.getByText('实施情况和后续证据已保存，先前版本保留在调整记录历史中。')).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '学生个性化学习建议' })).toBeVisible();
  const restored = page.locator('details').filter({ hasText: 'E2E 合成测试：练习 Q005 同型题。' });
  await restored.locator('summary').click();
  await expect(restored.getByLabel('后续测验节点').locator('option:checked')).toContainText('N02');
  await expect(restored.getByRole('checkbox', { name: /R0146.*Q005/ })).toBeChecked();
  await expect(restored.getByLabel('教师结论')).toHaveValue('E2E 合成验收，不代表真实教学效果。');
});
