import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';

/** 演示数据的固定范围：两个班、两个节点，C1 在 T02 上偏弱。 */
export const DEMO = {
  classId: 'C1',
  otherClassId: 'C2',
  nodeId: 'N01',
  otherNodeId: 'N02',
  studentId: 'D01',
};

export const allRoutes = [
  { path: '/', title: '教学工作台' },
  { path: '/knowledge/overview', title: '课程知识' },
  { path: '/knowledge/structure', title: '课程知识' },
  { path: '/knowledge/items', title: '课程知识' },
  { path: '/diagnosis/class', title: '班级诊断' },
  { path: '/diagnosis/student', title: '学生个人诊断' },
  { path: '/diagnosis/evidence', title: '题目证据详情' },
  { path: '/teaching/student', title: '学生个性化学习建议' },
  { path: '/teaching/class', title: '班级教学建议' },
] as const;

function demoCsvPath(): string {
  return path.resolve(process.cwd(), 'demo-data', 'csv');
}

export function demoCsvNames(): string[] {
  return readdirSync(demoCsvPath()).filter(name => name.endsWith('.csv')).sort();
}

export function demoCsvPayloads() {
  return demoCsvNames().map(name => ({
    name,
    mimeType: 'text/csv',
    buffer: readFileSync(path.join(demoCsvPath(), name)),
  }));
}

/**
 * 保证后端存在一次演示运行。
 * 通过前端代理直接调用导入接口，避免依赖九个 spec 的执行顺序。
 */
export async function ensureDemoRun(request: APIRequestContext): Promise<string> {
  const current = await request.get('/api/run');
  if (current.ok()) return (await current.json()).run_id as string;
  const files: Record<string, string> = {};
  for (const name of demoCsvNames()) {
    // 演示 CSV 以 UTF-8 BOM 保存；后端会再按 utf-8-sig 写入，先去掉 BOM 避免字段名被污染。
    files[name] = readFileSync(path.join(demoCsvPath(), name), 'utf8').replace(/^\uFEFF/, '');
  }
  const imported = await request.post('/api/import-files', {
    data: { files, pdf_files: {} },
  });
  if (!imported.ok()) {
    throw new Error(`导入演示数据失败：${imported.status()} ${await imported.text()}`);
  }
  return (await imported.json()).run_id as string;
}

export async function waitForScope(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const query = hash.split('?')[1] ?? '';
    const params = new URLSearchParams(query);
    return Boolean(params.get('node') && params.get('class'));
  });
}

/** 应用使用 Hash 路由：范围参数在 #/path?node=... 里，而不是 URL 的 search。 */
export function hashSearch(page: Page): URLSearchParams {
  const hash = page.url().split('#')[1] ?? '';
  return new URLSearchParams(hash.split('?')[1] ?? '');
}

export async function gotoRoute(page: Page, route: string, title: string): Promise<void> {
  await page.goto(`/#${route}`);
  await page.getByRole('heading', { level: 1, name: title }).waitFor();
  await waitForScope(page);
}
