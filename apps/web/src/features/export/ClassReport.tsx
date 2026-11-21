import { useEffect, useState } from 'react';
import type { AnalysisRun, CompetitionClassReport } from '../../api/types';
import { learningApi } from '../../api/client';
import { Panel } from '../../components/Panel';
import { printReport } from './printReport';
import { nodeLabel } from '../../app/glossary';

export function ClassReport({ run, node, onNode }: { run: AnalysisRun; node: string; onNode: (node: string) => void }) {
  const [result, setResult] = useState<{ node: string; report?: CompetitionClassReport; error?: string }>();
  const current = result?.node === node ? result : undefined;
  const report = current?.report;

  useEffect(() => {
    if (!node) return;
    let active = true;
    setResult(undefined);
    learningApi.classReport(node).then(value => {
      if (active) setResult(value.run_id === run.run_id && value.node_id === node ? { node, report: value } : { node, error: '报告范围已变化，请刷新后重试。' });
    }).catch(reason => {
      if (active) setResult({ node, error: reason instanceof Error ? reason.message : String(reason) });
    });
    return () => { active = false; };
  }, [node, run.run_id]);

  return <Panel id="class-report" title="两班对照阅读报告" className="competition-class-report report-view">
    <div className="report-toolbar"><p>共性观察、共同题目口径和覆盖范围来自当前运行的班级证据。</p><div><label>报告节点 <select aria-label="班级报告节点" value={node} onChange={event => onNode(event.target.value)}>{run.nodes.map(item => <option key={item['节点编号']} value={item['节点编号']}>{nodeLabel(item)}</option>)}</select></label><button className="secondary" disabled={!report || report.status !== 'ready'} onClick={() => printReport('class-report')}>打印 / 保存为 PDF</button></div></div>
    {current?.error && <p role="alert" className="error">报告读取失败：{current.error}</p>}
    {node && !current && <p role="status" className="muted">正在读取 {node} 的班级报告…</p>}
    {report && <div className="class-report-content"><header><span className="eyebrow">运行 {report.run_id} · 节点 {report.node_id}</span><h3>班级共性、差异与覆盖</h3></header>
      <div className="class-coverage-grid">{report.classes.map(item => <article key={item.class_id}><strong>{item.class_id}</strong><span>{item.student_count} 名学生</span><small>{item.scored_record_count} 条有效评分记录</small><small>全班名单：{item.student_ids.join('、') || '无'}</small></article>)}</div>
      <section><h4>可比表现与共同题目</h4>{report.comparisons.length ? report.comparisons.map(item => <article className="class-comparison" key={item.indicator_id}><header><h5>{item.indicator_id}</h5><span>{item.status === 'available' ? `共同题目：${item.common_material_ids.join('、')}` : '没有两个班共同观察的题目，暂不可比'}</span></header>{item.classes.map(group => <p key={group.class_id}><strong>{group.class_id}</strong>：有效评分覆盖 {group.observed_student_count} 人 / {group.scored_record_count} 条；全部已观察题目得分率 {group.ratio === null ? '不可用' : `${(group.ratio * 100).toFixed(1)}%`}；共同题目得分率 {group.common_ratio === null ? '不可比' : `${(group.common_ratio * 100).toFixed(1)}%`}（{group.common_record_count} 条）</p>)}<p>共同题目得分率差异：{item.difference === null ? '不可计算' : `${(item.difference * 100).toFixed(1)} 个百分点`}</p></article>) : <p>当前节点没有可比较的指标数据。</p>}</section>
      <section><h4>跨班共性问题</h4>{report.common_observations.length ? report.common_observations.map(issue => <article className="class-issue" key={`${issue.indicator_id}:${issue.issue_id}`}><h5>{issue.indicator_id} · {issue.label}</h5>{issue.by_class.map(group => <p key={group.class_id}><strong>{group.class_id}</strong>：{group.affected_count} 名学生有已核验评分点证据（观察分母 {group.observed_student_count} 人）；来源 {group.evidence_refs.map(ref => `${ref.material_id} / ${ref.record_id} / 第 ${ref.source_line ?? '?'} 行`).join('、') || '无'}</p>)}</article>) : <p>当前来源签核和评分点证据未形成跨班共性问题；不能据此断言不存在共性困难。</p>}</section>
      <section><h4>指标与材料来源映射</h4>{Object.entries(report.source_mappings ?? {}).map(([indicator, mapping]) => <article className="class-comparison" key={indicator}><h5>{indicator} · {mapping.status} · 可用 {mapping.usable_count} 条 / 待处理 {mapping.needs_resolution_count} 条</h5>{mapping.mappings.map((row, index) => <details key={`${row.material_id}-${index}`}><summary>{row.material_id} · {row.relation} · {row.status}</summary><p>{row.explanation}</p>{row.evidence.map((ref, refIndex) => <blockquote key={refIndex}>{ref.source}{ref.page ? ` · 第 ${ref.page} 页` : ''}{ref.line ? ` · 第 ${ref.line} 行` : ''}：{ref.excerpt}</blockquote>)}</details>)}{mapping.validation_errors?.map(error => <small key={error}>{error}</small>)}</article>)}</section>
      <section className="report-limitation-section"><h4>比较范围与限制</h4><ul>{report.limitations.map(item => <li key={item}>{item}</li>)}</ul><p>全题集得分率受实际作答覆盖影响；跨班差异只在共同观察题目上计算，不表示因果关系、显著性或整体能力排名。</p></section>
    </div>}
  </Panel>;
}
