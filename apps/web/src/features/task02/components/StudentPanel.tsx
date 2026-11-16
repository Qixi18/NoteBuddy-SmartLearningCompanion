import type { AnalysisRun } from '../../../api/types';
import { Panel } from '../../../components/Panel';
import { useEffect, useState } from 'react';
export function StudentPanel({ run, student, indicator, onStudent, onIndicator }: { run: AnalysisRun; student: string; indicator: string; onStudent: (id: string) => void; onIndicator: (id: string) => void }) {
  const metric = run.metrics.find(item => item.kind === 'student_indicator' && item.key === `${student}:${indicator}`);
  const [node, setNode] = useState(run.nodes[0]?.['节点编号'] ?? '');
  useEffect(() => { setNode(run.nodes[0]?.['节点编号'] ?? ''); }, [run.run_id]);
  useEffect(() => { setNode(run.nodes[0]?.['节点编号'] ?? ''); }, [student, indicator]);
  const scopedMetrics = run.metrics.filter(item => item.kind === 'student_indicator' && item.node_id === node && item.student_id === student && item.indicator_id === indicator);
  const observation = run.observations.find(item => item.student_id === student && item.indicator_id === indicator && item.node_id === node);
  const stateLabel: Record<string, string> = { not_measured: '该节点未测此指标', no_record: '没有该指标作答记录', pending: '有待评分记录', unanswered: '有未作答记录', scored: '有有效评分', excluded: '记录因质量问题排除', unknown: '状态未知' };
  return <Panel title="学生与指标"><label>学生<select value={student} onChange={event => onStudent(event.target.value)}>{run.students.map(item => <option key={item['学生编号']} value={item['学生编号']}>{item['学生编号']} · {item['模拟班级编号']}</option>)}</select></label>
    <label>观察指标<select value={indicator} onChange={event => onIndicator(event.target.value)}>{run.objectives.map(item => <option key={item['指标编号']} value={item['指标编号']}>{item['指标编号']} · {item['观察指标']}</option>)}</select></label>
    <label>测验节点<select value={node} onChange={event => setNode(event.target.value)}>{run.nodes.map(item => <option key={item['节点编号']} value={item['节点编号']}>{item['节点编号']}</option>)}</select></label>
    {scopedMetrics.length ? scopedMetrics.map(nodeMetric => <div key={nodeMetric.key}><p className="stat">{nodeMetric.score}/{nodeMetric.maximum}</p><p>节点 {node} · 有效记录 {nodeMetric.count} 条 · {nodeMetric.ratio == null ? '无有效评分分母' : `得分率 ${(nodeMetric.ratio * 100).toFixed(1)}%`}</p><small>采用记录：{nodeMetric.record_ids.join('、')}</small></div>) : <p className="warn">节点 {node} 暂无有效已评分记录；这不代表学生未掌握。</p>}
    {observation && <><p className="muted">状态：{stateLabel[observation.state ?? 'unknown']} · 该节点指标可用题目 {observation.available_item_count ?? '未知'} 道</p><p className="muted">选中事件 {observation.selected_count} · 有效已评分 {observation.scored_count} · 待评分 {observation.pending_count} · 未作答 {observation.unanswered_count} · 排除 {observation.excluded_count} · 因修订/身份冲突隔离 {observation.quarantined_count ?? 0}</p></>}
    {metric && <small>跨节点汇总（仅描述已有有效评分，不能用于节点间进步比较）：{metric.score}/{metric.maximum} · {metric.count} 条</small>}
  </Panel>;
}
