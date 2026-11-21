import { useEffect, useState } from 'react';
import { learningApi } from '../../../api/client';
import type { AnalysisRun, ClassInsights } from '../../../api/types';
import { MetricBar } from '../../../components/MetricBar';
import { Panel } from '../../../components/Panel';
import { nodeLabel, percentLabel } from '../../../app/glossary';

export function ClassPanel({ run, node = '', indicator = '', onNode, onOpenStudent, onNavigate }: { run: AnalysisRun; node?: string; indicator?: string; onNode?: (id: string) => void; onOpenStudent?: (studentId: string) => void; onNavigate?: (path: string) => void }) {
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
  // 评分点失分排行：只统计校验一致记录的失分；冲突记录不按 0 分处理，不纳入。
  const lossRanking = (() => {
    const counts = new Map<string, number>();
    (run.rubric_observations ?? []).forEach(row => {
      if (row.node_id !== node || row.state !== 'valid') return;
      row.points.forEach(point => {
        if (point.maximum > 0 && point.earned < point.maximum) {
          counts.set(point.point_id, (counts.get(point.point_id) ?? 0) + 1);
        }
      });
    });
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { entries, top: entries[0]?.[1] ?? 0 };
  })();
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
    {node && <section className="source-detail class-common-evidence" aria-label="班级共性与可比范围"><h3>班级共性与可比范围</h3>{insightMessage && <p className="muted" role="status">{insightMessage}</p>}{comparisons?.map(comparison => <div className="row" key={comparison.indicator_id}><strong>{comparison.indicator_id} · 共同题目比较</strong>{comparison.status === 'available' ? <><p>共同观察题目：{comparison.common_material_ids.join('、')}</p>{comparison.classes.map(item => <p key={item.class_id}>{item.class_id}：共同题目 {item.common_score}/{item.common_maximum} 分（得分率 {percentLabel(item.common_score, item.common_maximum)}）· {item.common_record_count} 条 · {item.observed_student_count} 名可观察学生</p>)}<div className="comparison-bars">{comparison.classes.map(item => <div className="comparison-bar-row" key={item.class_id}><span>{item.class_id}</span><MetricBar ratio={item.common_maximum != null && item.common_score != null ? item.common_score / item.common_maximum : null} /></div>)}</div></> : <p>共同观察题目为空，当前不可比较。</p>}</div>)}{issues?.length ? <div className="problem-cards">{issues.map(issue => {
      const affectedTotal = issue.by_class.reduce((sum, item) => sum + item.affected_count, 0);
      const evidenceCount = issue.by_class.reduce((sum, item) => sum + item.evidence_refs.length, 0);
      const firstStudent = issue.by_class.flatMap(item => item.affected_student_ids)[0];
      return <article className="problem-card" key={`${issue.indicator_id}:${issue.issue_id}`}>
        <header><strong>{issue.label}</strong><span>{affectedTotal} 名学生涉及</span></header>
        <p>佐证：{issue.by_class.map(item => `${item.class_id} ${item.affected_count}/${item.observed_student_count} 名可观察学生`).join('；')}{evidenceCount ? ` · 原始记录 ${evidenceCount} 条可点开` : ''}</p>
        {issue.by_class.map(item => <div key={item.class_id}>{onOpenStudent && item.affected_student_ids.map(studentId => <button className="secondary" key={studentId} onClick={() => onOpenStudent(studentId)}>查看 {studentId} 证据</button>)}{item.evidence_refs.length > 0 && <details><summary>查看原始记录来源（{item.evidence_refs.length}）</summary>{item.evidence_refs.map((ref, index) => <p key={`${ref.record_id}-${ref.source_line}-${index}`}>{item.class_id} · {ref.record_id} · {ref.material_id} · CSV第 {ref.source_line ?? '未知'} 行</p>)}</details>}</div>)}
        {issue.limitations.map(limitation => <small key={limitation}>{limitation}</small>)}
        {onNavigate && firstStudent && <button className="text-action" onClick={() => onNavigate(`/recommendations?studentId=${encodeURIComponent(firstStudent)}&indicatorId=${encodeURIComponent(issue.indicator_id)}`)}>为 {firstStudent} 形成学习建议 →</button>}
      </article>;
    })}</div> : insights && <div className="problem-gate"><p>共性问题识别需要已核验的评分点问题映射；这不表示不存在共性问题。核对学习要求后，跨题失分会在这里变成命名问题卡片。</p>{onNavigate && <button className="text-action" onClick={() => onNavigate('/requirements')}>去核对学习要求 →</button>}</div>}{insights?.limitations.map(limitation => <small key={limitation}>{limitation}</small>)}{lossRanking.entries.length ? <div className="loss-ranking"><h4>评分点失分排行 · 本节点（仅校验一致的记录）</h4><ul>{lossRanking.entries.map(([pointId, count]) => { const material = pointId.match(/^[A-Z]+\d+/)?.[0] ?? ''; const width = lossRanking.top > 0 ? (count / lossRanking.top) * 100 : 0; return <li key={pointId}><span className="loss-label">{pointId}{material ? ` · ${material}` : ''}</span><span className="loss-bar-track" aria-hidden="true"><span className="loss-bar-fill" style={{ width: `${width}%` }} /></span><span className="loss-count">失分记录 {count}</span></li>; })}</ul><p className="muted">失分记录数按评分点统计（同一记录同一评分点计一次）；仅用于定位观察重点，不推断原因。</p></div> : null}</section>}
  </Panel>;
}
