import { useEffect, useState } from 'react';
import { learningApi } from '../../../api/client';
import type { AnalysisRun, ClassInsights } from '../../../api/types';
import { MetricBar } from '../../../components/MetricBar';
import { Panel } from '../../../components/Panel';
import { nodeLabel, percentLabel } from '../../../app/glossary';

export function ClassPanel({ run, node = '', indicator = '', onNode, onOpenStudent }: { run: AnalysisRun; node?: string; indicator?: string; onNode?: (id: string) => void; onOpenStudent?: (studentId: string) => void }) {
  const [insights, setInsights] = useState<ClassInsights | null>(null);
  const [insightMessage, setInsightMessage] = useState('');
  useEffect(() => {
    let active = true;
    setInsights(null);
    if (!node) {
      setInsightMessage('选择测验节点后查看共同题目和已核验问题计数。');
      return () => { active = false; };
    }
    setInsightMessage('正在计算共同题目与去重问题计数…');
    learningApi.classInsights(node).then(result => {
      if (!active) return;
      setInsights(result);
      setInsightMessage('');
    }).catch(error => {
      if (active) setInsightMessage(`班级证据比较读取失败：${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { active = false; };
  }, [run.run_id, node]);
  const classes = [...new Set(run.students.map(student => student['模拟班级编号']))];
  const scoped = run.metrics.filter(metric => metric.kind === 'class_indicator' && metric.node_id === node && (!indicator || metric.indicator_id === indicator));
  const hasNodeMetrics = run.metrics.some(metric => metric.kind === 'class_indicator' && Boolean(metric.node_id));
  const combined = run.metrics.filter(metric => metric.kind === 'class');
  const byIndicator = run.metrics.filter(metric => metric.kind === 'class_indicator' && !metric.node_id && (!indicator || metric.indicator_id === indicator));
  const comparisons = insights?.comparisons.filter(item => !indicator || item.indicator_id === indicator);
  const issues = insights?.issues.filter(item => !indicator || item.indicator_id === indicator);
  return <Panel title="班级比较">
    <label>测验节点<select value={node} onChange={event => onNode?.(event.target.value)}><option value="">请选择测验节点</option>{run.nodes.map(item => <option key={item['节点编号']} value={item['节点编号']}>{nodeLabel(item)}</option>)}</select></label>
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
      <details><summary>节点 {node} 的指标明细</summary>{run.objectives.filter(objective => !indicator || objective['指标编号'] === indicator).map(objective => <div className="row" key={objective['指标编号']}><strong>{objective['指标编号']} · {objective['观察指标']}</strong><p>{classes.map(classId => { const metric = scoped.find(item => item.class_id === classId && item.indicator_id === objective['指标编号']); return <span key={classId}>{classId}：{metric ? `${metric.score}/${metric.maximum}（${metric.ratio == null ? '无分母' : `${(metric.ratio * 100).toFixed(1)}%`}，${metric.count} 条）` : '无有效已评分记录'}；</span>; })}</p></div>)}</details>
    </>}
    <details><summary>跨节点历史汇总 · 不用于进步判断</summary><p className="muted">以下仅汇总已有有效评分；不同节点不能直接比较。</p>{combined.map(metric => <p key={metric.key}>{metric.key}：{metric.score}/{metric.maximum} 分 · {metric.count} 条</p>)}{byIndicator.map(metric => <p key={metric.key}>{metric.key}：{metric.score}/{metric.maximum} 分 · {metric.count} 条</p>)}</details>
    {node && <section className="source-detail class-common-evidence" aria-label="班级共性与可比范围"><h3>班级共性与可比范围</h3>{insightMessage && <p className="muted" role="status">{insightMessage}</p>}{comparisons?.map(comparison => <div className="row" key={comparison.indicator_id}><strong>{comparison.indicator_id} · 共同题目比较</strong>{comparison.status === 'available' ? <><p>共同观察题目：{comparison.common_material_ids.join('、')}</p>{comparison.classes.map(item => <p key={item.class_id}>{item.class_id}：共同题目 {item.common_score}/{item.common_maximum} 分（得分率 {percentLabel(item.common_score, item.common_maximum)}）· {item.common_record_count} 条 · {item.observed_student_count} 名可观察学生</p>)}</> : <p>共同观察题目为空，当前不可比较。</p>}</div>)}{issues?.length ? issues.map(issue => <div className="row" key={`${issue.indicator_id}:${issue.issue_id}`}><strong>{issue.indicator_id} · {issue.label}</strong>{issue.by_class.map(item => <div key={item.class_id}><p>{item.class_id}：{item.affected_count}/{item.observed_student_count} 名可观察学生有跨题已核验评分点失分{item.affected_student_ids.length ? `（${item.affected_student_ids.join('、')}）` : ''}。{onOpenStudent && item.affected_student_ids.map(studentId => <button className="secondary" key={studentId} onClick={() => onOpenStudent(studentId)}>查看 {studentId} 证据</button>)}</p>{item.evidence_refs.length > 0 && <details><summary>查看原始记录来源（{item.evidence_refs.length}）</summary>{item.evidence_refs.map((ref, index) => <p key={`${ref.record_id}-${ref.source_line}-${index}`}>{item.class_id} · {ref.record_id} · {ref.material_id} · CSV第 {ref.source_line ?? '未知'} 行</p>)}</details>}</div>)}{issue.limitations.map(limitation => <small key={limitation}>{limitation}</small>)}</div>) : insights && <p className="muted">当前没有可用的已核验跨题问题映射；这不表示不存在共性问题。</p>}{insights?.limitations.map(limitation => <small key={limitation}>{limitation}</small>)}</section>}
  </Panel>;
}
