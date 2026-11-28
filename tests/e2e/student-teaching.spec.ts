import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ensureDemoRun, gotoRoute } from './fixtures/demoContext';

const TEACHER = 'Playwright 合成测试';

async function signOff(request: APIRequestContext, indicatorId: string, materialIds: string[], status: 'verified' | 'pending' = 'verified') {
  const response = await request.post('/api/source-verification', {
    data: {
      indicator_id: indicatorId,
      status,
      curriculum_locator: `${indicatorId} E2E 合成课标定位`,
      textbook_locator: `${indicatorId} E2E 合成教材定位`,
      material_ids: materialIds,
      reviewer: TEACHER,
      reason: '仅为隔离 E2E 环境解锁审核流程；不构成真实来源签核。',
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function openScope(page: Page, scope: { student: string; indicator: string; node: string; class?: string }) {
  await page.goto(`/#/teaching/student?node=${scope.node}&class=${scope.class ?? 'C1'}&student=${scope.student}&indicator=${scope.indicator}`);
  await expect(page.getByRole('heading', { level: 1, name: '学生个性化学习建议' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '学生当前学习情况' })).toBeVisible({ timeout: 30_000 });
}

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('page organizes summary, evidence, plan and review sections without page errors', async ({ page }) => {
  await gotoRoute(page, '/teaching/student', '学生个性化学习建议');

  await expect(page.getByRole('heading', { level: 2, name: '学生当前学习情况' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 2, name: '个性化学习方案' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '学习证据与推断限制' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '教师复核历史' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '代表性案例确认进度' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '教师复核与个性化方案' })).toBeVisible();

  const ai = page.locator('[data-testid="ai-analysis-panel"]');
  await expect(ai).toBeVisible();
  await expect(ai).not.toHaveAttribute('open', /.*/);
  await ai.locator('summary').click();
  const consent = ai.getByRole('checkbox');
  if (await consent.count()) {
    await expect(consent).not.toBeChecked();
    await expect(ai.getByRole('button', { name: /确认传输并生成分析|确认并重新生成分析/ })).toBeDisabled();
  } else {
    await expect(ai.getByText('本机没有配置可用的模型服务')).toBeVisible();
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a partially scored student gets a remediation plan with traced materials', async ({ page, request }) => {
  await signOff(request, 'I011', ['Q001']);
  await openScope(page, { student: 'D01', indicator: 'I011', node: 'N01' });

  await expect(page.getByText(/补救与巩固/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('推荐学习材料', { exact: true })).toBeVisible();
  await expect(page.getByText('推荐练习', { exact: true })).toBeVisible();
  await expect(page.getByText('Q001').first()).toBeVisible();
  await expect(page.getByText('已核验').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: '学习步骤' })).toBeVisible();
  await expect(page.getByText('方向提示').first()).toBeVisible();
  await expect(page.getByText('结构提示').first()).toBeVisible();
  await expect(page.getByText('局部检查').first()).toBeVisible();
  await expect(page.getByText('调整条件').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '接受方案' })).toBeVisible();
});

test('a student without records only receives a diagnostic observation plan', async ({ page, request }) => {
  await signOff(request, 'I022', ['Q005']);
  await openScope(page, { student: 'D07', indicator: 'I022', node: 'N01' });

  await expect(page.getByText(/补充诊断/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/范围覆盖证据/).first()).toBeVisible();
  await expect(page.getByText(/不是补救结论/)).toBeVisible();
});

test('pending scoring blocks accepting a formal plan', async ({ page }) => {
  await openScope(page, { student: 'D02', indicator: 'I022', node: 'N01' });

  await expect(page.getByText('等待完成评分').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/完成评分后再生成方案/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '接受方案' })).toHaveCount(0);
});

test('an unverified source is named as the plan blocker instead of showing a plan', async ({ page, request }) => {
  await signOff(request, 'I013', [], 'pending');
  await openScope(page, { student: 'D01', indicator: 'I013', node: 'N01' });

  await expect(page.getByText('等待来源核验').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/来源签核尚未通过或已失效/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '接受方案' })).toHaveCount(0);
});

test('teacher edits, accepts, records implementation, confirms a case and reloads history', async ({ page, request }) => {
  test.setTimeout(240_000);
  await signOff(request, 'I022', ['Q005']);
  await openScope(page, { student: 'D01', indicator: 'I022', node: 'N01' });
  await expect(page.getByText(/补救与巩固/).first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: '编辑方案' }).click();
  const goal = page.getByLabel('学习目标', { exact: true });
  const editedGoal = `${await goal.inputValue()}（E2E 合成修订）`;
  await goal.fill(editedGoal);
  await page.getByLabel('复核教师').fill(TEACHER);
  await page.getByLabel('复核理由').fill('仅验证隔离 E2E 的编辑与审核流程，非真实教师复核。');
  await page.getByRole('button', { name: '保存修改并采纳' }).click();
  await expect(page.getByText('教师复核已保存。')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('第 1 版 · 修改后采纳')).toBeVisible();

  const reviews = await (await request.get('/api/reviews')).json();
  const saved = (reviews['D01:I022'] ?? []).find((row: Record<string, unknown>) => row.node_id === 'N01' && row.status === 'edited');
  expect(saved?.teaching_plan_v2?.goal).toContain('E2E 合成修订');
  expect(saved?.structured_plan).toBeTruthy();

  await expect(page.getByText('继承完整 V2 方案快照')).toBeVisible();
  await page.getByLabel('教师', { exact: true }).fill(TEACHER);
  await page.getByRole('button', { name: '保存教学调整计划' }).click();
  await expect(page.getByText('教学调整计划已保存，并关联了起始复核与作答来源。')).toBeVisible({ timeout: 30_000 });

  const adjustment = page.locator('details').filter({ hasText: /调整计划 ·/ }).first();
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
  await adjustment.getByLabel('记录教师').fill(TEACHER);
  await adjustment.getByRole('button', { name: '保存实施与后续结论' }).click();
  await expect(adjustment.getByText('实施情况和后续证据已保存，先前版本保留在调整记录历史中。')).toBeVisible({ timeout: 10_000 });

  const caseForm = page.locator('[data-testid="teacher-case-form"]');
  await caseForm.locator('summary').click();
  await caseForm.getByLabel('选择理由').fill('E2E 合成：验证部分得分学生的正式案例归档。');
  await caseForm.getByLabel('案例叙述').fill('E2E 合成案例叙述，仅用于隔离测试环境。');
  await caseForm.getByLabel('解释限制').fill('合成数据，不代表真实教学效果。');
  await caseForm.getByLabel('核验教师').fill(TEACHER);
  await caseForm.getByRole('button', { name: '确认并保存案例' }).click();
  await expect(page.getByText('1 / 3')).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '学生个性化学习建议' })).toBeVisible();
  await expect(page.getByText('第 1 版 · 修改后采纳')).toBeVisible({ timeout: 30_000 });
  const restored = page.locator('details').filter({ hasText: /调整计划 ·/ }).first();
  await restored.locator('summary').click();
  await expect(restored.getByLabel('后续测验节点').locator('option:checked')).toContainText('N02');
  await expect(restored.getByRole('checkbox', { name: /R0146.*Q005/ })).toBeChecked();
  await expect(restored.getByLabel('教师结论')).toHaveValue('E2E 合成验收，不代表真实教学效果。');
});

test('blocked drafts still record a teacher decision with a reason', async ({ page, request }) => {
  await signOff(request, 'I012', [], 'pending');
  await openScope(page, { student: 'D01', indicator: 'I012', node: 'N01' });

  await expect(page.getByText('等待来源核验').first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('复核教师').fill(TEACHER);
  await page.getByLabel('复核理由').fill('E2E 合成：来源未核验时先继续观察。');
  await page.getByRole('button', { name: '继续观察' }).click();
  await expect(page.getByText('复核结果已保存。')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/第 \d+ 版 · 继续观察/).first()).toBeVisible();
});

test('a no-record diagnostic plan can be accepted, implemented and confirmed as a coverage case', async ({ page, request }) => {
  test.setTimeout(180_000);
  await signOff(request, 'I022', ['Q005']);
  await openScope(page, { student: 'D07', indicator: 'I022', node: 'N01' });
  await expect(page.getByText(/补充诊断/).first()).toBeVisible({ timeout: 30_000 });

  await page.getByLabel('复核教师').fill(TEACHER);
  await page.getByLabel('复核理由').fill('E2E 合成：无作答记录，按当前范围覆盖证据确认补充观察方案。');
  await page.getByRole('button', { name: '接受方案' }).click();
  await expect(page.getByText('教师复核已保存。')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('第 1 版 · 已采纳')).toBeVisible();

  await expect(page.getByText('继承完整 V2 方案快照')).toBeVisible();
  await page.getByLabel('教师', { exact: true }).fill(TEACHER);
  await page.getByRole('button', { name: '保存教学调整计划' }).click();
  await expect(page.getByText('教学调整计划已保存，并关联了起始复核与作答来源。')).toBeVisible({ timeout: 30_000 });

  const caseForm = page.locator('[data-testid="teacher-case-form"]');
  await caseForm.locator('summary').click();
  await expect(caseForm.getByLabel('案例类型')).toHaveValue('部分得分');
  await caseForm.getByLabel('案例类型').selectOption('无记录观察');
  await caseForm.getByLabel('选择理由').fill('E2E 合成：验证无作答记录学生也能形成正式覆盖证据案例。');
  await caseForm.getByLabel('案例叙述').fill('E2E 合成案例：当前范围没有作答记录，只依据覆盖证据安排补充观察。');
  await caseForm.getByLabel('解释限制').fill('合成数据；覆盖证据不能当作已完成的作答。');
  await caseForm.getByLabel('核验教师').fill(TEACHER);
  await caseForm.getByRole('button', { name: '确认并保存案例' }).click();
  await expect(page.getByText('2 / 3')).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '学生个性化学习建议' })).toBeVisible();
  await expect(page.getByText('第 1 版 · 已采纳')).toBeVisible({ timeout: 30_000 });
});
