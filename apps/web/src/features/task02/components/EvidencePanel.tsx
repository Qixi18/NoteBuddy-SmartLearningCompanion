import type { AnalysisRun } from '../../../api/types';
import { Panel } from '../../../components/Panel';
import { dispositionLabel } from '../qualityLabels';
import { nodeLabel } from '../../../app/glossary';
import { useEffect, useState } from 'react';
export function EvidencePanel({ run, student, indicator, node: activeNode, onNode, focusEvidence, onClose }: { run: AnalysisRun; student: string; indicator: string; node?: string; onNode?: (id: string) => void; focusEvidence?: { recordId: string; sourceLine: number } | null; onClose?: () => void }) {
  const [localNode, setLocalNode] = useState(run.nodes[0]?.['节点编号'] ?? '');
  useEffect(() => { setLocalNode(run.nodes[0]?.['节点编号'] ?? ''); }, [run.run_id]);
  useEffect(() => { setLocalNode(run.nodes[0]?.['节点编号'] ?? ''); }, [student, indicator]);
  const node = activeNode ?? localNode;
  useEffect(() => {
    if (!focusEvidence) return;
    const target = document.getElementById(`evidence-${encodeURIComponent(focusEvidence.recordId)}-${focusEvidence.sourceLine}`);
    if (!target) return;
    (target as HTMLDetailsElement).open = true;
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    target.querySelector<HTMLElement>('summary')?.focus();
  }, [focusEvidence, node, student, indicator]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !onClose) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  const chooseNode = (value: string) => { setLocalNode(value); onNode?.(value); };
  const ids = new Set(run.items.filter(item => item['指标编号'] === indicator).map(item => item['材料编号']));
  const records = (run.raw_responses ?? run.responses).filter(row => row['学生编号'] === student && row['节点编号'] === node && ids.has(row['材料编号']));
  const source = (row: typeof records[number]) => run.quality.record_dispositions?.find(item => item.record_id === row['记录编号'] && item.source_line === row._source_line);
  const disposition = (row: typeof records[number]) => source(row)?.disposition ?? 'unknown';
  const rubricLabel: Record<string, string> = { valid: '校验一致', conflict: '评分点冲突', unknown: '未知' };
  return <Panel title="作答证据与评分点"><button type="button" className="text-action" onClick={onClose}>返回学生分析</button><div className="scope-summary"><strong>{student || '未选学生'} · {indicator || '未选指标'} · 节点 {node || '未选择'}</strong><span>当前范围共 {records.length} 条原始行，包含修订和待处理记录；只有通过校验的记录进入评分。</span></div><label>证据节点<select value={node} onChange={event => chooseNode(event.target.value)}><option value="">请选择测验节点</option>{run.nodes.map(item => <option key={item['节点编号']} value={item['节点编号']}>{nodeLabel(item)}</option>)}</select></label>{records.length ? <div className="evidence-list">{records.map((row, index) => {
    const item = run.items.find(entry => entry['材料编号'] === row['材料编号']);
    const rubric = run.rubric_observations?.find(observation => observation.record_id === row['记录编号'] && observation.student_id === row['学生编号'] && observation.item_id === row['材料编号'] && observation.node_id === row['节点编号']);
    const selected = run.responses.some(response => response['记录编号'] === row['记录编号'] && response._source_line === row._source_line);
    const finding = run.quality.findings.find(item => item.record_id === row['记录编号'] && item.source_line === row._source_line);
    const dispositionValue = disposition(row);
    return <details id={`evidence-${encodeURIComponent(row['记录编号'])}-${row._source_line}`} className={`evidence-entry evidence-${dispositionValue}`} key={`${row['记录编号']}-${index}`}><summary><span className="evidence-main"><strong>{row['记录编号']} · {row['材料编号']} · {row['评分状态']} · {row['得分'] || '—'}/{row['满分'] || '—'} · 修订 {row['修订版本']} · {dispositionValue}</strong><span className={`status-badge status-${dispositionValue}`} aria-label={dispositionLabel(dispositionValue)}>{dispositionLabel(dispositionValue)}</span><span className="evidence-score">{row['得分'] || '—'}/{row['满分'] || '—'} 分</span></span></summary>
      <div><p><strong>题目：</strong>{item?.['题干或内容'] || '未提供题干'}</p><p><strong>最终作答：</strong>{row['学生最终作答'] || '未作答'}</p>{row['解答过程'] && <><strong>解答过程</strong><pre>{row['解答过程']}</pre></>}<p><strong>评分点要求：</strong>{item?.['评分点'] || '未提供'}</p><p><strong>评分点得分原文：</strong>{row['评分点得分'] || '未提供'}</p>
      <div className="row"><strong>结构化评分点状态：{rubricLabel[rubric?.state ?? 'unknown']}</strong>
        {rubric?.points.length ? <ul>{rubric.points.map(point => <li key={point.point_id}>{point.point_id}：{point.earned}/{point.maximum}</li>)}</ul> : <p>未提供逐点得分；未知不按 0 分处理。</p>}
        <small>{rubric?.reason ?? (selected ? '当前记录没有结构化评分点摘要。' : '该修订未进入当前分析版本；逐点评分未知。')}</small>
        {rubric?.conflicts.length ? <p className="warn">冲突：{rubric.conflicts.join('、')}；总分仍以质量校验结果为准。</p> : null}
      </div>{finding && <p className="review-alert">核查说明：{finding.detail}</p>}<small>原始 CSV：{source(row)?.source_file || '文件名未提供'} · 第 {row._source_line} 行</small><small>技术详情：{row['评分状态']} · {dispositionValue} · 事件 {row['作答事件编号']}</small></div>
    </details>;
  })}</div> : !node ? <p className="muted">请选择测验节点后查看证据。未选定范围时，不推断该学生在此指标上的表现。</p> : <p className="muted">节点 {node} 没有该指标作答记录；不能据此判断未掌握。</p>}</Panel>;
}
