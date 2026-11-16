import type { AnalysisRun } from '../../../api/types';
import { Panel } from '../../../components/Panel';
export function QualityPanel({ run }: { run: AnalysisRun }) {
  const q = run.quality;
  return <Panel title="数据质量"><div className="stat">{q.raw_rows} 行 / {q.events} 事件</div><p>有效已评分 {q.eligible_scored} 条 · 选中版本 {q.selected_revisions} 条</p>
    {q.disposition_counts && <><h3>原始行处置</h3><div className="row">{Object.entries(q.disposition_counts).map(([name, count]) => <span className="tag" key={name}>{name} {count}　</span>)}</div></>}
    {q.event_disposition_counts && <p>最终事件处置：{Object.entries(q.event_disposition_counts).map(([name, count]) => `${name} ${count}`).join(' · ')}</p>}
    {q.raw_status_counts && <p>原始行评分状态（含旧修订）：{Object.entries(q.raw_status_counts).map(([name, count]) => `${name || '空状态'} ${count}`).join(' · ')}</p>}
    {Object.entries(q.finding_counts).map(([name, count]) => <div className="row" key={name}><span className="tag">{name}</span> {count}</div>)}
    {q.record_dispositions && <details><summary>逐行处置明细</summary><div className="list">{q.record_dispositions.map((row, i) => <div className="row" key={`${row.source_line}-${i}`}>{row.record_id ?? '缺少记录编号'} · {row.event_id ?? '无事件编号'} · 第 {row.source_line ?? '未知'} 行 · {row.disposition}</div>)}</div></details>}
    <details><summary>查看质量记录与原始行号</summary><div className="list">{q.findings.map((finding, i) => <div className="row" key={i}>{finding.severity ?? '未分级'} · {String(finding.record_id ?? '缺少记录编号')} · 第 {String(finding.source_line ?? '未知')} 行 · {finding.disposition ?? '未处置'} · {String(finding.detail)}</div>)}</div></details>
  </Panel>;
}
