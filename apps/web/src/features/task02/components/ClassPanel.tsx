import type { AnalysisRun } from '../../../api/types';
import { MetricBar } from '../../../components/MetricBar';
import { Panel } from '../../../components/Panel';
export function ClassPanel({ run, onOpenStudent }: { run: AnalysisRun; onOpenStudent?: (studentId: string) => void }) {
  const classes = run.metrics.filter(m => m.kind === 'class');
  const byIndicator = run.metrics.filter(m => m.kind === 'class_indicator');
  const nodeMetrics = run.metrics.filter(m => Boolean(m.node_id));
  return <Panel title="班级比较">{classes.map(metric => { const ratio = metric.ratio ?? 0; const students = run.students.filter(student => student['模拟班级编号'] === metric.key); return <div className="row" key={metric.key}><strong>{metric.key}</strong> · {metric.score}/{metric.maximum} 分 · {metric.count} 条有效记录
    {metric.ratio != null && <MetricBar ratio={ratio} />}<small>{metric.ratio == null ? '没有有效评分分母' : `得分率 ${(ratio * 100).toFixed(1)}%`}；分母仅含有效已评分记录</small>
    {onOpenStudent && <details className="class-drilldown"><summary>查看本班学生（{students.length}）</summary><div className="class-student-list">{students.length ? students.map(student => <button className="secondary class-student-link" key={student['学生编号']} onClick={() => onOpenStudent(student['学生编号'])}>{student['学生编号']}</button>) : <span className="muted">当前快照没有匹配的学生记录。</span>}</div></details>}</div>; })}
    <p className="muted">合并节点指标仅作历史汇总，不用于推断节点间进步；节点得分分别列示。</p>
    {nodeMetrics.length > 0 && <details open><summary>按测验节点与指标比较</summary>{run.nodes.map(node => <section className="row" key={node['节点编号']}><strong>{node['节点编号']}</strong>{run.objectives.map(objective => <div key={objective['指标编号']}><small>{objective['指标编号']} · {objective['观察指标']}</small><div>{classes.map((group, i) => {
      const metric = nodeMetrics.find(item => {
        return item.node_id === node['节点编号'] && item.class_id === group.key && item.indicator_id === objective['指标编号'];
      });
      return <span key={group.key}>{i ? ' · ' : ''}{group.key}：{metric ? `${metric.score}/${metric.maximum}（${metric.ratio == null ? '无分母' : `${(metric.ratio * 100).toFixed(1)}%`}，${metric.count} 条）` : '无有效已评分记录'}</span>;
    })}</div></div>)}</section>)}</details>}
    <details><summary>按观察指标比较</summary>{run.objectives.map(objective => <div className="row" key={objective['指标编号']}><strong>{objective['指标编号']}</strong> {objective['观察指标']}<br />
      {classes.map((group, i) => { const metric = byIndicator.find(item => item.key === `${group.key}:${objective['指标编号']}`); return <span key={group.key}>{i ? ' · ' : ''}{group.key}：{metric ? `${metric.score}/${metric.maximum}（${metric.ratio == null ? '无分母' : `${(metric.ratio * 100).toFixed(1)}%`}，${metric.count} 条）` : '无有效记录'}</span>; })}</div>)}</details>
  </Panel>;
}
