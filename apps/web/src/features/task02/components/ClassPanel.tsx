import type { AnalysisRun } from '../../../api/types';
import { MetricBar } from '../../../components/MetricBar';
import { Panel } from '../../../components/Panel';
export function ClassPanel({ run }: { run: AnalysisRun }) {
  const classes = run.metrics.filter(m => m.kind === 'class');
  const byIndicator = run.metrics.filter(m => m.kind === 'class_indicator');
  return <Panel title="班级比较">{classes.map(metric => { const ratio = metric.ratio ?? 0; return <div className="row" key={metric.key}><strong>{metric.key}</strong> · {metric.score}/{metric.maximum} 分 · {metric.count} 条有效记录
    <MetricBar ratio={ratio} /><small>得分率 {(ratio * 100).toFixed(1)}%；分母仅含有效已评分记录</small></div>; })}
    <details><summary>按观察指标比较</summary>{run.objectives.map(objective => <div className="row" key={objective['指标编号']}><strong>{objective['指标编号']}</strong> {objective['观察指标']}<br />
      {classes.map((group, i) => { const metric = byIndicator.find(item => item.key === `${group.key}:${objective['指标编号']}`); const ratio = metric?.ratio ?? 0; return <span key={group.key}>{i ? ' · ' : ''}{group.key}：{metric ? `${metric.score}/${metric.maximum}（${(ratio * 100).toFixed(1)}%，${metric.count} 条）` : '无有效记录'}</span>; })}</div>)}</details>
  </Panel>;
}
