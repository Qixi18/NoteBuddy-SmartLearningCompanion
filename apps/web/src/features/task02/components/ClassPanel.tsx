import type { AnalysisRun } from '../../../api/types';
import { MetricBar } from '../../../components/MetricBar';
import { Panel } from '../../../components/Panel';

export function ClassPanel({ run, node = '', onNode, onOpenStudent }: { run: AnalysisRun; node?: string; onNode?: (id: string) => void; onOpenStudent?: (studentId: string) => void }) {
  const classes = [...new Set(run.students.map(student => student['模拟班级编号']))];
  const scoped = run.metrics.filter(metric => metric.kind === 'class_indicator' && metric.node_id === node);
  const hasNodeMetrics = run.metrics.some(metric => metric.kind === 'class_indicator' && Boolean(metric.node_id));
  const combined = run.metrics.filter(metric => metric.kind === 'class');
  const byIndicator = run.metrics.filter(metric => metric.kind === 'class_indicator' && !metric.node_id);
  return <Panel title="班级与指标观察">
    <label>测验节点<select value={node} onChange={event => onNode?.(event.target.value)}><option value="">请选择测验节点</option>{run.nodes.map(item => <option key={item['节点编号']} value={item['节点编号']}>{item['节点编号']}</option>)}</select></label>
    {!node ? <p className="muted">选择一个测验节点，查看各班在该节点的有效评分。</p> : !hasNodeMetrics ? <><p className="warn">此运行使用旧统计快照，未保存节点级班级指标。请重新导入数据生成新运行后查看；这里不把缺少统计显示成零分或无记录。</p>{onOpenStudent && classes.map(classId => { const students = run.students.filter(student => student['模拟班级编号'] === classId); return <details className="class-drilldown" key={classId}><summary>{classId} · 查看本班学生（{students.length}）</summary><div className="class-student-list">{students.map(student => <button className="secondary class-student-link" key={student['学生编号']} onClick={() => onOpenStudent(student['学生编号'])}>{student['学生编号']}</button>)}</div></details>; })}</> : <>
      <div className="class-results">{classes.map(classId => {
        const metrics = scoped.filter(metric => metric.class_id === classId);
        const score = metrics.reduce((sum, metric) => sum + metric.score, 0);
        const maximum = metrics.reduce((sum, metric) => sum + metric.maximum, 0);
        const count = metrics.reduce((sum, metric) => sum + metric.count, 0);
        const ratio = maximum > 0 ? score / maximum : null;
        const students = run.students.filter(student => student['模拟班级编号'] === classId);
        return <article className="class-result" key={classId}><h3>{classId} <small>· 节点 {node} · {students.length} 名学生</small></h3>
          {count ? <><p className="class-result-score">{score}/{maximum}<span>分 · {count} 条有效记录</span></p>{ratio != null && <MetricBar ratio={ratio} />}<small>得分率 {ratio == null ? '无有效分母' : `${(ratio * 100).toFixed(1)}%`}；仅描述本节点已评分记录</small></> : <p className="class-result-score">—<span>暂无有效已评分记录</span></p>}
          <p className="class-status">{count ? '有可用评分证据' : '本节点暂无可用评分证据'}；不据此推断未测学生表现</p>
          {onOpenStudent && <details className="class-drilldown"><summary>查看本班学生（{students.length}）</summary><div className="class-student-list">{students.map(student => <button className="secondary class-student-link" key={student['学生编号']} onClick={() => onOpenStudent(student['学生编号'])}>{student['学生编号']}</button>)}</div></details>}
        </article>;
      })}</div>
      <details><summary>节点 {node} 的指标明细</summary>{run.objectives.map(objective => <div className="row" key={objective['指标编号']}><strong>{objective['指标编号']} · {objective['观察指标']}</strong><p>{classes.map(classId => { const metric = scoped.find(item => item.class_id === classId && item.indicator_id === objective['指标编号']); return <span key={classId}>{classId}：{metric ? `${metric.score}/${metric.maximum}（${metric.ratio == null ? '无分母' : `${(metric.ratio * 100).toFixed(1)}%`}，${metric.count} 条）` : '无有效已评分记录'}；</span>; })}</p></div>)}</details>
    </>}
    <details><summary>跨节点历史汇总 · 不用于进步判断</summary><p className="muted">以下仅汇总已有有效评分；不同节点不能直接比较。</p>{combined.map(metric => <p key={metric.key}>{metric.key}：{metric.score}/{metric.maximum} 分 · {metric.count} 条</p>)}{byIndicator.map(metric => <p key={metric.key}>{metric.key}：{metric.score}/{metric.maximum} 分 · {metric.count} 条</p>)}</details>
  </Panel>;
}
