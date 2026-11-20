import { useEffect, useMemo, useState } from 'react';
import type { AnalysisRun, CaseReports } from '../../api/types';
import { learningApi } from '../../api/client';
import { Panel } from '../../components/Panel';

export function CaseReport({ run }: { run: AnalysisRun }) {
  const [ids, setIds] = useState<string[]>(['', '', '']);
  const [report, setReport] = useState<CaseReports | null>(null);
  const [error, setError] = useState('');
  const ready = ids.every(Boolean) && new Set(ids).size === 3;
  const selected = useMemo(() => ids.filter(Boolean), [ids]);
  useEffect(() => {
    let active = true;
    if (!ready) { setReport(null); setError(''); return () => { active = false; }; }
    setError('');
    learningApi.caseReports(selected).then(value => { if (active) setReport(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [ready, selected.join('|')]);
  const setStudent = (index: number, value: string) => setIds(current => current.map((id, position) => position === index ? value : id));
  return <Panel title="三案例教师阅读报告" className="competition-case-report report-view">
    <div className="report-toolbar"><p>只展示当前运行中教师已确认的版本。报告与成果包共用服务端快照数据。</p><button className="secondary" disabled={!report || report.status !== 'ready'} onClick={() => window.print()}>打印 / 保存为 PDF</button></div>
    <div className="export-slots">{ids.map((id, index) => <label className="export-slot" key={index}>案例 {['一', '二', '三'][index]}<select aria-label={`报告案例 ${index + 1}`} value={id} onChange={event => setStudent(index, event.target.value)}><option value="">选择学生</option>{run.students.filter(student => !ids.includes(student['学生编号']) || id === student['学生编号']).map(student => <option value={student['学生编号']} key={student['学生编号']}>{student['学生编号']} · {student['模拟班级编号']}</option>)}</select></label>)}</div>
    {error && <p role="alert" className="error">报告读取失败：{error}</p>}
    {ready && report?.status === 'incomplete' && <p role="status" className="report-incomplete">三名案例尚未全部获得当前运行中的教师确认。各案例会明确标注缺项，不能作为已完成案例提交。</p>}
    {!ready && <p className="muted" role="status">选择三名不同学生后生成案例并排阅读报告。</p>}
    {report && <>
      <div className="report-comparison" aria-label="三案例覆盖对比"><h3>案例对照</h3><div className="report-comparison-grid">{report.comparison.map(item => { const detail = report.cases.find(value => value.student_id === item.student_id); return <article key={item.student_id}><strong>{item.student_id}</strong><span>{item.class_id || '班级未记录'}</span><small>{item.status === 'confirmed' ? '教师已确认' : '确认未完成'} · {item.evidence_count} 条引用证据 · {item.review_count} 个复核版本 · {item.adjustment_count} 条教学调整</small>{detail?.reviews.length ? <><p><b>需求差异：</b>{detail.reviews.map(review => `${review.indicator_id}：${review.diagnosis}`).join('；')}</p><p><b>方案差异：</b>{detail.reviews.map(review => review.structured_plan?.activity || review.teaching_plan_v2?.goal || review.recommendation).join('；')}</p></> : <p>暂无正式复核差异；需完成教师复核后才可对照教学需求与方案。</p>}</article>; })}</div></div>
      <div className="case-report-grid">{report.cases.map(item => <article className={`case-report-card ${item.status}`} key={item.student_id}>
        <header><div><span className="eyebrow">{item.class_id || '班级未记录'} · {item.student_id}</span><h3>{item.status === 'confirmed' ? '教师确认案例' : '待补齐案例'}</h3></div>{item.status === 'confirmed' && <small>版本 {item.case_version} · {item.reviewer}</small>}</header>
        {item.status === 'incomplete' ? <p role="status">{item.message}</p> : <>
          <section><h4>案例叙述</h4><p>{item.narrative}</p><p className="report-limitation"><strong>解释边界：</strong>{item.limitations}</p></section>
          <section><h4>证据与事实</h4>{item.evidence.length ? item.evidence.map((evidence, index) => evidence.kind === 'coverage' ? <p className="report-coverage" key={`coverage-${index}`}>{evidence.description} 范围节点：{evidence.node_id}</p> : <details className="report-evidence" key={`${evidence.record_id}:${evidence.source_line}`}><summary>{evidence.source_locator} · {evidence.material_id} · 节点 {evidence.node_id}</summary><p><strong>题目：</strong>{evidence.prompt || '未提供'}</p><p><strong>作答：</strong>{evidence.answer || '未提供'}</p><p><strong>解答过程：</strong>{evidence.work || '未提供'}</p><p><strong>得分：</strong>{evidence.score ?? '未知'} / {evidence.maximum ?? '未知'} · {evidence.score_status || '评分状态未知'}</p><small>指标 {evidence.indicator_id} · {evidence.source_locator}</small></details>) : <p>没有教师引用的作答或覆盖证据。</p>}</section>
          <section><h4>教师复核与教学安排</h4>{item.reviews.length ? item.reviews.map(review => <div className="report-review" key={`${review.indicator_id}:${review.node_id}:${review.version}`}><h5>{review.indicator_id} · 节点 {review.node_id} · 复核版本 {review.version} · {review.status}</h5><p><strong>诊断：</strong>{review.diagnosis}</p><p><strong>建议：</strong>{review.recommendation}</p><p><strong>复核理由：</strong>{review.reason}</p>{review.structured_plan && <><p><strong>学习活动：</strong>{review.structured_plan.activity}</p><ol>{review.structured_plan.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>{review.structured_plan.practice.length > 0 && <p><strong>练习：</strong>{review.structured_plan.practice.join('；')}</p>}<p><strong>观察点：</strong>{review.structured_plan.observation_points.join('；') || '未填写'}</p><p><strong>材料：</strong>{review.structured_plan.material_ids.join('、') || '无'}</p></>}{review.teaching_plan_v2 && <><p><strong>教学目标：</strong>{review.teaching_plan_v2.goal}</p><ol>{review.teaching_plan_v2.steps.map((step, index) => <li key={index}>{step.step}{step.rationale ? ` — ${step.rationale}` : ''}</li>)}</ol><p><strong>分层提示：</strong>{review.teaching_plan_v2.hints.map(hint => `${hint.level}：${hint.student_prompt}`).join('；')}</p><p><strong>观察点：</strong>{review.teaching_plan_v2.observation_points.join('；')}</p><p><strong>来源状态：</strong>{review.source_status}</p></>}</div>) : <p>该案例没有关联正式教师复核版本。</p>}</section>
          <section><h4>教学实施与后续调整</h4>{item.adjustments.length ? item.adjustments.map((adjustment, index) => <div className="report-adjustment" key={index}><p><strong>计划活动：</strong>{String(adjustment.planned_activity || '未记录')}</p><p><strong>实施：</strong>{String(adjustment.implementation || '尚未记录')} · {String(adjustment.implementation_status || 'not_completed')}</p><p><strong>后续观察：</strong>{String(adjustment.outcome_observations || '尚未记录')}</p><p><strong>教师结论：</strong>{String(adjustment.teacher_conclusion || '尚未记录')}</p><small>比较状态：{String(adjustment.comparability || 'pending')} · 系统不自动归因干预效果</small></div>) : <p>尚无教学调整记录。</p>}</section>
        </>}
      </article>)}</div>
      <ul className="report-limitations">{report.limitations.map(item => <li key={item}>{item}</li>)}</ul>
    </>}
  </Panel>;
}
