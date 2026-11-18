import type { AnalysisRun } from '../../../api/types';
import { Panel } from '../../../components/Panel';
import { dispositionLabel, findingLabel, severityLabel } from '../qualityLabels';

type EvidenceScope = { studentId: string; indicatorId: string; nodeId: string };

export function QualityPanel({ run, onOpenEvidence }: { run: AnalysisRun; onOpenEvidence?: (scope: EvidenceScope) => void }) {
  const quality = run.quality;
  const rows = run.raw_responses ?? run.responses;
  const locateRecord = (recordId: string | null, sourceLine: number | null) => {
    const record = rows.find(item => item['记录编号'] === recordId && (sourceLine == null || item._source_line === sourceLine));
    if (!record) return undefined;
    const item = run.items.find(entry => entry['材料编号'] === record['材料编号']);
    return item?.['指标编号'] ? { studentId: record['学生编号'], indicatorId: item['指标编号'], nodeId: record['节点编号'] } : undefined;
  };
  const actionable = quality.findings.filter(item => item.severity === 'WARN' || item.severity === 'ERROR');
  const informational = quality.findings.filter(item => !item.severity || item.severity === 'INFO');
  const counts = Object.entries(quality.disposition_counts ?? {});

  return <Panel title="数据质量与处置">
    <p className="muted">这里区分原始作答行、处理后的事件和最终用于评分的记录。待评分与旧修订属于处理状态；只有真实校验冲突需要人工核查。</p>
    <div className="quality-overview" aria-label="质量概况">
      <div className="quality-metric"><span>原始作答行</span><strong>{quality.raw_rows}</strong></div>
      <div className="quality-metric"><span>逻辑事件</span><strong>{quality.events}</strong></div>
      <div className="quality-metric"><span>选中修订</span><strong>{quality.selected_revisions}</strong></div>
      <div className="quality-metric"><span>有效评分</span><strong>{quality.eligible_scored}</strong></div>
    </div>

    <section className="quality-group" aria-labelledby="quality-dispositions-title">
      <h3 id="quality-dispositions-title">记录如何进入分析 <span className="quality-helper">状态口径分开统计</span></h3>
      {counts.length ? <div className="quality-counts">{counts.map(([name, count]) => <span className={`quality-count-${name}`} key={name}>{dispositionLabel(name)} · {count}</span>)}</div> : <p className="muted">当前运行没有逐行处置摘要。</p>}
      {quality.event_disposition_counts && <p className="muted"><strong>最终事件处置：</strong>{Object.entries(quality.event_disposition_counts).map(([name, count]) => `${dispositionLabel(name)} ${count}`).join(' · ')}</p>}
    </section>

    <section className="quality-group" aria-labelledby="quality-action-title">
      <h3 id="quality-action-title"><span className="severity-dot severity-error" aria-hidden="true" />需要核查 <span className="tag">{actionable.length}</span></h3>
      {actionable.length ? actionable.map((finding, index) => {
        const scope = locateRecord(finding.record_id, finding.source_line);
        return <article className="quality-finding" key={`${finding.code}:${finding.record_id}:${finding.source_line}:${index}`}>
          <span className="severity-dot severity-error" aria-hidden="true" />
          <div><strong>{findingLabel(finding.code)}</strong><p>{finding.detail}</p><small>{finding.record_id ? `记录 ${finding.record_id} · ` : ''}{finding.event_id ? `事件 ${finding.event_id} · ` : ''}{finding.source_file || '作答记录.csv'} 第 {finding.source_line ?? '未知'} 行 · {severityLabel(finding.severity)}</small><div className="quality-raw">技术代码：{finding.code} · 处置：{dispositionLabel(finding.disposition)}</div></div>
          {scope && onOpenEvidence && <button className="secondary" onClick={() => onOpenEvidence(scope)}>查看作答</button>}
        </article>;
      }) : <p className="empty-inline">当前快照没有需要人工处理的质量异常。</p>}
    </section>

    {informational.length > 0 && <section className="quality-group" aria-labelledby="quality-info-title">
      <h3 id="quality-info-title"><span className="severity-dot severity-info" aria-hidden="true" />正常处理与补充信息 <span className="tag">{informational.length}</span></h3>
      {informational.map((finding, index) => <article className="quality-finding" key={`${finding.code}:${finding.record_id}:${finding.source_line}:${index}`}><span className="severity-dot severity-info" aria-hidden="true" /><div><strong>{findingLabel(finding.code)}</strong><p>{finding.detail}</p><small>{finding.record_id ? `记录 ${finding.record_id} · ` : ''}{finding.source_file || '作答记录.csv'} 第 {finding.source_line ?? '未知'} 行</small><div className="quality-raw">技术代码：{finding.code}</div></div></article>)}
    </section>}

    {quality.raw_status_counts && <details className="quality-details"><summary>原始行评分状态</summary><div className="quality-counts">{Object.entries(quality.raw_status_counts).map(([name, count]) => <span key={name}>{name || '空状态'} · {count}</span>)}</div><p className="muted">原始行状态包含旧修订；与逻辑事件和有效评分的数量口径不同。</p></details>}
    {quality.record_dispositions && <details className="quality-details"><summary>逐行处置明细</summary><div className="list">{quality.record_dispositions.map((row, index) => <div className="quality-finding" key={`${row.source_line}:${index}`}><span className={`status-badge status-${row.disposition}`}>{dispositionLabel(row.disposition)}</span><div><strong>{row.record_id ?? '缺少记录编号'} · {row.event_id ?? '未关联事件'} · 第 {row.source_line} 行 · {row.disposition}</strong><small>{row.source_file || '作答记录.csv'} · {dispositionLabel(row.disposition)}</small></div></div>)}</div></details>}
  </Panel>;
}
