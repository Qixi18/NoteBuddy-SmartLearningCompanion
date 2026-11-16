import type { AnalysisRun } from '../../../api/types';
import { Panel } from '../../../components/Panel';
export function QualityPanel({ run }: { run: AnalysisRun }) {
  const q = run.quality;
  return <Panel title="数据质量"><div className="stat">{q.raw_rows} 行 / {q.events} 事件</div><p>有效已评分 {q.eligible_scored} 条 · 选中版本 {q.selected_revisions} 条</p>
    {Object.entries(q.finding_counts).map(([name, count]) => <div className="row" key={name}><span className="tag">{name}</span> {count}</div>)}
    <details><summary>查看质量记录与原始行号</summary><div className="list">{q.findings.map((finding, i) => <div className="row" key={i}>{String(finding.record_id)} · 第 {String(finding.source_line)} 行 · {String(finding.detail)}</div>)}</div></details>
  </Panel>;
}
