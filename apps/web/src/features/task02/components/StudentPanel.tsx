import type { AnalysisRun } from '../../../api/types';
import { Panel } from '../../../components/Panel';
export function StudentPanel({ run, student, indicator, onStudent, onIndicator }: { run: AnalysisRun; student: string; indicator: string; onStudent: (id: string) => void; onIndicator: (id: string) => void }) {
  const metric = run.metrics.find(item => item.kind === 'student_indicator' && item.key === `${student}:${indicator}`);
  const observation = run.observations.find(item => item.student_id === student && item.indicator_id === indicator);
  return <Panel title="学生与指标"><label>学生<select value={student} onChange={event => onStudent(event.target.value)}>{run.students.map(item => <option key={item['学生编号']} value={item['学生编号']}>{item['学生编号']} · {item['模拟班级编号']}</option>)}</select></label>
    <label>观察指标<select value={indicator} onChange={event => onIndicator(event.target.value)}>{run.objectives.map(item => <option key={item['指标编号']} value={item['指标编号']}>{item['指标编号']} · {item['观察指标']}</option>)}</select></label>
    {metric ? <><p className="stat">{metric.score}/{metric.maximum}</p><p>有效记录 {metric.count} 条 · 得分率 {((metric.ratio ?? 0) * 100).toFixed(1)}%</p><small>采用记录：{metric.record_ids.join('、')}</small></> : <p className="warn">暂无有效已评分记录；不能判断掌握程度。</p>}
    {observation && <p className="muted">选中事件 {observation.selected_count} · 已评分有效 {observation.scored_count} · 待评分 {observation.pending_count} · 未作答 {observation.unanswered_count} · 未进得分分母 {observation.excluded_count}</p>}
  </Panel>;
}
