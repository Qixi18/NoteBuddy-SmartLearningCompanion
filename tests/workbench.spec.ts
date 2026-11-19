import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const bundlePath = path.join(repoRoot, 'data', `playwright-${process.env.PLAYWRIGHT_RUN_ID}`, 'bundle');

function sampleCsvFiles(): string[] {
  const python = spawnSync('python', ['-c', [
    'import csv, sys',
    'from pathlib import Path',
    'sys.path.insert(0, str(Path("apps/backend/tests").resolve()))',
    'from test_core import sample_tables',
    'from app.services.analysis import TABLES',
    'target = Path(sys.argv[1]); target.mkdir(parents=True, exist_ok=True)',
    'tables = sample_tables()',
    'for name, required in TABLES.items():',
    ' rows = tables.get(name, [])',
    ' fields = list(dict.fromkeys(required + [key for row in rows for key in row if not key.startswith("_")]))',
    ' with (target / f"{name}.csv").open("w", encoding="utf-8-sig", newline="") as stream:',
    '  writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore"); writer.writeheader(); writer.writerows(rows)',
  ].join('\n'), bundlePath], { cwd: repoRoot, encoding: 'utf8' });
  if (python.status !== 0) throw new Error(`Unable to generate sample CSV bundle: ${python.stderr}`);
  return readdirSync(bundlePath)
    .filter((name) => name.endsWith('.csv'))
    .map((name) => path.join(bundlePath, name));
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
  const files = sampleCsvFiles();
  expect(files).toHaveLength(6);
  await page.getByRole('main').getByLabel('选择 CSV 文件夹').setInputFiles(bundlePath);
  await expect(page.locator('.first-run .card form [role="status"]')).toContainText('6 个文件');
  await page.getByRole('button', { name: '检查文件并导入' }).click();

  await expect(page.getByRole('heading', { name: '全局概览' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('数据已导入，当前运行已更新。');
  await expect(page.getByText('还没有可查看的分析运行')).toHaveCount(0);
  await expect(page.getByText('请求失败 (500)')).toHaveCount(0);

  await page.getByRole('link', { name: '学科知识' }).click();
  await expect(page.getByRole('heading', { name: '学习要求与来源' })).toBeVisible();
  await expect(page.getByText('请求失败 (500)')).toHaveCount(0);

  await page.getByRole('link', { name: '学情洞察' }).click();
  await expect(page.getByRole('heading', { name: '班级概览' })).toBeVisible();
  await page.getByLabel('测验节点').selectOption('N01');
  await expect(page.getByText('C1 · 节点 N01')).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.getByRole('link', { name: '教学方案' }).click();
  await expect(page.getByRole('heading', { name: '建议复核', exact: true })).toBeVisible();
  await page.getByLabel('测验节点').selectOption('N01');
  const scopeControls = page.locator('.scope-fields select');
  await expect(scopeControls).toHaveCount(3);
  for (const control of await scopeControls.all()) {
    expect((await control.boundingBox())?.width ?? 0).toBeGreaterThan(300);
  }
  await page.getByRole('button', { name: '生成规则草稿' }).click();
  await expect(page.getByRole('heading', { name: '教师复核内容' })).toBeVisible();
  await expect(page.getByText('未确认 · 请核对左侧证据和来源边界')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('all eight routes render on direct hash load, refresh, history, and unknown hashes', async ({ page }) => {
  const routes = [
    ['/home', '全局概览'],
    ['/knowledge/indicators', '学习要求与来源'],
    ['/insights/classes', '班级概览'],
    ['/insights/students', '学生分析'],
    ['/insights/evidence', '作答证据'],
    ['/insights/quality', '数据质量'],
    ['/plan/reviews', '建议复核'],
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
