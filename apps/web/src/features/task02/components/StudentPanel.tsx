import type { AnalysisRun } from '../../../api/types';
import { Panel } from '../../../components/Panel';
import { InsightPanel } from './InsightPanel';
import { useEffect, useState } from 'react';
export function StudentPanel({ run, student, indicator, node: activeNode, onNode, onStudent, onIndicator, onOpenEvidence }: { run: AnalysisRun; student: string; indicator: string; node?: string; onNode?: (id: string) => void; onStudent: (id: string) => void; onIndicator: (id: string) => void; onOpenEvidence?: (recordId?: string, sourceLine?: number) => void }) {
  const metric = run.metrics.find(item => item.kind === 'student_indicator' && item.key === `${student}:${indicator}`);
  const [localNode, setLocalNode] = useState(run.nodes[0]?.['节点编号'] ?? '');
  useEffect(() => { setLocalNode(run.nodes[0]?.['节点编号'] ?? ''); }, [run.run_id]);
  useEffect(() => { setLocalNode(run.nodes[0]?.['节点编号'] ?? ''); }, [student, indicator]);
  const node = activeNode ?? localNode;
  const chooseNode = (value: string) => { setLocalNode(value); onNode?.(value); };
  const scopedMetrics = run.metrics.filter(item => item.kind === 'student_indicator' && item.node_id === node && item.student_id === student && item.indicator_id === indicator);
  const observation = run.observations.find(item => item.student_id === student && item.indicator_id === indicator && item.node_id === node);
  const stateLabel: Record<string, string> = { not_measured: '该节点未测此指标', no_record: '没有该指标作答记录', pending: '有待评分记录', unanswered: '有未作答记录', scored: '有有效评分', excluded: '记录因质量问题排除', unknown: '状态未知' };
  return <><Panel title="学生分析"><div className="scope-fields"><label>学生<select value={student} onChange={event => onStudent(event.target.value)}><option value="">请选择学生</option>{run.students.map(item => <option key={item['学生编号']} value={item['学生编号']}>{item['学生编号']} · {item['模拟班级编号']}</option>)}</select></label>
    <label>观察指标<select value={indicator} onChange={event => onIndicator(event.target.value)}>{run.objectives.map(item => <option key={item['指标编号']} value={item['指标编号']}>{item['指标编号']} · {item['观察指标']}</option>)}</select></label>
    <label>测验节点<select value={node} onChange={event => chooseNode(event.target.value)}><option value="">请选择测验节点</option>{run.nodes.map(item => <option key={item['节点编号']} value={item['节点编号']}>{item['节点编号']}</option>)}</select></label></div>
    {!student ? <p className="muted">请选择一名学生后查看其记录；系统不会替你选定教学对象。</p> : !node ? <p className="muted">请选择测验节点后查看对应范围；未选节点时不推断学习状态。</p> : scopedMetrics.length ? scopedMetrics.map(nodeMetric => <div className="student-result" key={nodeMetric.key}><strong className="student-result-score">{nodeMetric.score}/{nodeMetric.maximum}</strong><span className="student-result-title">{student} · {indicator} · 节点 {node}</span><span className="student-result-caption">本节点 {nodeMetric.count} 条有效评分记录 · {nodeMetric.ratio == null ? '没有有效评分分母' : `得分率 ${(nodeMetric.ratio * 100).toFixed(1)}%`}</span><small className="student-records">采用记录：{nodeMetric.record_ids.join('、')}</small></div>) : <p className="warn">节点 {node} 暂无有效已评分记录；这不代表学生未掌握。</p>}
    {student && scopedMetrics.length > 0 && <p className="student-legacy-count">有效记录 {scopedMetrics.reduce((sum, item) => sum + item.count, 0)} 条 · 当前节点范围</p>}
    {student && observation && node && <><p className="student-state"><strong>{stateLabel[observation.state ?? 'unknown']}</strong><span>该节点指标可用题目 {observation.available_item_count ?? '未知'} 道；结果仅描述当前记录，不代表对整个指标的掌握程度。</span></p><div className="student-counts" aria-label="当前节点记录处置"><span>选中事件 {observation.selected_count}</span><span>有效评分 {observation.scored_count}</span><span className="is-pending">待评分 {observation.pending_count}</span><span>未作答 {observation.unanswered_count}</span><span className="is-excluded">已排除 {observation.excluded_count}</span><span>隔离 {observation.quarantined_count ?? 0}</span></div></>}
    {student && metric && <small>跨节点汇总（仅描述已有有效评分，不能用于节点间进步比较）：{metric.score}/{metric.maximum} · {metric.count} 条</small>}
    {student && node && onOpenEvidence && <button className="secondary" onClick={() => onOpenEvidence()}>查看此范围作答证据</button>}
  </Panel>{student && node && <InsightPanel student={student} indicator={indicator} node={node} onOpenEvidence={onOpenEvidence} />}</>;
}
