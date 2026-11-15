import type { AnalysisRun } from '../api/types';
import { Panel } from '../components/Panel';
export function EvidencePanel({ run, student, indicator }: { run: AnalysisRun; student: string; indicator: string }) {
  const ids = new Set(run.items.filter(item => item['指标编号'] === indicator).map(item => item['材料编号']));
  const records = run.responses.filter(row => row['学生编号'] === student && ids.has(row['材料编号']));
  return <Panel title="作答证据与评分点">{records.length ? records.map((row, index) => {
    const item = run.items.find(entry => entry['材料编号'] === row['材料编号']);
    return <details className="row" key={`${row['记录编号']}-${index}`}><summary>{row['记录编号']} · {row['材料编号']} · {row['评分状态']} · {row['得分']}/{row['满分']} · 修订 {row['修订版本']}</summary>
      <p>题目：{item?.['题干或内容']}</p><p>最终作答：{row['学生最终作答']}</p><pre>{row['解答过程']}</pre><p>评分点要求：{item?.['评分点']}</p><p>评分点得分：{row['评分点得分']}</p><small>原始 CSV 第 {row._source_line} 行</small>
    </details>;
  }) : <p className="muted">没有该指标作答记录。</p>}</Panel>;
}
