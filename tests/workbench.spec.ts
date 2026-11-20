import { expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const pythonExecutable = process.env.SMART_LEARNING_PYTHON
  || [path.join(repoRoot, '.venv', 'Scripts', 'python.exe'), path.join(repoRoot, '.venv', 'bin', 'python')].find(existsSync)
  || 'python';
const pythonEnvironment = {
  ...process.env,
  PYTHONPATH: [path.resolve(repoRoot, 'apps/backend'), path.resolve(repoRoot, 'apps/backend/tests'), process.env.PYTHONPATH]
    .filter(Boolean)
    .join(path.delimiter),
};
const bundlePath = path.join(repoRoot, 'data', `playwright-${process.env.PLAYWRIGHT_RUN_ID}`, 'bundle');

function sampleCsvFiles(targetBundle = bundlePath, includeExtraStudent = false, longEvidence = false, noRecordsStudent = ''): string[] {
  const python = spawnSync(pythonExecutable, ['-c', [
    'import csv, sys',
    'from pathlib import Path',
    'sys.path.insert(0, str(Path("apps/backend/tests").resolve()))',
    'from test_core import sample_tables',
    'from app.services.analysis import TABLES',
    'target = Path(sys.argv[1]); target.mkdir(parents=True, exist_ok=True)',
    'tables = sample_tables()',
    'if len(sys.argv) > 2 and sys.argv[2] == "extra": tables["模拟学生"].append({"学生编号": "D04", "模拟班级编号": "C3"})',
    'if len(sys.argv) > 4 and sys.argv[4]: excluded = set(sys.argv[4].split(",")); tables["作答记录"] = [row for row in tables["作答记录"] if row["学生编号"] not in excluded]',
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
  ].join('\n'), targetBundle, includeExtraStudent ? 'extra' : '', longEvidence ? 'long' : '', noRecordsStudent], { cwd: repoRoot, env: pythonEnvironment, encoding: 'utf8' });
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

  await expect(page.getByRole('heading', { name: '开始', exact: true })).toBeVisible();
  await expect(page.locator('#message')).toContainText('数据已导入，当前运行已更新。');
  await expect(page.getByText('还没有可查看的分析运行')).toHaveCount(0);
  const studentCount = page.locator('.stat-grid .stat-block').filter({ hasText: '学生' }).locator('strong');
  const classCount = page.locator('.stat-grid .stat-block').filter({ hasText: '班级' }).locator('strong');
  await expect(studentCount).toHaveText('3');
  await expect(classCount).toHaveText('2');
  await expect(page.getByText('请求失败 (500)')).toHaveCount(0);

  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '学习要求' }).click();
  await expect(page.getByRole('heading', { name: '学习要求' })).toBeVisible();
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

  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '已有表现' }).click();
  await expect(page.getByRole('heading', { name: '班级比较' })).toBeVisible();
  await page.getByLabel('测验节点').selectOption('N01');
  await expect(page.getByText('C1 · 节点 N01')).toBeVisible();

  await page.getByRole('navigation', { name: '已有表现视图' }).getByRole('button', { name: '学生分析' }).click();
  await page.getByLabel('学生').selectOption('D01');
  await page.getByLabel('观察指标').selectOption('T01I1');
  await page.getByLabel('测验节点').selectOption('N01');
  await expect(page.locator('.student-result-title')).toContainText('D01 · T01I1 · 节点 N01');
  await page.getByRole('button', { name: '形成学习建议' }).click();
  await expect(page.getByRole('heading', { name: '学习建议', exact: true })).toBeVisible();
  await expect(page.locator('.scope-fields').getByLabel('学生')).toHaveValue('D01');
  await expect(page.locator('.scope-fields').getByLabel('观察指标')).toHaveValue('T01I1');
  await expect(page.locator('.scope-fields').getByLabel('测验节点')).toHaveValue('N01');
  await page.goBack();
  await expect(page.getByRole('heading', { name: '学生分析' })).toBeVisible();
  await page.getByRole('button', { name: '查看此范围作答证据' }).click();
  await expect(page.getByRole('heading', { name: '作答证据与评分点', exact: true })).toBeVisible();
  await expect(page.locator('.scope-summary')).toContainText('D01 · T01I1 · 节点 N01');
  await expect(page.locator('.evidence-list')).toContainText('R2');
  await page.setViewportSize({ width: 1024, height: 900 });
  const longEvidence = page.locator('.evidence-entry').filter({ hasText: 'R2' }).first();
  await longEvidence.locator('summary').click();
  await expect(longEvidence.locator('p').filter({ hasText: '最终作答：' })).toContainText('长文本证据');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  expect(await longEvidence.locator('pre').evaluate(element => element.scrollHeight)).toBeGreaterThan(240);
  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '已有表现', exact: true }).click();
  await page.getByRole('navigation', { name: '已有表现视图' }).getByRole('button', { name: '数据质量与处置' }).click();
  const actionableFindings = page.locator('[aria-labelledby="quality-action-title"] .quality-finding');
  await expect(actionableFindings).toHaveCount(41);
  await expect(actionableFindings.first().getByRole('button', { name: '查看作答' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await page.route('**/api/readiness', async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, model: { ...data.model, configured: false } } });
  });
  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '学习建议', exact: true }).click();
  await expect(page.locator('.scope-fields select').nth(0)).toHaveValue('D01');
  await expect(page.locator('.scope-fields select').nth(1)).toHaveValue('T01I1');
  await expect(page.locator('.scope-fields select').nth(2)).toHaveValue('N01');

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '学习建议' }).click();
  await expect(page.getByRole('heading', { name: '学习建议', exact: true })).toBeVisible();
  await page.getByLabel('测验节点').selectOption('N01');
  const scopeControls = page.locator('.scope-fields select');
  await expect(scopeControls).toHaveCount(3);
  for (const control of await scopeControls.all()) {
    expect((await control.boundingBox())?.width ?? 0).toBeGreaterThan(300);
  }
  await expect(page.getByText('本机未配置模型，可使用规则草稿。')).toBeVisible();
  await expect(page.getByRole('button', { name: '使用模型生成草稿' })).toBeDisabled();
  await page.route('**/api/readiness', async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, model: { ...data.model, configured: true } } });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: '使用模型生成草稿' })).toBeEnabled();
  await page.getByRole('navigation', { name: '学习建议视图' }).getByRole('button', { name: '观察与调整' }).click();
  await page.getByRole('navigation', { name: '学习建议视图' }).getByRole('button', { name: '建议阅读与复核' }).click();
  await page.route('**/api/deepseek', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: '模型服务调用失败', code: 'MODEL_SERVICE_ERROR' }) }));
  await page.getByRole('button', { name: '使用模型生成草稿' }).click();
  await expect(page.locator('#message')).toContainText('模型服务调用失败');
  await page.unroute('**/api/deepseek');
  await page.unroute('**/api/readiness');
  await page.getByRole('button', { name: '生成规则草稿' }).click();
  await expect(page.getByRole('heading', { name: '教师复核内容' })).toBeVisible();
  await expect(page.getByText('未确认 · 请核对左侧证据和来源边界')).toBeVisible();
  await page.getByText('编辑完整教学方案', { exact: true }).click();
  const structuredPlan = page.locator('.review-structured');
  await structuredPlan.getByLabel('保存旧版结构化方案').check();
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
  await expect(page.locator('#message')).toContainText('复核已保存');
  await page.getByRole('link', { name: '案例与交付', exact: true }).click();
  const candidate = page.locator('.case-candidate').filter({ hasText: 'D01' }).first();
  await candidate.locator('summary').click();
  await expect(page.getByText('D01 的可追溯记录')).toBeVisible();
  const candidateEvidenceRow = page.locator('.case-detail details.row').first();
  await candidateEvidenceRow.locator('summary').click();
  await candidateEvidenceRow.getByRole('button', { name: '在建议复核中查看此证据' }).click();
  await expect(page.getByRole('heading', { name: '学习建议', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '案例与交付', exact: true }).click();
  const selectedCandidate = page.locator('.case-candidate').filter({ hasText: 'D01' }).first();
  await selectedCandidate.locator('summary').click();
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
  await expect(caseEditor.getByRole('status').filter({ hasText: '已保存案例版本' })).toContainText('教师已确认');
  await page.getByRole('button', { name: '阅读报告' }).click();
  await page.getByLabel('报告案例 1').selectOption('D01');
  await page.getByLabel('报告案例 2').selectOption('D02');
  await page.getByLabel('报告案例 3').selectOption('D03');
  await page.getByRole('button', { name: '交付检查' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下载草稿成果包' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  await expect(page.getByText(/不包含完整运行审计数据/)).toBeVisible();
  const archivePath = await download.path();
  expect(archivePath).toBeTruthy();
  const artifactScan = spawnSync(pythonExecutable, ['scan-artifacts.py', archivePath!], { cwd: repoRoot, env: pythonEnvironment, encoding: 'utf8' });
  expect(artifactScan.status, artifactScan.stdout + artifactScan.stderr).toBe(0);
  const archiveCheck = spawnSync(pythonExecutable, ['-c', [
    'import json, sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as archive:',
    ' assert archive.testzip() is None',
    ' assert "manifest.json" in archive.namelist()',
    ' manifest=json.loads(archive.read("manifest.json"))',
    ' assert manifest["package_type"] == "selected_student_cases"',
    ' ids=set(manifest["case_ids"])',
    ' assert len(ids) == 3',
    ' assert all(row["学生编号"] in ids for row in json.loads(archive.read("raw_responses.json")))',
    ' assert all(row["student_id"] in ids for row in json.loads(archive.read("evidence_index.json")))',
    ' assert all(not item["key"].startswith("D04") for item in json.loads(archive.read("all_metrics.json")))',
    ' records={row["记录编号"] for row in json.loads(archive.read("raw_responses.json"))}',
    ' quality=json.loads(archive.read("data_quality.json"))',
    ' assert all(row["record_id"] in records for row in quality["record_dispositions"])',
    ' assert all(row.get("record_id") in records for row in quality["findings"])',
  ].join('\n'), archivePath!], { cwd: repoRoot, env: pythonEnvironment, encoding: 'utf8' });
  expect(archiveCheck.status, archiveCheck.stderr).toBe(0);
  await expect(page.locator('#message')).toContainText('成果包下载已开始');
  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '学习建议', exact: true }).click();
  await page.getByRole('navigation', { name: '学习建议视图' }).getByRole('button', { name: '观察与调整' }).click();
  await expect(page.getByRole('heading', { name: '创建教学调整记录', exact: true })).toBeVisible();
  await page.getByLabel('教师复核版本').selectOption({ index: 1 });
  await page.getByLabel('计划活动').fill('根据复核建议完成节点内练习');
  await page.getByLabel('练习（每行一项）').fill('Q001 变式');
  await page.getByLabel('观察点（每行一项）').fill('记录独立作答步骤');
  await page.getByLabel('计划教师').fill('测试教师');
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
  await expect(page.getByRole('heading', { name: '开始', exact: true })).toBeVisible();
  await expect(studentCount).toHaveText('4');
  await expect(classCount).toHaveText('3');
  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '学习建议' }).click();
  await page.getByRole('navigation', { name: '学习建议视图' }).getByRole('button', { name: '观察与调整' }).click();
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
  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '学习建议', exact: true }).click();
  await page.getByRole('link', { name: '案例与交付', exact: true }).click();
  await expect(page.locator('.case-candidate').filter({ hasText: 'D01' }).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('teachers can keep linked questions compact and reveal all evidence on demand', async ({ page }) => {
  await page.goto('/');
  const files = sampleCsvFiles(bundlePath, false, true);
  expect(files).toHaveLength(6);
  if (await page.locator('.first-run').count()) {
    await page.getByRole('main').getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
    await page.getByRole('button', { name: '检查文件并导入' }).click();
  } else {
    await page.getByRole('button', { name: '导入数据' }).click();
    const importDialog = page.getByRole('dialog', { name: '导入数据' });
    await importDialog.getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
    await importDialog.getByRole('button', { name: '检查文件并导入' }).click();
  }
  await expect(page.getByRole('heading', { name: '开始', level: 1 })).toBeVisible();

  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '学习要求', exact: true }).click();
  const questions = page.getByRole('heading', { name: '关联题目 · 41 道' }).locator('..');
  await expect(questions.getByText('综合练习 2：比较两个代数式并说明理由。')).toBeVisible();
  await expect(questions.getByText('综合练习 6：比较两个代数式并说明理由。')).toHaveCount(0);
  await questions.getByRole('button', { name: '查看全部关联题目（41）' }).click();
  await expect(questions.getByText('综合练习 41：比较两个代数式并说明理由。')).toBeVisible();
  await questions.getByRole('button', { name: '收起关联题目' }).click();
  await expect(questions.getByText('综合练习 41：比较两个代数式并说明理由。')).toHaveCount(0);

  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '已有表现', exact: true }).click();
  await page.getByLabel('测验节点').selectOption('N01');
  const performanceViews = page.getByRole('navigation', { name: '已有表现视图' });
  await performanceViews.getByRole('button', { name: '数据质量与处置' }).click();
  await expect(page.getByRole('heading', { name: '数据质量与处置' })).toBeVisible();
  await performanceViews.getByRole('button', { name: '班级比较' }).click();

  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '学习建议', exact: true }).click();
  await page.getByLabel('学生').selectOption('D01');
  await page.getByLabel('测验节点').selectOption('N01');
  await page.getByRole('button', { name: '加入案例准备' }).click();
  await expect(page.getByRole('heading', { name: '案例与交付', level: 1 })).toBeVisible();
  const caseEditor = page.locator('.case-editor');
  await expect(caseEditor.getByLabel('案例学生')).toHaveValue('D01');
  await caseEditor.getByText('开始案例签核', { exact: true }).click();
  await caseEditor.locator('summary').filter({ hasText: '选择原始作答证据' }).click();
  const evidenceFilter = caseEditor.getByRole('searchbox', { name: '筛选原始作答证据' });
  await expect(evidenceFilter).toBeVisible();
  await evidenceFilter.fill('Q041');
  await expect(evidenceFilter).toHaveValue('Q041');
  await expect(caseEditor.getByText('正在显示 1 / 43 条；筛选不会取消已勾选的证据。')).toBeVisible();
  await expect(caseEditor.getByText(/R44 · 节点 N01 · Q041 · 作答记录.csv/)).toBeVisible();
  await expect(caseEditor.getByText(/R4 · 节点 N01 · Q001 · 作答记录.csv/)).toHaveCount(0);

  await page.getByRole('button', { name: '交付检查' }).click();
  await page.getByRole('button', { name: '选择报告学生' }).click();
  await expect(page.getByLabel('报告案例 1')).toBeVisible();
  await expect(page.getByLabel('班级报告节点')).toBeVisible();
});

test('confirms a teacher-reviewed no-response coverage case', async ({ page }) => {
  const noRecordBundle = path.join(path.dirname(bundlePath), 'no-response-bundle');
  const files = sampleCsvFiles(noRecordBundle, false, false, 'D01,D02,D03');
  expect(files).toHaveLength(6);
  await page.goto('/#/knowledge/indicators');
  const firstRunHeading = page.getByRole('heading', { name: '先导入一份学情数据', level: 1 });
  const knowledgeHeading = page.getByRole('heading', { name: '学习要求', level: 1 });
  await expect(firstRunHeading.or(knowledgeHeading)).toBeVisible();
  if (await page.locator('.first-run').count()) {
    await page.locator('.first-run input[type="file"]').setInputFiles(noRecordBundle);
    await page.getByRole('button', { name: '检查文件并导入' }).click();
  } else {
    await page.getByRole('button', { name: '导入数据' }).click();
    const importDialog = page.getByRole('dialog', { name: '导入数据' });
    await importDialog.getByLabel('选择 CSV 文件夹').setInputFiles(noRecordBundle);
    await importDialog.getByRole('button', { name: '检查文件并导入' }).click();
  }
  await expect(page.getByRole('heading', { name: '开始', exact: true })).toBeVisible();

  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '已有表现', exact: true }).click();
  await page.getByRole('navigation', { name: '已有表现视图' }).getByRole('button', { name: '学生分析' }).click();
  await page.getByLabel('学生').selectOption('D01');
  await page.getByLabel('观察指标').selectOption('T01I1');
  await page.getByLabel('测验节点').selectOption('N01');
  await expect(page.getByText(/暂无有效已评分记录；这不代表学生未掌握/)).toBeVisible();
  await page.getByRole('button', { name: '补充观察并形成建议' }).click();
  await expect(page.getByRole('heading', { name: '学习建议', exact: true })).toBeVisible();
  await expect(page.locator('.review-range').getByLabel('学生')).toHaveValue('D01');
  await expect(page.locator('.review-range').getByLabel('测验节点')).toHaveValue('N01');
  await page.getByLabel('学生').selectOption('D01');
  await page.getByLabel('观察指标').selectOption('T01I1');
  await page.getByLabel('测验节点').selectOption('N01');
  await page.getByRole('button', { name: '生成规则草稿' }).click();
  const reviewEditor = page.locator('.review-editor');
  await expect(reviewEditor.getByText(/作答记录为 0 条/)).toBeVisible();
  await reviewEditor.getByLabel('将此覆盖记录作为本次教师复核的证据引用').check();
  await reviewEditor.locator('details.review-structured').locator('summary').click();
  const plan = reviewEditor.locator('.review-structured');
  await plan.getByLabel('保存旧版结构化方案').check();
  await plan.getByLabel('学习活动').fill('安排短诊断并记录独立过程');
  await plan.getByLabel('活动步骤（每行一步）').fill('说明任务\n学生独立作答\n教师记录步骤');
  await plan.getByLabel('练习（每行一项）').fill('教师自备诊断题');
  await plan.getByLabel('观察点（每行一项）').fill('记录作答步骤，不按缺记录推断零分');
  await reviewEditor.getByLabel('复核状态').selectOption('edited');
  await reviewEditor.getByLabel('复核人').fill('E2E 模拟教师');
  await reviewEditor.getByLabel('复核理由').fill('核对任务安排；无作答记录的原因未知');
  await reviewEditor.getByRole('button', { name: '保存复核' }).click();
  await expect(page.locator('#message')).toContainText('复核已保存');

  await page.getByRole('link', { name: '案例与交付', exact: true }).click();
  const caseEditor = page.locator('.case-editor');
  await caseEditor.getByLabel('案例学生').selectOption('D01');
  await caseEditor.getByLabel('覆盖指标').selectOption('T01I1');
  await caseEditor.getByLabel('覆盖节点').selectOption('N01');
  await expect(caseEditor.getByText(/作答记录 0 条/)).toBeVisible();
  await caseEditor.getByText('开始案例签核', { exact: true }).click();
  await caseEditor.getByLabel('案例叙述').fill('当前节点没有学生作答记录，教师安排短诊断补充观察。');
  await caseEditor.getByLabel('样本限制与不能推断的结论').fill('原因未知；不推断为缺席、零分或未掌握。');
  await caseEditor.getByLabel('确认教师').fill('E2E 模拟教师');
  await caseEditor.locator('summary').filter({ hasText: '关联教师复核版本' }).click();
  await caseEditor.getByLabel(/T01I1 · 节点 N01 · 版本 1/).check();
  await caseEditor.getByRole('button', { name: '确认正式案例' }).click();
  await expect(caseEditor.getByRole('status').filter({ hasText: '已保存案例版本' })).toContainText('教师已确认');
  await page.getByRole('button', { name: '阅读报告' }).click();
  const caseReport = page.locator('.competition-case-report');
  await caseReport.getByLabel('报告案例 1').selectOption('D01');
  await caseReport.getByLabel('报告案例 2').selectOption('D02');
  await caseReport.getByLabel('报告案例 3').selectOption('D03');
  await expect(caseReport.getByText(/尚未全部获得当前运行中的教师确认/)).toBeVisible();
  await expect(caseReport.getByText('当前节点没有学生作答记录，教师安排短诊断补充观察。')).toBeVisible();
  await expect(caseReport.getByText(/CSV 第/)).toHaveCount(0);
  const classReport = page.locator('.competition-class-report');
  await expect(classReport.getByRole('heading', { name: '班级共性、差异与覆盖' })).toBeVisible();
  await expect(classReport.getByText(/共同题目得分率差异/)).toBeVisible();
  for (const studentId of ['D02', 'D03']) {
    await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '学习建议', exact: true }).click();
    await page.locator('.review-range').getByLabel('学生').selectOption(studentId);
    await page.getByRole('button', { name: '生成规则草稿' }).click();
    const review = page.locator('.review-editor');
    await expect(review.getByLabel('将此覆盖记录作为本次教师复核的证据引用')).toBeVisible();
    await review.getByLabel('将此覆盖记录作为本次教师复核的证据引用').check();
    await review.locator('details.review-structured').locator('summary').click();
    const plan = review.locator('.review-structured');
    await plan.getByLabel('保存旧版结构化方案').check();
    await plan.getByLabel('学习活动').fill('安排短诊断并记录独立过程');
    await plan.getByLabel('活动步骤（每行一步）').fill('说明任务\n学生独立作答\n教师记录步骤');
    await plan.getByLabel('练习（每行一项）').fill('教师自备诊断题');
    await plan.getByLabel('观察点（每行一项）').fill('记录作答步骤，不按缺记录推断零分');
    await review.getByLabel('复核状态').selectOption('edited');
    await review.getByLabel('复核人').fill('E2E 模拟教师');
    await review.getByLabel('复核理由').fill('核对任务安排；没有作答记录的原因未知');
    await review.getByRole('button', { name: '保存复核' }).click();
    await expect(page.locator('#message')).toContainText('复核已保存');

    await page.getByRole('link', { name: '案例与交付', exact: true }).click();
    const editor = page.locator('.case-editor');
    await editor.getByLabel('案例学生').selectOption(studentId);
    await editor.getByLabel('覆盖指标').selectOption('T01I1');
    await editor.getByLabel('覆盖节点').selectOption('N01');
    await expect(editor.getByText(/作答记录 0 条/)).toBeVisible();
    await editor.getByText('开始案例签核', { exact: true }).click();
    await editor.getByLabel('案例叙述').fill(`${studentId} 当前节点没有学生作答记录，教师安排短诊断补充观察。`);
    await editor.getByLabel('样本限制与不能推断的结论').fill('原因未知；不推断为缺席、零分或未掌握。');
    await editor.getByLabel('确认教师').fill('E2E 模拟教师');
    await editor.locator('summary').filter({ hasText: '关联教师复核版本' }).click();
    await editor.getByLabel(/T01I1 · 节点 N01 · 版本 1/).check();
    await editor.getByRole('button', { name: '确认正式案例' }).click();
    await expect(editor.getByRole('status').filter({ hasText: '已保存案例版本' })).toContainText('教师已确认');
    await page.getByRole('button', { name: '阅读报告' }).click();
    await expect(page.locator('.competition-case-report')).toBeVisible();
  }
  await caseReport.getByLabel('报告案例 1').selectOption('D01');
  await caseReport.getByLabel('报告案例 2').selectOption('D02');
  await caseReport.getByLabel('报告案例 3').selectOption('D03');
  await expect(caseReport.getByText(/尚未全部获得当前运行中的教师确认/)).toHaveCount(0);
  await expect(caseReport.getByText(/需求差异/).first()).toBeVisible();
  await expect(caseReport.locator('.case-report-card:visible')).toHaveCount(1);
  await caseReport.getByRole('button', { name: '查看全部案例正文' }).click();
  await expect(caseReport.locator('.case-report-card:visible')).toHaveCount(3);
  await caseReport.getByRole('button', { name: '仅阅读所选案例' }).click();
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.evaluate(() => { window.print = () => {}; });
  for (const [selected, other, id] of [[caseReport, classReport, 'case-report'], [classReport, caseReport, 'class-report']] as const) {
    await selected.getByRole('button', { name: '打印 / 保存为 PDF' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-print-report', id);
    await page.emulateMedia({ media: 'print' });
    await expect(selected).toBeVisible();
    if (id === 'case-report') await expect(selected.locator('.case-report-card:visible')).toHaveCount(3);
    await expect(other).toBeHidden();
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.case-editor')).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  }
  await page.getByRole('button', { name: '交付检查' }).click();
  const exportPanel = page.locator('.export-panel');
  await expect(exportPanel.locator('.release-scope')).toContainText('D01、D02、D03');
  const preflight = exportPanel.getByLabel('正式提交发布预检');
  await expect(preflight.getByRole('status')).toContainText('机器检查通过');
  await expect(preflight.getByRole('status')).toContainText('未完成的人工验收项');
  await preflight.getByLabel('内容负责人姓名').fill('E2E 内容负责人');
  await preflight.getByLabel('我已逐页审阅三案例和班级报告，确认事实、解释及限制').check();
  await expect(preflight.getByRole('button', { name: '下载正式提交包' })).toBeEnabled();
  const [submissionDownload] = await Promise.all([
    page.waitForEvent('download'),
    preflight.getByRole('button', { name: '下载正式提交包' }).click(),
  ]);
  const submissionPath = await submissionDownload.path();
  expect(submissionPath).toBeTruthy();
  const submissionCheck = spawnSync(pythonExecutable, ['-c', [
    'import hashlib, json, sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as z:',
    ' assert z.testzip() is None',
    ' manifest=json.loads(z.read("manifest.json"))',
    ' assert manifest["package_type"] == "competition_submission"',
    ' assert set(manifest["case_ids"]) == {"D01", "D02", "D03"}',
    ' cases=json.loads(z.read("case_reports.json"))',
    ' assert cases["status"] == "ready" and len(cases["cases"]) == 3',
    ' class_report=json.loads(z.read("class_report.json"))',
    ' assert {row["class_id"] for row in class_report["classes"]} == {"C1", "C2"}',
    ' assert len(json.loads(z.read("student_cases.json"))) == 3',
    ' assert all(row["学生编号"] in set(manifest["case_ids"]) for row in json.loads(z.read("raw_responses.json")))',
    ' checks=json.loads(z.read("release_checks.json"))',
    ' assert any(row["status"] == "not_checked" for row in checks)',
    ' sums=json.loads(z.read("checksums.json"))',
    ' assert set(sums) == set(z.namelist()) - {"checksums.json"}',
    ' assert all(hashlib.sha256(z.read(name)).hexdigest() == value for name, value in sums.items())',
    ' assert {"case_reports.json", "class_report.json", "submission-report.html", "submission.schema.json"}.issubset(z.namelist())',
  ].join('\n'), submissionPath!], { cwd: repoRoot, env: pythonEnvironment, encoding: 'utf8' });
  expect(submissionCheck.status, submissionCheck.stderr).toBe(0);
});

test('five primary pages and legacy aliases render on direct hash load, refresh, and history', async ({ page }) => {
  const routes = [
    ['/home', '开始'], ['/requirements', '学习要求'], ['/performance', '已有表现'],
    ['/recommendations', '学习建议'], ['/cases', '案例与交付'],
    ['/performance?view=student', '已有表现'], ['/performance?view=evidence', '已有表现'],
    ['/performance?view=quality', '已有表现'], ['/recommendations?view=observe', '学习建议'],
    ['/cases?view=report', '案例与交付'], ['/cases?view=check', '案例与交付'],
    ['/knowledge/indicators', '学习要求'], ['/insights/classes', '已有表现'],
    ['/insights/students', '已有表现'], ['/insights/evidence', '已有表现'],
    ['/insights/quality', '已有表现'], ['/plan/reviews', '学习建议'],
    ['/plan/adjustments', '学习建议'], ['/plan/cases', '案例与交付'],
  ] as const;
  expect(sampleCsvFiles()).toHaveLength(6);
  await page.goto('/#/home');
  const emptyState = page.getByRole('heading', { name: '先导入一份学情数据', level: 1 });
  await expect(emptyState.or(page.getByRole('heading', { name: '开始', level: 1 }))).toBeVisible();
  if (await emptyState.isVisible()) {
    await page.getByRole('main').getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
    await page.getByRole('button', { name: '检查文件并导入' }).click();
    await expect(page.locator('#message')).toContainText('数据已导入，当前运行已更新。');
  }
  for (const [hash, title] of routes) {
    const canonical = hash.startsWith('/knowledge/') ? '学习要求'
      : hash.startsWith('/insights/') ? '已有表现'
        : hash.startsWith('/plan/reviews') || hash.startsWith('/plan/adjustments') ? '学习建议'
          : hash.startsWith('/plan/cases') ? '案例与交付' : title;
    await page.goto(`/#${hash}`);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: canonical, exact: true })).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  }
  const activeRunId = await page.locator('.run-details-popover code').textContent();
  await page.goto(`/#/requirements?returnToCheck=1&checkId=source_signoffs&runId=${activeRunId}&caseId=D01&caseId=D02&caseId=D03&reportNodeId=N01`);
  await expect(page.locator('.repair-return-banner')).toContainText('来源核验');
  await page.getByRole('button', { name: '返回交付检查' }).click();
  await expect(page).toHaveURL(/#\/cases\?view=check&runId=[^&]+&reportNodeId=N01&caseId=D01&caseId=D02&caseId=D03$/);
  await expect(page.locator('.repair-return-banner')).toHaveCount(0);
  await page.goto('/#/cases?view=check&runId=previous-run&reportNodeId=OLD&caseId=D01&caseId=D02&caseId=D03');
  await expect(page.getByRole('status').filter({ hasText: '交付候选与报告节点来自其他数据批次' })).toBeVisible();
  await page.getByRole('button', { name: '重新选择案例' }).click();
  await expect(page.getByRole('status').filter({ hasText: '交付候选与报告节点来自其他数据批次' })).toHaveCount(0);
  await expect(page).toHaveURL(/#\/cases\?runId=[^&]+$/);
  await page.goto('/#/home');
  await page.getByRole('navigation', { name: '主要流程' }).getByRole('link', { name: '学习要求', exact: true }).click();
  await expect(page.getByRole('heading', { name: '学习要求', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: '开始', level: 1 })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: '学习要求', level: 1 })).toBeVisible();
  await page.goto('/#/made-up-route');
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByRole('heading', { name: '开始', level: 1 })).toBeVisible();
});

test('keyboard focus and accessible names are available across all routes', async ({ page }) => {
  let gradientTextSamples = 0;
  const routes = [
    ['/home', '开始'],
    ['/knowledge/indicators', '学习要求'],
    ['/insights/classes', '已有表现'],
    ['/insights/students', '已有表现'],
    ['/insights/evidence', '已有表现'],
    ['/insights/quality', '已有表现'],
    ['/plan/reviews', '学习建议'],
    ['/recommendations?view=observe', '学习建议'],
    ['/plan/cases', '案例与交付'],
  ] as const;

  expect(sampleCsvFiles(bundlePath)).toHaveLength(6);
  await page.goto('/#/home');
  const emptyState = page.getByRole('heading', { name: '先导入一份学情数据', level: 1 });
  await expect(emptyState.or(page.getByRole('heading', { name: '开始', level: 1 }))).toBeVisible();
  if (await emptyState.isVisible()) {
    await page.getByRole('main').getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
    await page.getByRole('button', { name: '检查文件并导入' }).click();
    await expect(page.locator('#message')).toContainText('数据已导入，当前运行已更新。');
  }

  for (const [route, title] of routes) {
    if (route === '/recommendations?view=observe') {
      await page.route('**/api/teaching-adjustments', request => request.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{
          adjustment_id: 'keyboard-audit-adjustment', student_id: 'D01', indicator_id: 'T01I1', origin_run_id: 'keyboard-audit-origin', origin_node_id: 'N01', review_version: 1,
          planned_activity: '按步骤完成同类练习', planned_practice: ['Q001 变式'], observation_points: ['记录关键步骤'], teacher: '审核教师', planned_at: '2026-11-19',
          implementation: '完成课堂讲解', implementation_status: 'completed', outcome_observations: '记录独立作答步骤', followup_run_id: 'keyboard-audit-followup', followup_node_id: 'N01', followup_evidence_record_ids: ['R2'],
          comparability: 'not_comparable', comparability_reason: '测量范围不同', teacher_conclusion: '仅记录观察，不推断效果', reviewer: '审核教师', concluded_at: '2026-11-19', created_at: '2026-11-19T00:00:00Z', updated_at: '2026-11-19T00:00:00Z',
          history: [{ implementation: '完成课堂讲解', implementation_status: 'completed', outcome_observations: '记录独立作答步骤', followup_run_id: 'keyboard-audit-followup', followup_node_id: 'N01', followup_evidence_record_ids: ['R2'], comparability: 'not_comparable', comparability_reason: '测量范围不同', teacher_conclusion: '仅记录观察，不推断效果', reviewer: '审核教师', concluded_at: '2026-11-19', updated_at: '2026-11-19T00:00:00Z' }],
        }]),
      }));
    }
    await page.goto(`/#${route}`);
    await page.reload();
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    if (route === '/insights/classes') {
      await page.getByLabel('测验节点').selectOption('N01');
    }
    if (route === '/knowledge/indicators') {
      await page.locator('.ai-analysis-disclosure').locator('summary').click();
      await expect(page.getByRole('button', { name: '生成 AI 分析' })).toBeVisible();
      await expect(page.locator('.warn')).toContainText('指标关系状态：待核验');
      await expect(page.getByText('材料目录与来源文件核验')).toBeVisible();
    }
    if (route === '/plan/reviews') {
      await page.getByLabel('学生').selectOption('D01');
      await page.getByLabel('测验节点').selectOption('N01');
      await page.getByRole('button', { name: '生成规则草稿' }).click();
      await expect(page.getByRole('heading', { name: '教师复核内容' })).toBeVisible();
      const proposedActivity = page.locator('.proposed-activity');
      if (await proposedActivity.count()) await proposedActivity.locator('summary').click();
      const structuredPlan = page.locator('.review-structured');
      await structuredPlan.locator('summary').click();
      const savePlan = structuredPlan.getByLabel(/保存.*方案/);
      if (await savePlan.count()) await savePlan.check();
      const firstEvidence = page.locator('.review-record').first();
      if (await firstEvidence.count()) await firstEvidence.locator('summary').click();
    }
    if (route === '/recommendations?view=observe') {
      await expect(page.getByLabel('选择记录')).toHaveValue('keyboard-audit-adjustment');
      await page.locator('details').filter({ hasText: '选择后续证据' }).locator('summary').click();
      await page.locator('details').filter({ hasText: '实施与复核历史' }).locator('summary').click();
    }
    if (route === '/plan/cases') {
      await page.locator('.case-editor').getByText(/^(开始|更新)案例签核$/).click();
    }
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    const findings = await page.locator('body').evaluate((body) => {
      const selector = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex="-1"])';
      const elements = [...body.querySelectorAll<HTMLElement>(selector)].filter((element) => {
        const style = getComputedStyle(element);
        const closedDetails: HTMLDetailsElement[] = [];
        let ancestor: Element | null = element;
        while (ancestor) {
          if (ancestor.matches('details:not([open])')) closedDetails.push(ancestor as HTMLDetailsElement);
          ancestor = ancestor.parentElement;
        }
        const hiddenByClosedDetails = closedDetails.some((details) => details !== element.parentElement
          || element.tagName !== 'SUMMARY');
        return !element.matches(':disabled')
          && element.tabIndex >= 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && element.getClientRects().length > 0
          && !hiddenByClosedDetails
          && element.closest('[aria-hidden="true"], [inert]') === null;
      });
      const unnamed = elements.filter((element) => {
        const labelledBy = element.getAttribute('aria-labelledby')
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent || '')
          .join(' ');
        const labels = (element as HTMLInputElement).labels;
        const labelText = [...(labels || [])].map((label) => label.textContent || '').join(' ')
          || element.closest('label')?.textContent
          || '';
        const text = `${element.textContent || ''} ${element.getAttribute('title') || ''} ${labelText} ${element.getAttribute('aria-label') || ''} ${labelledBy || ''}`.trim();
        return !text;
      }).map((element) => `${element.tagName.toLowerCase()}${element.type ? `[type=${element.type}]` : ''}`);
      elements.forEach((element, index) => { element.dataset.keyboardAuditIndex = String(index); });
      const contrast = (color: string) => {
        if (color.startsWith('#')) {
          const hex = color.slice(1);
          const expanded = hex.length === 3 ? [...hex].map((value) => value + value).join('') : hex;
          if (expanded.length < 6) return null;
          return [0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16)).concat(1);
        }
        const values = color.match(/[\d.]+/g)?.map(Number);
        return values && values.length >= 3 ? [values[0], values[1], values[2], values[3] ?? 1] : null;
      };
      const composite = (foreground: number[], background: number[]) => [
        foreground[0] * foreground[3] + background[0] * (1 - foreground[3]),
        foreground[1] * foreground[3] + background[1] * (1 - foreground[3]),
        foreground[2] * foreground[3] + background[2] * (1 - foreground[3]),
        1,
      ];
      const luminance = (values: number[]) => {
        const channels = values.slice(0, 3).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      let gradientTextCount = 0;
      const contrastIssues = [...body.querySelectorAll<HTMLElement>('*')].flatMap((element) => {
        const text = [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent || '')
          .join(' ')
          .trim();
        if (!text || element.matches(':disabled') || element.closest(':disabled, [aria-hidden="true"], [inert]') || element.getClientRects().length === 0) return [];
        const style = getComputedStyle(element);
        const size = Number.parseFloat(style.fontSize);
        const largeText = size >= 24 || (size >= 18.66 && Number.parseFloat(style.fontWeight) >= 700);
        let foreground = contrast(style.color);
        let background = [255, 255, 255, 1];
        let ancestor: HTMLElement | null = element;
        const gradientStops: number[][] = [];
        while (ancestor) {
          const layer = getComputedStyle(ancestor);
          if (layer.backgroundImage.includes('gradient')) {
            const colors = layer.backgroundImage.match(/rgba?\([^)]*\)|#[\da-fA-F]{3,8}/g) ?? [];
            gradientStops.push(...colors.map(contrast).filter((color): color is number[] => color !== null));
          }
          const color = contrast(layer.backgroundColor);
          if (color && color[3] > 0) background = composite(color, background);
          if (color && color[3] >= 1) break;
          ancestor = ancestor.parentElement;
        }
        if (gradientStops.length) gradientTextCount += 1;
        if (!foreground) return [];
        const textColor = composite(foreground, background);
        const backgrounds = [background, ...gradientStops.map((stop) => composite(stop, background))];
        const ratio = Math.min(...backgrounds.map((candidate) => {
          const [dark, light] = [luminance(textColor), luminance(candidate)].sort((a, b) => a - b);
          return (light + 0.05) / (dark + 0.05);
        }));
        return ratio < (largeText ? 3 : 4.5)
          ? [{ text: text.slice(0, 50), color: style.color, background: getComputedStyle(element).backgroundColor, ratio: Number(ratio.toFixed(2)), size, weight: style.fontWeight, tag: element.tagName, className: element.className, disabled: element.matches(':disabled'), cursor: style.cursor, opacity: style.opacity, html: element.outerHTML.slice(0, 180) }]
          : [];
      });
      return {
        count: elements.length,
        unnamed,
        contrastIssues,
        gradientTextCount,
        order: elements.map((element, index) => ({
          index,
          tag: element.tagName.toLowerCase(),
          className: element.className,
          tabIndex: element.tabIndex,
          text: (element.innerText || element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 60),
          parent: element.tagName === 'SUMMARY' ? element.parentElement?.outerHTML.slice(0, 240) : '',
        })),
      };
    });
    gradientTextSamples += findings.gradientTextCount;
    expect(findings.unnamed, `${title} contains unnamed controls`).toEqual([]);
    expect(findings.contrastIssues, `${title} has text below the WCAG AA contrast threshold: ${JSON.stringify(findings.contrastIssues)}`).toEqual([]);

    await page.locator('a.brand').focus();
    const initialFocus = await page.evaluate(() => ({
      index: (document.activeElement as HTMLElement | null)?.dataset.keyboardAuditIndex ?? 'none',
      outlineWidth: getComputedStyle(document.activeElement as HTMLElement).outlineWidth,
    }));
    expect(initialFocus.index, `${title} should expose a keyboard entry point`).toBe('0');
    expect(initialFocus.outlineWidth, `${title} entry point needs a visible focus outline`).toBe('3px');
    const reached = new Set<string>([initialFocus.index]);
    const expected = new Set(Array.from({ length: findings.count }, (_, index) => String(index)));
    for (let step = 0; step < findings.count * 4 + 12; step += 1) {
      await page.keyboard.press('Tab');
      const active = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        return {
          index: element?.dataset.keyboardAuditIndex ?? 'none',
          outlineWidth: element ? getComputedStyle(element).outlineWidth : 'none',
        };
      });
      if (active.index === 'none') {
        const missing = [...expected].filter((index) => !reached.has(index)).map((index) => findings.order[Number(index)]);
        expect([...reached].sort(), `${title} focus left the page before every control was reached; missing=${JSON.stringify(missing)}`).toEqual([...expected].sort());
        break;
      }
      expect(expected.has(active.index), `${title} focus landed outside the visible control set`).toBe(true);
      expect(active.outlineWidth, `${title} control ${active.index} needs a visible focus outline`).toBe('3px');
      const completedCycle = reached.has(active.index) && active.index === '0';
      reached.add(active.index);
      if (reached.size === expected.size || completedCycle) break;
    }
    expect([...reached].sort(), `${title} keyboard traversal should reach every visible control`).toEqual([...expected].sort());
  }
  expect(gradientTextSamples, 'gradient backgrounds should be included in endpoint contrast sampling').toBeGreaterThan(0);
});

test('keyboard users can open and close import, and get an announced validation error', async ({ page }) => {
  await page.goto('/#/home');
  const emptyState = page.getByRole('heading', { name: '先导入一份学情数据', level: 1 });
  const overview = page.getByRole('heading', { name: '开始', level: 1 });
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
  const overview = page.getByRole('heading', { name: '开始', level: 1 });
  await expect(emptyState.or(overview)).toBeVisible();
  if (await emptyState.isVisible()) {
    expect(sampleCsvFiles()).toHaveLength(6);
    await page.getByRole('main').getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
    await page.getByRole('button', { name: '检查文件并导入' }).click();
    await expect(page.locator('#message')).toContainText('数据已导入，当前运行已更新。');
  }
  await page.goto('/#/cases?view=report');
  await page.getByLabel('报告案例 1').selectOption('D01');
  await page.getByLabel('报告案例 2').selectOption('D02');
  await page.getByLabel('报告案例 3').selectOption('D03');
  await page.getByRole('button', { name: '交付检查' }).click();
  await page.getByRole('button', { name: '下载草稿成果包' }).click();
  await expect(page.getByRole('alert')).toContainText('模拟导出服务错误');
  await expect(page).toHaveURL(/#\/cases\?view=check/);
});

test('slow review requests reject stale drafts and keep generation and save single-flight', async ({ page }) => {
  await page.goto('/#/home');
  const emptyState = page.getByRole('heading', { name: '先导入一份学情数据', level: 1 });
  const overview = page.getByRole('heading', { name: '开始', level: 1 });
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
  await page.goto('/#/recommendations');
  await page.getByLabel('学生').selectOption('D01');
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

test('key pages fit on desktop and mobile, with keyboard access to navigation', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/#/home');
  const emptyState = page.getByRole('heading', { name: '先导入一份学情数据', level: 1 });
  const overview = page.getByRole('heading', { name: '开始', level: 1 });
  await expect(emptyState.or(overview)).toBeVisible();
  if (await emptyState.isVisible()) {
    expect(sampleCsvFiles()).toHaveLength(6);
    await page.getByRole('main').getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
    await expect(page.locator('.first-run .card form [role="status"]')).toContainText('6 个文件');
    await page.getByRole('button', { name: '检查文件并导入' }).click();
    await expect(page.locator('#message')).toContainText('数据已导入，当前运行已更新。');
  }

  const pages = [
    ['/home', '开始'],
    ['/requirements', '学习要求'],
    ['/performance', '已有表现'],
    ['/recommendations', '学习建议'],
    ['/cases', '案例与交付'],
  ] as const;
  for (const width of [390, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, title] of pages) {
      await page.goto(`/#${route}`);
      await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
      if (route === '/performance') {
        await page.getByLabel('测验节点').selectOption('N01');
      }
      if (route === '/recommendations') {
        await page.getByLabel('学生').selectOption('D01');
        await page.getByLabel('测验节点').selectOption('N01');
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
  await page.setViewportSize({ width: 390, height: 900 });
  const mobileMenu = page.getByRole('button', { name: '导航', exact: true });
  const nav = page.getByRole('complementary', { name: '主导航' });
  await expect(nav).toBeHidden();
  await mobileMenu.focus();
  await mobileMenu.press('Enter');
  await expect(mobileMenu).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('link', { name: '案例与交付', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(mobileMenu).toBeFocused();
  await mobileMenu.press('Enter');
  await nav.getByRole('link', { name: '已有表现', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已有表现', level: 1 })).toBeFocused();
  await expect(nav).toBeHidden();

  const screenshotScan = spawnSync(pythonExecutable, ['scan-artifacts.py', testInfo.outputDir], { cwd: repoRoot, env: pythonEnvironment, encoding: 'utf8' });
  expect(screenshotScan.status, screenshotScan.stdout + screenshotScan.stderr).toBe(0);
  expect(pageErrors).toEqual([]);
});
