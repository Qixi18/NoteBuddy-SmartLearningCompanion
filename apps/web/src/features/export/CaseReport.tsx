import { useEffect, useState } from 'react';
import type { AnalysisRun, CaseReports } from '../../api/types';
import { learningApi } from '../../api/client';
import { Panel } from '../../components/Panel';
import { printReport } from './printReport';

function sourceValidityText(review: CaseReports['cases'][number]['reviews'][number]) {
  const referencedVersion = review.source_verification_versions?.[review.indicator_id];
  const currentVersion = review.current_source_version;
  if (review.source_validity === 'current') return `所引来源仍为当前有效签核 v${currentVersion}`;
  if (review.source_validity === 'changed') return `所引来源已变化：复核引用 v${referencedVersion ?? '未知'}，当前 v${currentVersion ?? '未知'}（${review.current_source_status}）`;
  if (review.source_validity === 'unverified') return `当前来源尚未核验通过：${review.current_source_status}（当前 v${currentVersion ?? '未知'}）`;
  return `当前来源状态无法确认；复核时记录为 ${review.source_status}（v${referencedVersion ?? '未知'}）`;
}

export function CaseReport({ run, ids, onSelect }: { run: AnalysisRun; ids: string[]; onSelect: (ids: string[]) => void }) {
  const [result, setResult] = useState<{ ids: string[]; report?: CaseReports; error?: string }>();
  const [focusedStudent, setFocusedStudent] = useState('');
  const [showAllCases, setShowAllCases] = useState(false);
  const activeStudent = ids.includes(focusedStudent) ? focusedStudent : ids[0] ?? '';
  const ready = ids.length === 3 && ids.every(Boolean) && new Set(ids).size === 3;
  const current = result?.ids === ids ? result : undefined;
  const report = current?.report?.run_id === run.run_id ? current.report : undefined;

  useEffect(() => {
    if (!ready) return;
    let active = true;
    learningApi.caseReports(ids).then(value => {
      if (active) setResult(value.run_id === run.run_id ? { ids, report: value } : { ids, error: '当前数据批次已变化，请刷新后重试。' });
    }).catch(reason => {
      if (active) setResult({ ids, error: reason instanceof Error ? reason.message : String(reason) });
    });
    return () => { active = false; };
  }, [ready, ids, run.run_id]);

  return <Panel id="case-report" title="三案例教师阅读报告" className="competition-case-report report-view">
    <div className="report-toolbar"><p>只展示当前运行中教师已确认的版本。报告与成果包共用服务端快照数据。</p><button className="secondary" disabled={!report || report.status !== 'ready'} onClick={() => printReport('case-report')}>打印 / 保存为 PDF</button></div>
    <div className="export-slots">{ids.map((id, index) => <label className="export-slot" key={index}>案例 {['一', '二', '三'][index]}<select aria-label={`报告案例 ${index + 1}`} value={id} onChange={event => onSelect(ids.map((value, position) => position === index ? event.target.value : value))}><option value="">选择学生</option>{run.students.filter(student => !ids.includes(student['学生编号']) || id === student['学生编号']).map(student => <option value={student['学生编号']} key={student['学生编号']}>{student['学生编号']} · {student['模拟班级编号']}</option>)}</select></label>)}</div>
    {report && <div className="report-reading-controls"><label>重点阅读案例<select aria-label="重点阅读案例" value={activeStudent} onChange={event => setFocusedStudent(event.target.value)}>{ids.filter(Boolean).map(id => <option key={id} value={id}>{id} · {run.students.find(student => student['学生编号'] === id)?.['模拟班级编号']}</option>)}</select></label><button type="button" className="secondary" aria-pressed={showAllCases} onClick={() => setShowAllCases(show => !show)}>{showAllCases ? '仅阅读所选案例' : '查看全部案例正文'}</button><span className="muted">默认展开一名学生的完整依据；三人差异见上方对照。打印时包含全部案例。</span></div>}
    {current?.error && <p role="alert" className="error">报告读取失败：{current.error}</p>}
    {ready && !current && <p role="status" className="muted">正在读取所选学生的报告…</p>}
    {ready && report?.status === 'incomplete' && <p role="status" className="report-incomplete">三名案例尚未全部获得当前运行中的教师确认。各案例会明确标注缺项，不能作为已完成案例提交。</p>}
    {!ready && <p className="muted" role="status">选择三名不同学生后生成案例并排阅读报告。</p>}
    {report && <>
      <div className="report-comparison" aria-label="三案例覆盖对比"><h3>案例对照</h3><div className="report-comparison-grid">{report.comparison.map(item => { const detail = report.cases.find(value => value.student_id === item.student_id); return <article key={item.student_id}><strong>{item.student_id}</strong><span>{item.class_id || '班级未记录'}</span><small>{item.status === 'confirmed' ? '教师已确认' : '确认未完成'} · {item.evidence_count} 条引用证据 · {item.review_count} 个复核版本 · {item.adjustment_count} 条教学调整</small>{detail?.reviews.length ? <><p><b>需求差异：</b>{detail.reviews.map(review => `${review.indicator_id}：${review.diagnosis}`).join('；')}</p><p><b>方案差异：</b>{detail.reviews.map(review => review.structured_plan?.activity || review.teaching_plan_v2?.goal || review.recommendation).join('；')}</p></> : <p>暂无正式复核差异；需完成教师复核后才可对照教学需求与方案。</p>}</article>; })}</div></div>
      <div className={`case-report-grid${showAllCases ? ' show-all-cases' : ''}`}>{report.cases.map(item => <article className={`case-report-card ${item.status}${!showAllCases && item.student_id !== activeStudent ? ' is-report-focus-hidden' : ''}`} key={item.student_id}>
        <header><div><span className="eyebrow">{item.class_id || '班级未记录'} · {item.student_id}</span><h3>{item.status === 'confirmed' ? '教师确认案例' : '待补齐案例'}</h3></div>{item.status === 'confirmed' && <small>版本 {item.case_version} · {item.reviewer}</small>}</header>
        {item.status === 'incomplete' ? <p role="status">{item.message}</p> : <>
          <section><h4>案例叙述</h4><p>{item.narrative}</p><p className="report-limitation"><strong>解释边界：</strong>{item.limitations}</p></section>
          <section><h4>证据与事实</h4>{item.evidence.length ? item.evidence.map((evidence, index) => evidence.kind === 'coverage' ? <p className="report-coverage" key={`coverage-${index}`}>{evidence.description} 范围节点：{evidence.node_id}</p> : <details className="report-evidence" key={`${evidence.record_id}:${evidence.source_line}`}><summary>{evidence.source_locator} · {evidence.material_id} · 节点 {evidence.node_id}</summary><p><strong>题目：</strong>{evidence.prompt || '未提供'}</p><p><strong>作答：</strong>{evidence.answer || '未提供'}</p><p><strong>解答过程：</strong>{evidence.work || '未提供'}</p><p><strong>得分：</strong>{evidence.score ?? '未知'} / {evidence.maximum ?? '未知'} · {evidence.score_status || '评分状态未知'}</p><small>指标 {evidence.indicator_id} · {evidence.source_locator}</small></details>) : <p>没有教师引用的作答或覆盖证据。</p>}</section>
          <section><h4>教师复核与教学安排</h4>{item.reviews.length ? item.reviews.map(review => <div className="report-review" key={`${review.indicator_id}:${review.node_id}:${review.version}`}><h5>{review.indicator_id} · 节点 {review.node_id} · 复核版本 {review.version} · {review.status}</h5><p><strong>诊断：</strong>{review.diagnosis}</p><p><strong>建议：</strong>{review.recommendation}</p><p><strong>复核理由：</strong>{review.reason}</p><p className={review.source_validity === 'current' ? 'source-validity-current' : 'source-validity-not-current'}><strong>来源有效性：</strong>{sourceValidityText(review)}</p>{review.structured_plan && <><p><strong>学习活动：</strong>{review.structured_plan.activity}</p><ol>{review.structured_plan.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>{review.structured_plan.practice.length > 0 && <p><strong>练习：</strong>{review.structured_plan.practice.join('；')}</p>}<p><strong>观察点：</strong>{review.structured_plan.observation_points.join('；') || '未填写'}</p><p><strong>材料：</strong>{review.structured_plan.material_ids.join('、')}</p>{Object.entries(review.source_verification_versions ?? {}).map(([sourceIndicator, version]) => <small key={sourceIndicator}>复核引用来源签核 {sourceIndicator} · v{version} · 当时状态 {review.source_status}</small>)}</>}{review.teaching_plan_v2 && <><p><strong>教学目标：</strong>{review.teaching_plan_v2.goal}</p><ol>{review.teaching_plan_v2.steps.map((step, index) => <li key={index}>{step}</li>)}</ol><p><strong>材料与选择理由：</strong>{review.teaching_plan_v2.material_ids.map(id => { const reason = review.teaching_plan_v2?.resource_reasons.find(value => value.material_id === id); return `${id}${reason ? `（${reason.explanation}）` : ''}`; }).join('；') || '无'}</p><p><strong>分层提示：</strong>{review.teaching_plan_v2.hints.map(hint => `${hint.level}：${hint.student_prompt}`).join('；')}</p><p><strong>观察点：</strong>{review.teaching_plan_v2.observation_points.join('；')}</p><p><strong>复核时来源签核：</strong>{Object.entries(review.teaching_plan_v2.source_versions).map(([indicator, version]) => `${indicator} v${version}`).join('、') || '未记录'}</p></>}</div>) : <p>该案例没有关联正式教师复核版本。</p>}</section>
          <section><h4>教学实施与后续调整</h4>{item.adjustments.length ? item.adjustments.map((adjustment, index) => <div className="report-adjustment" key={index}><p><strong>计划活动：</strong>{String(adjustment.planned_activity || '未记录')}</p><p><strong>实施：</strong>{String(adjustment.implementation || '尚未记录')} · {String(adjustment.implementation_status || 'not_completed')}</p><p><strong>后续观察：</strong>{String(adjustment.outcome_observations || '尚未记录')}</p><p><strong>教师结论：</strong>{String(adjustment.teacher_conclusion || '尚未记录')}</p><small>比较状态：{String(adjustment.comparability || 'pending')} · 系统不自动归因干预效果</small></div>) : <p>尚无教学调整记录。</p>}</section>
        </>}
      </article>)}</div>
      <ul className="report-limitations">{report.limitations.map(item => <li key={item}>{item}</li>)}</ul>
    </>}
  </Panel>;
}
