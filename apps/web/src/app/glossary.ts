// 教师语言词表与展示格式化工具。
// 界面文案统一从这里取：术语口径改一处即全站生效，避免组件里散落工程语汇。

import type { AnalysisRun } from '../api/types';

type RunNode = AnalysisRun['nodes'][number];

// 测验节点下拉与范围条的展示标签：编号 · 日期 · 已教主题。
export function nodeLabel(node: RunNode): string {
  const id = node['节点编号'];
  const rawDate = node['模拟测验日期']?.trim() ?? '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? `${Number(rawDate.slice(5, 7))}月${Number(rawDate.slice(8, 10))}日`
    : rawDate;
  const taught = node['已教及测量主题']?.trim() ?? '';
  return [id, date, taught ? `已教 ${taught}` : ''].filter(Boolean).join(' · ');
}

// 课标双页码定位的人话格式："62／55" → "课标文件第 62 页（正文第 55 页）"。
export function curriculumLocatorLabel(value: string): string {
  const match = /^(\d+)\s*／\s*(\d+)$/.exec(value.trim());
  if (!match) return value;
  return `课标文件第 ${match[1]} 页（正文第 ${match[2]} 页）`;
}

// 得分率的统一展示口径：无分母时明确说明，而不是显示 0%。
export function percentLabel(score: number | null, maximum: number | null): string {
  if (maximum == null || score == null || maximum <= 0) return '无有效分母';
  return `${((score / maximum) * 100).toFixed(1)}%`;
}
