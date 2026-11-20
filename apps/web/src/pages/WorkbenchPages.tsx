import { useEffect, useState } from 'react';
import { learningApi } from '../api/client';
import type { AnalysisRun, CaseSuggestion, Draft, EvidenceReference, Review, ReviewStatus, StructuredPlan, TeachingPlanV2, WorkbenchReadiness } from '../api/types';
import { Panel } from '../components/Panel';
import { ImportPanel } from '../features/import/ImportPanel';
import { ObjectivesPanel } from '../features/task01/components/ObjectivesPanel';
import { ClassPanel } from '../features/task02/components/ClassPanel';
import { StudentPanel } from '../features/task02/components/StudentPanel';
import { EvidencePanel } from '../features/task02/components/EvidencePanel';
import { QualityPanel } from '../features/task02/components/QualityPanel';
import { ReviewPanel } from '../features/task03/components/ReviewPanel';
import { TeacherCaseEditor } from '../features/task03/components/TeacherCaseEditor';
import { TeachingAdjustmentsPanel } from '../features/task03/components/TeachingAdjustmentsPanel';
import { ExportPanel } from '../features/export/ExportPanel';
import { CaseReport } from '../features/export/CaseReport';
import { ClassReport } from '../features/export/ClassReport';
import type { RoutePath } from '../app/navigation';
import { findingLabel, severityLabel } from '../features/task02/qualityLabels';
import { NavIcon } from '../components/NavIcon';

type ReviewFields = { status: ReviewStatus; diagnosis: string; recommendation: string; adjustment_condition: string; reason: string; reviewer: string; structured_plan: StructuredPlan | null; teaching_plan_v2: TeachingPlanV2 | null; evidence_refs?: EvidenceReference[] };
type PageProps = {
  path: RoutePath;
  run: AnalysisRun | null;
  reviews: Record<string, Review[]>;
  suggestions: CaseSuggestion[];
  student: string;
  indicator: string;
  node: string;
  focusEvidence?: { recordId: string; sourceLine: number } | null;
  draft: import('../api/types').Draft | null;
  onStudent: (value: string) => void;
  onIndicator: (value: string) => void;
  onNode: (value: string) => void;
  onDraft: (provider: 'rule' | 'deepseek', node: string) => Promise<void>;
  onSave: (fields: ReviewFields) => Promise<void>;
  onExport: (ids: string[]) => void;
  onNavigate: (path: RoutePath) => void;
  onEvidenceFocus?: (recordId: string, sourceLine: number) => void;
  onImported?: (id: string) => Promise<void>;
  onMessage?: (text: string, error?: boolean) => void;
};

function EmptyRun({ onImported, onMessage }: Pick<PageProps, 'onImported' | 'onMessage'>) {
  return <div className="first-run">
    <section className="first-run-copy">
      <h1>先导入一份学情数据</h1>
      <p>从课程指标、题目关联和学生作答开始，查看学科依据、班级与学生证据，再进入教学建议复核。</p>
      <p className="muted">数据只在本机处理。原始 CSV 文件不会移动或修改。</p>
    </section>
    <ImportPanel onImported={onImported ?? (async () => undefined)} onMessage={onMessage ?? (() => undefined)} />
  </div>;
}

function Overview({ run, readiness, onNavigate }: {
  run: AnalysisRun;
  readiness?: WorkbenchReadiness;
  onNavigate: (path: RoutePath) => void;
}) {
  const classCount = new Set(run.students.map(student => student['模拟班级编号'])).size;
  const summary = [
    ['学生', run.students.length, '当前批次'],
    ['班级', classCount, '按班级编号统计'],
    ['作答记录', run.quality.raw_rows, '含版本与待处理记录'],
    ['有效评分', run.quality.eligible_scored, '计入得分统计'],
  ];
  const tasks = [
    { path: '/knowledge/indicators', title: '理解学科', icon: 'subject', description: '核对课程指标、关联题目和材料来源。' },
    { path: '/insights/classes', title: '理解学生', icon: 'insights', description: '比较两个班的表现，查看学生的原始作答。' },
    { path: '/plan/reviews', title: '理解教学', icon: 'teaching', description: '按作答证据生成草稿并完成教师复核。' },
  ] as const;
  const attention = run.quality.findings.filter(item => item.severity === 'WARN' || item.severity === 'ERROR');
  const exposedFindings = attention.slice(0, 3);
  return <>
    <section className="stat-grid" aria-label="当前运行摘要">
      {summary.map(([label, value, note]) => <article className="stat-block" key={label}>
        <span className="stat-label">{label}</span><strong>{value}</strong><small>{note}</small>
      </article>)}
    </section>
    <section className="overview-routes" aria-labelledby="overview-routes-title">
      <header className="section-heading"><h2 id="overview-routes-title">赛题任务</h2></header>
      <div className="entry-list">{tasks.map(task =>
        <button className="entry-link" key={task.path} onClick={() => onNavigate(task.path)}>
          <span className="entry-icon"><NavIcon name={task.icon} /></span>
          <span className="entry-copy"><strong>{task.title}</strong><span>{task.description}</span></span>
          <span className="entry-arrow" aria-hidden="true" />
        </button>
      )}</div>
    </section>
    <section className="overview-detail-grid">
      <article className="overview-panel attention-panel">
        <header className="overview-panel-header"><h2>需要留意</h2><span className={`attention-count${attention.length ? ' has-attention' : ''}`}>{attention.length ? `${attention.length} 项` : '无异常'}</span></header>
        {exposedFindings.length ? <ul className="attention-list">{exposedFindings.map((finding, index) => <li key={`${finding.code}:${finding.record_id}:${finding.source_line}:${index}`}><span className={`severity-dot severity-${finding.severity?.toLowerCase() ?? 'info'}`} aria-hidden="true" /><div><strong>{findingLabel(finding.code)} <span>{severityLabel(finding.severity)}</span></strong><p>{finding.detail}{finding.record_id ? ` · 记录 ${finding.record_id}` : ''}{finding.source_line ? ` · 第 ${finding.source_line} 行` : ''}</p></div></li>)}</ul> : <p className="empty-inline">当前快照没有需要人工处理的质量异常。</p>}
        <button className="text-action" onClick={() => onNavigate('/insights/quality')}>查看详情 <span aria-hidden="true">↗</span></button>
      </article>
      <article className="overview-panel scope-panel">
        <header className="overview-panel-header"><h2>分析范围与来源</h2></header>
        <p>覆盖 {run.nodes.length} 个测验节点。统计依据通过校验的作答；没有有效记录的范围不代表学生未掌握。</p>
        {readiness && <div className={`source-status-row ${readiness.sources.status === 'missing' ? 'needs-source' : ''}`}>
          <div><strong>来源 PDF</strong><span>{readiness.sources.status === 'missing' ? '当前未找到来源文件' : `找到 ${readiness.sources.pdf_count} 份，按指标核验`}</span></div>
          <button className="text-action" onClick={() => onNavigate('/knowledge/indicators')}>查看来源 <span aria-hidden="true">↗</span></button>
        </div>}
        <p className="scope-footnote">规则版本 {run.rule_version} · 原始行与事件按不同口径统计</p>
      </article>
    </section>
  </>;
}

function KnowledgePage({ run }: { run: AnalysisRun }) {
  return <>
    <p className="scope-summary">当前运行 {run.run_id} · {new Set(run.objectives.map(item => item['主题'] || item['主题编号'])).size} 个主题 · {run.objectives.length} 项指标。请选择指标核对关联与来源；待核验关系不作为已确认材料。</p>
    <ObjectivesPanel run={run} />
  </>;
}

function CaseEvidence({ run, suggestions, reviews, draft, onOpenReview }: { run: AnalysisRun; suggestions: CaseSuggestion[]; reviews: Record<string, Review[]>; draft: Draft | null; onOpenReview: (studentId: string, indicatorId: string, nodeId: string) => void }) {
  const [active, setActive] = useState('');
  const selected = suggestions.find(item => `${item.type}:${item.student_id}` === active);
  const evidence = selected ? (run.raw_responses ?? run.responses).filter(row => selected.evidence_record_ids.includes(row['记录编号'])) : [];
  const relatedReviews = selected ? Object.entries(reviews).flatMap(([key, history]) => history
    .filter(review => key.startsWith(`${selected.student_id}:`) && review.evidence_record_ids.some(id => selected.evidence_record_ids.includes(id)))
    .map(review => ({ key, review }))) : [];
  return <Panel id="case-candidates" title="候选与证据范围"><p className="muted">系统候选只用于进一步核对，不代表典型性或代表性结论。没有证据的候选应作为待补证对象。</p>
    {suggestions.length ? <div className="case-candidates">{suggestions.map(item => <details className="case-candidate" key={`${item.type}:${item.student_id}`} open={active === `${item.type}:${item.student_id}`} onToggle={event => { const key = `${item.type}:${item.student_id}`; if ((event.currentTarget as HTMLDetailsElement).open) setActive(key); else if (active === key) setActive(''); }}><summary>{item.type} · {item.student_id}{item.class_id ? ` · ${item.class_id}` : ''}</summary><p>{item.reason}</p><p>证据记录：{item.evidence_record_ids.join('、') || '暂无证据，待补充核验'}</p>{item.evidence_record_ids.length > 0 && <button className="secondary" onClick={() => setActive(`${item.type}:${item.student_id}`)}>查看候选证据</button>}</details>)}</div> : <p className="muted">当前运行没有返回案例候选。</p>}
    {selected && <div className="case-detail"><h3>{selected.student_id} 的可追溯记录</h3>{evidence.length ? evidence.map((record, index) => {
      const item = run.items.find(value => value['材料编号'] === record['材料编号']);
      const rubric = run.rubric_observations?.find(value => value.record_id === record['记录编号'] && value.student_id === record['学生编号'] && value.item_id === record['材料编号'] && value.node_id === record['节点编号']);
      const observation = run.observations.find(value => value.student_id === selected.student_id && value.indicator_id === item?.['指标编号'] && value.node_id === record['节点编号']);
      const linkedDraft = draft?.student_id === selected.student_id && draft.indicator_id === item?.['指标编号'] && draft.node_id === record['节点编号'] && draft.evidence_record_ids.includes(record['记录编号']) ? draft : null;
      return <details className="row" key={`${record['记录编号']}-${index}`}><summary>{record['记录编号']} · {record['材料编号']} · 节点 {record['节点编号']} · 修订 {record['修订版本']}</summary><p>题目：{item?.['题干或内容'] || '未提供题干'}</p><p>作答：{record['学生最终作答'] || '未作答'}</p><p>解答过程：{record['解答过程'] || '未提供'}</p><p>得分：{record['得分']}/{record['满分']} · 评分状态：{record['评分状态']}</p><p>评分点要求：{item?.['评分点'] || '未提供'} · 评分点得分原文：{record['评分点得分'] || '未提供'}</p><p>结构化评分点：{rubric?.state === 'valid' ? '校验一致' : rubric?.state === 'conflict' ? `存在冲突：${rubric.conflicts.join('、')}` : '未知，不能按 0 分处理'}</p>{rubric?.points.length ? <ul>{rubric.points.map(point => <li key={point.point_id}>{point.point_id}：{point.earned}/{point.maximum}</li>)}</ul> : null}<p>当前节点该学生有效评分数：{observation ? observation.scored_count : '无可用观察记录'}；可用题目数：{observation?.available_item_count ?? '未知'}。这不表示班级代表性。</p><small>记录 {record['记录编号']} · 事件 {record['作答事件编号']} · CSV 第 {record._source_line} 行</small>{item?.['指标编号'] && <div className="case-record-actions">{linkedDraft && <span className="tag">当前范围有待复核草稿</span>}<button className="secondary" onClick={() => onOpenReview(selected.student_id, item['指标编号'], record['节点编号'])}>在建议复核中查看此证据</button></div>}</details>;
    }) : <p className="muted">候选记录 ID 未能在当前运行证据中匹配；此候选不可作为已核实案例。</p>}
      <section className="case-reviews"><h3>关联的教师复核</h3>{relatedReviews.length ? relatedReviews.map(({ key, review }) => <details className="row" key={`${key}:${review.version}`}><summary>{key} · 节点 {review.node_id ?? review.original_draft?.node_id ?? '范围未记录'} · 版本 {review.version} · {review.status}</summary><p>诊断：{review.diagnosis}</p><p>建议：{review.recommendation}</p><p>复核理由：{review.reason}</p><small>关联证据：{review.evidence_record_ids.filter(id => selected?.evidence_record_ids.includes(id)).join('、')}</small></details>) : <p className="muted">当前候选证据没有关联的已保存复核版本。</p>}</section>
    </div>}
  </Panel>;
}

export function WorkbenchPage(props: PageProps) {
  const [reviewEdits, setReviewEdits] = useState<Record<string, ReviewFields>>({});
  const { path, run, onNavigate } = props;
  const [caseIds, setCaseIds] = useState(['', '', '']);
  const [caseRevision, setCaseRevision] = useState(0);
  const [readiness, setReadiness] = useState<WorkbenchReadiness>();
  const showReadiness = Boolean(run && (path === '/home' || path === '/plan/reviews'));
  useEffect(() => {
    if (!showReadiness) return;
    let active = true;
    learningApi.readiness().then(value => {
      if (active) setReadiness(value?.sources && value?.model ? value : undefined);
    }).catch(() => { if (active) setReadiness(undefined); });
    return () => { active = false; };
  }, [showReadiness, run?.run_id]);
  const [selectedReportNode, setSelectedReportNode] = useState('');
  const reportNode = run?.nodes.some(item => item['节点编号'] === selectedReportNode)
    ? selectedReportNode : run?.nodes[0]?.['节点编号'] ?? '';
  if (!run) return <EmptyRun onImported={props.onImported} onMessage={props.onMessage} />;
  const reviewNodes = [...new Set(run.responses.filter(row => row['学生编号'] === props.student && run.items.some(item => item['材料编号'] === row['材料编号'] && item['指标编号'] === props.indicator)).map(row => row['节点编号']))];
  const reviewKey = `${props.student}:${props.indicator}`;
  const review = (props.reviews[reviewKey] ?? []).filter(item => (item.node_id ?? item.original_draft?.node_id ?? null) === (props.node || (reviewNodes.length === 1 ? reviewNodes[0] : null))).at(-1);
  const reviewScope = `${run.run_id}:${reviewKey}:${props.node || (reviewNodes.length === 1 ? reviewNodes[0] : '')}`;
  const initialReviewFields = reviewEdits[reviewScope] ?? (review ? {
    status: review.status,
    diagnosis: review.diagnosis,
    recommendation: review.recommendation,
    adjustment_condition: review.adjustment_condition || '',
    reason: review.reason,
    reviewer: review.reviewer,
    structured_plan: review.teaching_plan_v2 ? null : review.structured_plan ?? null,
    teaching_plan_v2: review.teaching_plan_v2 ?? null,
    evidence_refs: review.evidence_refs ?? [],
  } : undefined);
  switch (path) {
    case '/home': return <Overview run={run} readiness={readiness} onNavigate={onNavigate} />;
    case '/knowledge/indicators': return <KnowledgePage run={run} />;
    case '/insights/classes': return <ClassPanel run={run} node={props.node} onNode={props.onNode} onOpenStudent={studentId => { props.onStudent(studentId); onNavigate('/insights/students'); }} />;
    case '/insights/students': return <StudentPanel run={run} student={props.student} indicator={props.indicator} node={props.node} onNode={props.onNode} onStudent={props.onStudent} onIndicator={props.onIndicator} onOpenEvidence={(recordId, sourceLine) => { if (recordId && sourceLine) props.onEvidenceFocus?.(recordId, sourceLine); onNavigate('/insights/evidence'); }} />;
    case '/insights/evidence': return <EvidencePanel run={run} student={props.student} indicator={props.indicator} node={props.node} onNode={props.onNode} focusEvidence={props.focusEvidence} />;
    case '/insights/quality': return <QualityPanel run={run} onOpenEvidence={scope => { props.onStudent(scope.studentId); props.onIndicator(scope.indicatorId); props.onNode(scope.nodeId); onNavigate('/insights/evidence'); }} />;
    case '/plan/reviews': return <>
      <section className="card review-range"><h2>教学范围与证据</h2><div className="scope-fields"><label>学生<select value={props.student} onChange={event => props.onStudent(event.target.value)}>{run.students.map(item => <option key={item['学生编号']} value={item['学生编号']}>{item['学生编号']} · {item['模拟班级编号']}</option>)}</select></label><label>观察指标<select value={props.indicator} onChange={event => props.onIndicator(event.target.value)}>{run.objectives.map(item => <option key={item['指标编号']} value={item['指标编号']}>{item['指标编号']} · {item['观察指标']}</option>)}</select></label><label>测验节点<select value={props.node} onChange={event => props.onNode(event.target.value)}><option value="">请选择测验节点</option>{run.nodes.map(item => <option key={item['节点编号']} value={item['节点编号']}>{item['节点编号']}</option>)}</select></label></div>
        {props.node && (() => { const observation = run.observations.find(item => item.student_id === props.student && item.indicator_id === props.indicator && item.node_id === props.node); return <div className="review-range-stats"><span>选中事件 <strong>{observation?.selected_count ?? 0}</strong></span><span>有效评分 <strong>{observation?.scored_count ?? 0}</strong></span><span className="is-pending">待评分 <strong>{observation?.pending_count ?? 0}</strong></span><span>未作答 <strong>{observation?.unanswered_count ?? 0}</strong></span><span className="is-excluded">排除 <strong>{observation?.excluded_count ?? 0}</strong></span>{!observation && <p className="muted">当前范围无观察记录，不能据此判断未掌握。</p>}</div>; })()}{props.node && <button className="secondary review-evidence-link" onClick={() => onNavigate('/insights/evidence')}>查看此范围作答证据</button>}
      </section>
      <ReviewPanel run={run} student={props.student} indicator={props.indicator} node={props.node} review={review} draft={props.draft} modelConfigured={readiness?.model.configured} onDraft={props.onDraft} onSave={props.onSave} initialFields={initialReviewFields} onFieldsChange={fields => setReviewEdits(old => ({ ...old, [reviewScope]: fields }))} />
      <details className="review-save-note"><summary>复核保存与导出说明</summary><p>复核版本保存诊断、建议、调整条件、结构化方案与证据引用。完整方案只在材料来源签核仍有效时进入导出。</p></details>
    </>;
    case '/plan/adjustments': return <TeachingAdjustmentsPanel run={run} reviews={props.reviews} />;
    case '/plan/cases': return <div className="cases-layout">
      <nav className="case-workflow" aria-label="案例与导出页内导航">
        <button className="text-action" onClick={() => document.getElementById('case-candidates')?.focus()}>候选与证据</button>
        <button className="text-action" onClick={() => document.getElementById('teacher-cases')?.focus()}>教师案例确认</button>
        <button className="text-action" onClick={() => document.getElementById('case-report')?.focus()}>三案例报告</button>
        <button className="text-action" onClick={() => document.getElementById('class-report')?.focus()}>两班报告</button>
        <button className="text-action" onClick={() => document.getElementById('release-checks')?.focus()}>成果包与预检</button>
      </nav>
      <CaseEvidence run={run} suggestions={props.suggestions} reviews={props.reviews} draft={props.draft} onOpenReview={(studentId, indicatorId, nodeId) => {
        props.onStudent(studentId);
        props.onIndicator(indicatorId);
        props.onNode(nodeId);
        onNavigate('/plan/reviews');
      }} />
      <TeacherCaseEditor run={run} reviews={props.reviews} onSaved={() => setCaseRevision(revision => revision + 1)} />
      <CaseReport key={caseRevision} run={run} ids={caseIds} onSelect={setCaseIds} />
      <ClassReport run={run} node={reportNode} onNode={setSelectedReportNode} />
      <ExportPanel key={JSON.stringify([caseIds, reportNode, caseRevision])} students={run.students} runId={run.run_id}
        ids={caseIds} node={reportNode} onNavigate={onNavigate} onExport={props.onExport} />
    </div>;
    default: return <Overview run={run} readiness={readiness} onNavigate={onNavigate} />;
  }
}
