import { expect, test } from '@playwright/test';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const bundlePath = path.join(repoRoot, 'data', `playwright-${process.env.PLAYWRIGHT_RUN_ID}`, 'bundle');

function sampleCsvFiles(targetBundle = bundlePath, includeExtraStudent = false, longEvidence = false): string[] {
  const python = spawnSync('python', ['-c', [
    'import csv, sys',
    'from pathlib import Path',
    'sys.path.insert(0, str(Path("apps/backend/tests").resolve()))',
    'from test_core import sample_tables',
    'from app.services.analysis import TABLES',
    'target = Path(sys.argv[1]); target.mkdir(parents=True, exist_ok=True)',
    'tables = sample_tables()',
    'if len(sys.argv) > 2 and sys.argv[2] == "extra": tables["模拟学生"].append({"学生编号": "D04", "模拟班级编号": "C3"})',
    'if len(sys.argv) > 3 and sys.argv[3] == "long":',
    ' for row in tables["作答记录"]:',
    '  if row["记录编号"] == "R2": row["学生最终作答"] = "长文本证据" * 400; row["解答过程"] = "\\n".join([f"第 {step} 步：解释解题思路并核对计算结果。" for step in range(1, 81)])',
    ' tables["测验节点"][0]["可用题目编号"] = "、".join(["Q001"] + [f"Q{number:03}" for number in range(2, 42)])',
    ' for number in range(2, 42):',
    '  item_id = f"Q{number:03}"',
    '  tables["题目与材料"].append({"材料编号": item_id, "主题编号": "T01", "指标编号": "T01I1", "满分": "2", "题干或内容": f"综合练习 {number}：比较两个代数式并说明理由。", "评分点": "正确比较并说明理由"})',
    '  tables["作答记录"].append({"记录编号": f"R{number + 3}", "学生编号": "D01", "材料编号": item_id, "主题编号": "T01", "节点编号": "N01", "作答事件编号": f"E{number + 2}", "修订版本": "1", "评分状态": "已评分", "得分": "3", "满分": "2", "_source_line": number + 4, "解答过程": "先计算再检查：结果超过题目满分，用于生成质量异常样本。"})',
    'for name, required in TABLES.items():',
    ' rows = tables.get(name, [])',
    ' fields = list(dict.fromkeys(required + [key for row in rows for key in row if not key.startswith("_")]))',
    ' with (target / f"{name}.csv").open("w", encoding="utf-8-sig", newline="") as stream:',
    '  writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore"); writer.writeheader(); writer.writerows(rows)',
  ].join('\n'), targetBundle, includeExtraStudent ? 'extra' : '', longEvidence ? 'long' : ''], { cwd: repoRoot, encoding: 'utf8' });
  if (python.status !== 0) throw new Error(`Unable to generate sample CSV bundle: ${python.stderr}`);
  return readdirSync(targetBundle)
    .filter((name) => name.endsWith('.csv'))
    .map((name) => path.join(targetBundle, name));
}

test('loads the local workbench and imports the sample bundle', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '先导入一份学情数据', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '重试连接' })).toHaveCount(0);
  await expect(page.getByText('请求失败 (500)')).toHaveCount(0);

  await expect(page.locator('.first-run .required-files li')).toHaveCount(6);
  const files = sampleCsvFiles(bundlePath, false, true);
  expect(files).toHaveLength(6);
  await page.getByRole('main').getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
  await expect(page.locator('.first-run .card form [role="status"]')).toContainText('6 个文件');
  await page.getByRole('button', { name: '检查文件并导入' }).click();

  await expect(page.getByRole('heading', { name: '全局概览' })).toBeVisible();
  await expect(page.locator('#message')).toContainText('数据已导入，当前运行已更新。');
  await expect(page.getByText('还没有可查看的分析运行')).toHaveCount(0);
  const studentCount = page.locator('.stat-grid .stat-block').filter({ hasText: '学生' }).locator('strong');
  const classCount = page.locator('.stat-grid .stat-block').filter({ hasText: '班级' }).locator('strong');
  await expect(studentCount).toHaveText('3');
  await expect(classCount).toHaveText('2');
  await expect(page.getByText('请求失败 (500)')).toHaveCount(0);

  await page.getByRole('link', { name: '学科知识' }).click();
  await expect(page.getByRole('heading', { name: '学习要求与来源' })).toBeVisible();
  await expect(page.getByText('请求失败 (500)')).toHaveCount(0);
  const sourceSignoff = page.locator('[aria-label="指标来源签核"] details').first();
  await sourceSignoff.locator('summary').click();
  await page.getByLabel('课标原页与定位').fill('模拟核验：课标第 1 页');
  await page.getByLabel('教材原页与定位').fill('模拟核验：教材第 1 页');
  await page.getByLabel('核验人').fill('E2E 模拟审核人');
  await page.getByLabel('核验依据与限制').fill('仅验证软件流程，非学科签核');
  const sourceItems = sourceSignoff.locator('input[type=checkbox]');
  for (let index = 0; index < await sourceItems.count(); index += 1) { await sourceItems.nth(index).check(); }
  await page.getByRole('button', { name: '确认本指标来源' }).click();
  await expect(page.locator('[aria-label="指标来源签核"]').getByRole('status')).toContainText('人工核验通过');

  await page.getByRole('link', { name: '学情洞察' }).click();
  await expect(page.getByRole('heading', { name: '班级概览' })).toBeVisible();
  await page.getByLabel('测验节点').selectOption('N01');
  await expect(page.getByText('C1 · 节点 N01')).toBeVisible();

  await page.getByRole('link', { name: '学生分析' }).click();
  await page.getByLabel('学生').selectOption('D01');
  await page.getByLabel('观察指标').selectOption('T01I1');
  await page.getByLabel('测验节点').selectOption('N01');
  await expect(page.locator('.student-result-title')).toContainText('D01 · T01I1 · 节点 N01');
  await page.getByRole('button', { name: '查看此范围作答证据' }).click();
  await expect(page.getByRole('heading', { name: '作答证据', exact: true })).toBeVisible();
  await expect(page.locator('.scope-summary')).toContainText('D01 · T01I1 · 节点 N01');
  await expect(page.locator('.evidence-list')).toContainText('R2');
  await page.setViewportSize({ width: 1024, height: 900 });
  const longEvidence = page.locator('.evidence-entry').filter({ hasText: 'R2' }).first();
  await longEvidence.locator('summary').click();
  await expect(longEvidence.locator('p').filter({ hasText: '最终作答：' })).toContainText('长文本证据');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  expect(await longEvidence.locator('pre').evaluate(element => element.scrollHeight)).toBeGreaterThan(240);
  await page.getByRole('link', { name: '学情洞察', exact: true }).click();
  await page.getByRole('link', { name: '数据质量', exact: true }).click();
  const actionableFindings = page.locator('[aria-labelledby="quality-action-title"] .quality-finding');
  await expect(actionableFindings).toHaveCount(41);
  await expect(actionableFindings.first().getByRole('button', { name: '查看作答' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await page.getByRole('link', { name: '教学方案', exact: true }).click();
  await expect(page.locator('.scope-fields select').nth(0)).toHaveValue('D01');
  await expect(page.locator('.scope-fields select').nth(1)).toHaveValue('T01I1');
  await expect(page.locator('.scope-fields select').nth(2)).toHaveValue('N01');

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.getByRole('link', { name: '教学方案' }).click();
  await expect(page.getByRole('heading', { name: '建议复核', exact: true })).toBeVisible();
  await page.getByLabel('测验节点').selectOption('N01');
  const scopeControls = page.locator('.scope-fields select');
  await expect(scopeControls).toHaveCount(3);
  for (const control of await scopeControls.all()) {
    expect((await control.boundingBox())?.width ?? 0).toBeGreaterThan(300);
  }
  await page.route('**/api/deepseek', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: '模型服务调用失败', code: 'MODEL_SERVICE_ERROR' }) }));
  await page.getByRole('button', { name: '使用模型生成草稿' }).click();
  await expect(page.locator('#message')).toContainText('模型服务调用失败');
  await page.unroute('**/api/deepseek');
  await page.getByRole('button', { name: '生成规则草稿' }).click();
  await expect(page.getByRole('heading', { name: '教师复核内容' })).toBeVisible();
  await expect(page.getByText('未确认 · 请核对左侧证据和来源边界')).toBeVisible();
  await page.getByText('编辑完整教学方案', { exact: true }).click();
  const structuredPlan = page.locator('.review-structured');
  await structuredPlan.getByLabel('保存完整方案').check();
  await structuredPlan.getByLabel(/Q001/).check();
  await structuredPlan.getByLabel('学习活动').fill('核对当前节点的解题步骤');
  await structuredPlan.getByLabel('活动步骤（每行一步）').fill('独立重做原题\n解释关键步骤');
  await structuredPlan.getByLabel('练习（每行一项）').fill('Q001 同类型练习');
  await structuredPlan.getByLabel('观察点（每行一项）').fill('记录独立作答步骤');
  await page.getByLabel('复核人').fill('测试教师');
  await page.getByLabel('复核理由').fill('核对当前节点的原始证据');
  await page.route('**/api/review', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '模拟复核保存失败', code: 'INTERNAL_ERROR' }) }));
  await page.getByRole('button', { name: '保存复核' }).click();
  await expect(page.locator('.review-editor').getByRole('alert')).toContainText('模拟复核保存失败');
  await expect(page.getByLabel('复核理由')).toHaveValue('核对当前节点的原始证据');
  await page.unroute('**/api/review');
  await page.getByRole('button', { name: '保存复核' }).click();
  await expect(page.getByRole('status')).toContainText('复核已保存');
  await page.getByRole('link', { name: '案例与导出', exact: true }).click();
  const candidate = page.locator('.case-candidate').filter({ hasText: 'D01' }).first();
  await candidate.locator('summary').click();
  await candidate.getByRole('button', { name: '查看候选证据' }).click();
  await expect(page.getByText('D01 的可追溯记录')).toBeVisible();
  const candidateEvidenceRow = page.locator('.case-detail details.row').first();
  await candidateEvidenceRow.locator('summary').click();
  await candidateEvidenceRow.getByRole('button', { name: '在建议复核中查看此证据' }).click();
  await expect(page.getByRole('heading', { name: '建议复核', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '案例与导出', exact: true }).click();
  const selectedCandidate = page.locator('.case-candidate').filter({ hasText: 'D01' }).first();
  await selectedCandidate.locator('summary').click();
  await selectedCandidate.getByRole('button', { name: '查看候选证据' }).click();
  const caseEditor = page.locator('.case-editor');
  await caseEditor.getByText('开始案例签核', { exact: true }).click();
  await page.getByLabel('案例叙述').fill('E2E 测试记录当前节点的原始作答表现');
  await page.getByLabel('样本限制与不能推断的结论').fill('仅为模拟数据流程测试，不代表学科结论');
  await page.getByLabel('确认教师').fill('E2E 模拟审核人');
  await caseEditor.locator('summary').filter({ hasText: '选择原始作答证据' }).click();
  await caseEditor.getByLabel(/R4 · 节点 N01/).check();
  await caseEditor.locator('summary').filter({ hasText: '关联教师复核版本' }).click();
  await caseEditor.getByLabel(/T01I1 · 节点 N01 · 版本 1/).check();
  await page.getByRole('button', { name: '确认正式案例' }).click();
  await expect(caseEditor.getByRole('status')).toContainText('教师已确认');
  await page.getByLabel('案例一').selectOption('D01');
  await page.getByLabel('案例二').selectOption('D02');
  await page.getByLabel('案例三').selectOption('D03');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下载成果包' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const archivePath = await download.path();
  expect(archivePath).toBeTruthy();
  const archiveCheck = spawnSync('python', ['-c', [
    'import sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as archive:',
    ' assert archive.testzip() is None',
    ' assert "manifest.json" in archive.namelist()',
  ].join('\n'), archivePath!], { encoding: 'utf8' });
  expect(archiveCheck.status, archiveCheck.stderr).toBe(0);
  await expect(page.locator('#message')).toContainText('成果包下载已开始');
  await page.getByRole('link', { name: '教学调整', exact: true }).click();
  await expect(page.getByRole('heading', { name: '教学调整', exact: true })).toBeVisible();
  await page.getByLabel('计划活动').fill('根据复核建议完成节点内练习');
  await page.getByLabel('练习（每行一项）').fill('Q001 变式');
  await page.getByLabel('观察点（每行一项）').fill('记录独立作答步骤');
  await page.getByLabel('计划教师').fill('测试教师');
  await page.getByLabel('教师复核版本').selectOption({ index: 1 });
  await page.getByRole('button', { name: '保存计划' }).click();
  await expect(page.getByText('已保存教学计划与起始证据引用。')).toBeVisible();
  await expect(page.locator('main')).toContainText('起始运行');

  const followupBundle = path.join(path.dirname(bundlePath), 'followup-bundle');
  expect(sampleCsvFiles(followupBundle, true)).toHaveLength(6);
  await page.getByRole('button', { name: '导入数据' }).click();
  await page.locator('.import-dialog').getByLabel('选择 CSV 文件夹').setInputFiles(followupBundle);
  await expect(page.locator('.import-dialog [role="status"]')).toContainText('6 个文件');
  await page.locator('.import-dialog').getByRole('button', { name: '检查文件并导入' }).click();
  await expect(page.locator('#message')).toContainText('数据已导入，当前运行已更新。');
  await expect(page.getByRole('heading', { name: '全局概览' })).toBeVisible();
  await expect(studentCount).toHaveText('4');
  await expect(classCount).toHaveText('3');
  await page.getByRole('link', { name: '教学方案' }).click();
  await page.getByRole('link', { name: '教学调整' }).click();
  await expect(page.getByLabel('选择记录')).toHaveValue(/.+/);
  await page.getByLabel('实际实施').fill('完成节点内变式练习');
  await page.getByLabel('后续观察').fill('记录了学生独立作答步骤');
  const followupEvidenceDetails = page.locator('details').filter({ hasText: '选择后续证据' });
  await followupEvidenceDetails.locator('summary').click();
  await followupEvidenceDetails.locator('input[type="checkbox"]').first().check();
  await page.locator('select').filter({ has: page.locator('option[value="not_comparable"]') }).selectOption('not_comparable');
  await page.getByPlaceholder('说明题目、满分、难度或测量范围的依据').fill('后续测验的测量范围不同');
  await page.getByPlaceholder('只记录人工判断与观察，不把分数变化自动归因于干预').fill('记录课堂观察，不推断干预效果');
  await page.getByLabel('审核教师').fill('测试教师');
  await page.getByRole('button', { name: '保存后续记录' }).click();
  await expect(page.getByText('已保存实施、后续证据和教师判断。系统没有推断干预效果。')).toBeVisible();

  const runDetails = page.locator('.run-details');
  await runDetails.locator('summary').click();
  const currentRunId = await runDetails.locator('code').textContent();
  expect(currentRunId).toBeTruthy();
  await runDetails.locator('summary').click();
  await page.route('**/api/import-files', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ run_id: currentRunId, quality: {} }) }));
  await page.route('**/api/cases', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '模拟案例辅助接口失败', code: 'INTERNAL_ERROR' }) }));
  await page.getByRole('button', { name: '导入数据' }).click();
  await page.locator('.import-dialog').getByLabel('选择 CSV 文件夹').setInputFiles(followupBundle);
  await page.locator('.import-dialog').getByRole('button', { name: '检查文件并导入' }).click();
  await expect(page.locator('#message')).toContainText('但当前视图未能刷新');
  await expect(page.locator('#message')).toContainText('案例候选读取失败');
  await page.getByRole('link', { name: '教学方案', exact: true }).click();
  await page.getByRole('link', { name: '案例与导出', exact: true }).click();
  await expect(page.locator('.case-candidate').filter({ hasText: 'D01' }).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('all nine routes render on direct hash load, refresh, history, and unknown hashes', async ({ page }) => {
  const routes = [
    ['/home', '全局概览'],
    ['/knowledge/indicators', '学习要求与来源'],
    ['/insights/classes', '班级概览'],
    ['/insights/students', '学生分析'],
    ['/insights/evidence', '作答证据'],
    ['/insights/quality', '数据质量'],
    ['/plan/reviews', '建议复核'],
    ['/plan/adjustments', '教学调整'],
    ['/plan/cases', '案例与导出'],
  ] as const;
  const files = sampleCsvFiles();
  expect(files).toHaveLength(6);
  await page.goto('/#/knowledge/indicators');
  const emptyState = page.getByRole('heading', { name: '先导入一份学情数据', level: 1 });
  const knowledge = page.getByRole('heading', { name: '学习要求与来源', level: 1 });
  await expect(emptyState.or(knowledge)).toBeVisible();
  if (await emptyState.isVisible()) {
    await page.getByRole('main').getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
    await expect(page.locator('.first-run .card form [role="status"]')).toContainText('6 个文件');
    await page.getByRole('button', { name: '检查文件并导入' }).click();
    await expect(page.locator('#message')).toContainText('数据已导入，当前运行已更新。');
  }
  await page.goto('/#/home');
  await expect(page.getByRole('heading', { name: '全局概览', level: 1 })).toBeVisible();

  for (const [path, title] of routes) {
    await page.goto(`/#${path}`);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    if (path === '/home') {
      await expect(page.getByRole('link', { name: '全局概览' })).toHaveAttribute('aria-current', 'page');
    } else {
      await expect(page.getByRole('link', { name: title, exact: true })).toHaveAttribute('aria-current', 'page');
      const section = path.startsWith('/knowledge/') ? '学科知识' : path.startsWith('/insights/') ? '学情洞察' : '教学方案';
      await expect(page.getByRole('link', { name: section, exact: true })).toHaveClass(/active/);
    }
  }

  await page.goto('/#/home');
  await page.getByRole('link', { name: '学科知识' }).click();
  await expect(page.getByRole('heading', { name: '学习要求与来源', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: '全局概览', level: 1 })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: '学习要求与来源', level: 1 })).toBeVisible();

  await page.goto('/#/made-up-route');
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByRole('heading', { name: '全局概览', level: 1 })).toBeVisible();
});

test('keyboard users can open and close import, and get an announced validation error', async ({ page }) => {
  await page.goto('/#/home');
  const emptyState = page.getByRole('heading', { name: '先导入一份学情数据', level: 1 });
  const overview = page.getByRole('heading', { name: '全局概览', level: 1 });
  await expect(emptyState.or(overview)).toBeVisible();
  if (await emptyState.isVisible()) {
    expect(sampleCsvFiles()).toHaveLength(6);
    await page.getByRole('main').getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
    await page.getByRole('button', { name: '检查文件并导入' }).click();
    await expect(page.locator('#message')).toContainText('数据已导入，当前运行已更新。');
  }

  const importButton = page.getByRole('button', { name: '导入数据' });
  await importButton.focus();
  await expect(importButton).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '导入数据' });
  await expect(dialog).toBeVisible();
  const folderButton = dialog.getByRole('button', { name: '选择数据文件夹' });
  await expect(folderButton).toBeFocused();
  expect(await folderButton.evaluate(element => getComputedStyle(element).outlineWidth)).toBe('3px');
  expect(await folderButton.evaluate(element => getComputedStyle(element).outlineColor)).toBe('rgb(85, 127, 206)');
  await page.keyboard.press('Tab');
  await expect(dialog.getByText('6 个必需 CSV 文件名')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭导入窗口' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(folderButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '关闭导入窗口' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(importButton).toBeFocused();

  await importButton.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  const incompleteBundle = mkdtempSync(path.join(os.tmpdir(), 'smart-learning-incomplete-'));
  try {
    writeFileSync(path.join(incompleteBundle, '课程要求.csv'), '模拟内容');
    await dialog.getByLabel('选择 CSV 文件夹').setInputFiles(incompleteBundle);
    await dialog.getByRole('button', { name: '检查文件并导入' }).click();
    await expect(dialog.getByRole('alert')).toContainText('所选文件夹缺少');
  } finally {
    rmSync(incompleteBundle, { recursive: true, force: true });
  }

  const failedImportBundle = mkdtempSync(path.join(os.tmpdir(), 'smart-learning-import-failure-'));
  try {
    expect(sampleCsvFiles(failedImportBundle)).toHaveLength(6);
    await page.route('**/api/import-files', async route => {
      await new Promise(resolve => setTimeout(resolve, 300));
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '模拟导入服务失败', code: 'INTERNAL_ERROR' }) });
    });
    await dialog.getByLabel('选择 CSV 文件夹').setInputFiles(failedImportBundle);
    await dialog.getByRole('button', { name: '检查文件并导入' }).click();
    const importing = dialog.getByRole('button', { name: '正在导入…' });
    await expect(importing).toBeDisabled();
    await expect(dialog.getByRole('alert')).toContainText('模拟导入服务失败');
    await expect(dialog.getByText(/已选择 .* · 6 个文件/)).toBeVisible();
    await page.unroute('**/api/import-files');
  } finally {
    rmSync(failedImportBundle, { recursive: true, force: true });
  }
});

test('shows loading and a recoverable error when the workbench API is unavailable', async ({ page }) => {
  await page.route('**/api/run*', async route => {
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '本地 API 暂不可用', code: 'HTTP_ERROR' }) });
  });
  await page.goto('/#/home', { waitUntil: 'commit' });
  await expect(page.locator('.loading-state')).toContainText('正在读取本机分析服务');
  await expect(page.getByRole('heading', { name: '无法读取分析数据' })).toBeVisible();
  await expect(page.locator('.connection-error [role="alert"]')).toContainText('本地 API 暂不可用');
  await page.getByRole('button', { name: '重试连接' }).click();
  await expect(page.locator('.connection-error [role="alert"]')).toContainText('本地 API 暂不可用');
});

test('export failure is announced without navigating away or claiming success', async ({ page }) => {
  await page.route('**/api/export?*', route => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: '模拟导出服务错误' }),
  }));
  await page.goto('/#/home');
  const emptyState = page.getByRole('heading', { name: '先导入一份学情数据', level: 1 });
  const overview = page.getByRole('heading', { name: '全局概览', level: 1 });
  await expect(emptyState.or(overview)).toBeVisible();
  if (await emptyState.isVisible()) {
    expect(sampleCsvFiles()).toHaveLength(6);
    await page.getByRole('main').getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
    await page.getByRole('button', { name: '检查文件并导入' }).click();
    await expect(page.locator('#message')).toContainText('数据已导入，当前运行已更新。');
  }
  await page.goto('/#/plan/cases');
  await page.getByLabel('案例一').selectOption('D01');
  await page.getByLabel('案例二').selectOption('D02');
  await page.getByLabel('案例三').selectOption('D03');
  await page.getByRole('button', { name: '下载成果包' }).click();
  await expect(page.getByRole('alert')).toContainText('模拟导出服务错误');
  await expect(page).toHaveURL(/#\/plan\/cases$/);
});

test('slow review requests reject stale drafts and keep generation and save single-flight', async ({ page }) => {
  await page.goto('/#/home');
  const emptyState = page.getByRole('heading', { name: '先导入一份学情数据', level: 1 });
  const overview = page.getByRole('heading', { name: '全局概览', level: 1 });
  await expect(emptyState.or(overview)).toBeVisible();
  if (await emptyState.isVisible()) {
    expect(sampleCsvFiles()).toHaveLength(6);
    await page.getByRole('main').getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
    await page.getByRole('button', { name: '检查文件并导入' }).click();
    await expect(page.locator('#message')).toContainText('数据已导入，当前运行已更新。');
  }

  let draftRequests = 0;
  let finishedDraftRequests = 0;
  await page.route('**/api/draft*', async route => {
    draftRequests += 1;
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ response });
    finishedDraftRequests += 1;
  });
  await page.goto('/#/plan/reviews');
  await page.getByLabel('测验节点').selectOption('N01');
  const firstDraftRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/draft');
  await page.getByRole('button', { name: '生成规则草稿' }).click();
  await firstDraftRequest;
  const pendingGenerate = page.getByRole('button', { name: '正在生成草稿…' }).first();
  await expect(pendingGenerate).toBeDisabled();
  await pendingGenerate.evaluate((button: HTMLButtonElement) => button.click());
  await page.getByLabel('学生').selectOption('D02');
  await expect.poll(() => finishedDraftRequests).toBe(1);
  expect(draftRequests).toBe(1);
  await expect(page.getByRole('heading', { name: '教师复核内容' })).toHaveCount(0);

  const secondDraftRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/draft' && new URL(request.url()).searchParams.get('student') === 'D02');
  await page.getByRole('button', { name: '生成规则草稿' }).click();
  await secondDraftRequest;
  await expect(page.getByRole('heading', { name: '教师复核内容' })).toBeVisible();
  expect(draftRequests).toBe(2);

  let saveRequests = 0;
  await page.route('**/api/review', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    saveRequests += 1;
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ response });
  });
  await page.getByLabel('复核人').fill('E2E 模拟教师');
  await page.getByLabel('复核理由').fill('验证慢请求时表单提交行为');
  const saveRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/review');
  await page.getByRole('button', { name: '保存复核' }).click();
  await saveRequest;
  const pendingSave = page.getByRole('button', { name: '正在保存…' });
  await expect(pendingSave).toBeDisabled();
  await pendingSave.evaluate((button: HTMLButtonElement) => button.click());
  expect(saveRequests).toBe(1);
  await expect(page.locator('#message')).toContainText('复核已保存');
});

test('key pages fit and render at four desktop widths', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/#/home');
  const emptyState = page.getByRole('heading', { name: '先导入一份学情数据', level: 1 });
  const overview = page.getByRole('heading', { name: '全局概览', level: 1 });
  await expect(emptyState.or(overview)).toBeVisible();
  if (await emptyState.isVisible()) {
    expect(sampleCsvFiles()).toHaveLength(6);
    await page.getByRole('main').getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
    await expect(page.locator('.first-run .card form [role="status"]')).toContainText('6 个文件');
    await page.getByRole('button', { name: '检查文件并导入' }).click();
    await expect(page.locator('#message')).toContainText('数据已导入，当前运行已更新。');
  }

  const pages = [
    ['/home', '全局概览'],
    ['/knowledge/indicators', '学习要求与来源'],
    ['/insights/classes', '班级概览'],
    ['/plan/reviews', '建议复核'],
    ['/plan/cases', '案例与导出'],
  ] as const;
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, title] of pages) {
      await page.goto(`/#${route}`);
      await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
      if (route === '/insights/classes' || route === '/plan/reviews') {
        await page.getByLabel('测验节点').selectOption('N01');
      }
      if (route === '/plan/reviews') {
        await page.getByRole('button', { name: '生成规则草稿' }).click();
        await expect(page.getByRole('heading', { name: '教师复核内容' })).toBeVisible();
      }
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth, `${title} overflows at ${width}px`).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: testInfo.outputPath(`viewport-${width}-${route.slice(1).replaceAll('/', '-')}.png`),
        fullPage: true,
      });
    }
  }
  expect(pageErrors).toEqual([]);
});
