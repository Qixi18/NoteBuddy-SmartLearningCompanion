import type { AnalysisRun } from '../../../api/types';
import { Panel } from '../../../components/Panel';
import { useEffect, useState } from 'react';
export function EvidencePanel({ run, student, indicator, node: activeNode, onNode }: { run: AnalysisRun; student: string; indicator: string; node?: string; onNode?: (id: string) => void }) {
  const [localNode, setLocalNode] = useState(run.nodes[0]?.['节点编号'] ?? '');
  useEffect(() => { setLocalNode(run.nodes[0]?.['节点编号'] ?? ''); }, [run.run_id]);
  useEffect(() => { setLocalNode(run.nodes[0]?.['节点编号'] ?? ''); }, [student, indicator]);
  const node = activeNode ?? localNode;
  const chooseNode = (value: string) => { setLocalNode(value); onNode?.(value); };
  const ids = new Set(run.items.filter(item => item['指标编号'] === indicator).map(item => item['材料编号']));
  const records = (run.raw_responses ?? run.responses).filter(row => row['学生编号'] === student && row['节点编号'] === node && ids.has(row['材料编号']));
  const source = (row: typeof records[number]) => run.quality.record_dispositions?.find(item => item.record_id === row['记录编号'] && item.source_line === row._source_line);
  const disposition = (row: typeof records[number]) => source(row)?.disposition ?? 'unknown';
  const rubricLabel: Record<string, string> = { valid: '校验一致', conflict: '评分点冲突', unknown: '未知' };
  return <Panel title="作答证据与评分点"><p className="scope-summary">当前运行 {run.run_id} · 学生 {student || '未选'} · 指标 {indicator || '未选'} · 节点 {node || '未选'} · 原始记录 {records.length} 行。原始行包含旧修订与排除记录，不能都作为有效评分。</p><label>证据节点<select value={node} onChange={event => chooseNode(event.target.value)}><option value="">请选择测验节点</option>{run.nodes.map(item => <option key={item['节点编号']} value={item['节点编号']}>{item['节点编号']}</option>)}</select></label>{records.length ? records.map((row, index) => {
    const item = run.items.find(entry => entry['材料编号'] === row['材料编号']);
    const rubric = run.rubric_observations?.find(observation => observation.record_id === row['记录编号'] && observation.student_id === row['学生编号'] && observation.item_id === row['材料编号'] && observation.node_id === row['节点编号']);
    const selected = run.responses.some(response => response['记录编号'] === row['记录编号'] && response._source_line === row._source_line);
    return <details className="row" key={`${row['记录编号']}-${index}`}><summary>{row['记录编号']} · {row['材料编号']} · {row['评分状态']} · {row['得分']}/{row['满分']} · 修订 {row['修订版本']} · {disposition(row)}</summary>
      <p>题目：{item?.['题干或内容']}</p><p>最终作答：{row['学生最终作答']}</p><pre>{row['解答过程']}</pre><p>评分点要求：{item?.['评分点']}</p><p>评分点得分原文：{row['评分点得分']}</p>
      <div className="row"><strong>结构化评分点状态：{rubricLabel[rubric?.state ?? 'unknown']}</strong>
        {rubric?.points.length ? <ul>{rubric.points.map(point => <li key={point.point_id}>{point.point_id}：{point.earned}/{point.maximum}</li>)}</ul> : <p>未提供逐点得分；未知不按 0 分处理。</p>}
        <small>{rubric?.reason ?? (selected ? '当前记录没有结构化评分点摘要。' : '该修订未进入当前分析版本；逐点评分未知。')}</small>
        {rubric?.conflicts.length ? <p className="warn">冲突：{rubric.conflicts.join('、')}；总分仍以质量校验结果为准。</p> : null}
      </div><small>原始 CSV：{source(row)?.source_file || '文件名未提供'} · 第 {row._source_line} 行 · 处置：{disposition(row)}</small>
    </details>;
  }) : !node ? <p className="muted">请选择测验节点后查看证据。未选定范围时，不推断该学生在此指标上的表现。</p> : <p className="muted">节点 {node} 没有该指标作答记录；不能据此判断未掌握。</p>}</Panel>;
}
