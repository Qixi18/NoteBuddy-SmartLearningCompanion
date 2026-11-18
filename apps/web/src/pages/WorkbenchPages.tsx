import { useState } from 'react';
import type { AnalysisRun, CaseSuggestion, Draft, Review, ReviewStatus, StructuredPlan } from '../api/types';
import { Panel } from '../components/Panel';
import { ImportPanel } from '../features/import/ImportPanel';
import { ObjectivesPanel } from '../features/task01/components/ObjectivesPanel';
import { ClassPanel } from '../features/task02/components/ClassPanel';
import { StudentPanel } from '../features/task02/components/StudentPanel';
import { EvidencePanel } from '../features/task02/components/EvidencePanel';
import { QualityPanel } from '../features/task02/components/QualityPanel';
import { ReviewPanel } from '../features/task03/components/ReviewPanel';
import { TeacherCaseEditor } from '../features/task03/components/TeacherCaseEditor';
import { ExportPanel } from '../features/export/ExportPanel';
import { routes, type RoutePath } from '../app/navigation';

type ReviewFields = { status: ReviewStatus; diagnosis: string; recommendation: string; adjustment_condition: string; reason: string; reviewer: string; structured_plan: StructuredPlan | null };
type PageProps = {
  path: RoutePath;
  run: AnalysisRun | null;
  reviews: Record<string, Review[]>;
  suggestions: CaseSuggestion[];
  student: string;
  indicator: string;
  node: string;
  draft: import('../api/types').Draft | null;
  onStudent: (value: string) => void;
  onIndicator: (value: string) => void;
  onNode: (value: string) => void;
  onDraft: (provider: 'rule' | 'deepseek', node: string) => Promise<void>;
  onSave: (fields: ReviewFields) => Promise<void>;
  onExport: (ids: string[]) => void;
  onNavigate: (path: RoutePath) => void;
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

function Overview({ run, onNavigate }: { run: AnalysisRun; onNavigate: (path: RoutePath) => void }) {
  const classCount = new Set(run.students.map(student => student['模拟班级编号'])).size;
  const summary = [
    ['学生', run.students.length, '当前快照中的学生记录'],
    ['班级', classCount, '按学生班级编号去重'],
    ['原始作答行', run.quality.raw_rows, '包含待评分、未作答及旧修订'],
    ['有效已评分', run.quality.eligible_scored, '作为有效评分统计分母'],
  ];
  return <>
    <section className="stat-grid" aria-label="当前运行摘要">{summary.map(([label, value, note]) => <div className="stat-block" key={String(label)}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}
    </section>
    <section className="overview-meta"><p>规则版本 {run.rule_version} · 创建于 {new Date(run.created_at).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}</p><p>范围仅限当前快照；不同测验节点分别统计，不能据此推断进步。</p></section>
    <section className="overview-routes" aria-labelledby="overview-routes-title">
      <h2 id="overview-routes-title">继续查看</h2>
      <div className="entry-list">
        {routes.filter(route => ['/knowledge/indicators', '/insights/classes', '/plan/reviews'].includes(route.path)).map(route => <button className="entry-link" key={route.path} onClick={() => onNavigate(route.path)}><strong>{route.section}</strong><span>{route.description}</span><span aria-hidden="true">查看　→</span></button>)}
      </div>
    </section>
    <section className="quality-summary" aria-label="数据质量摘要"><div><h2>数据质量</h2><p>{run.quality.findings.length ? `发现 ${run.quality.findings.length} 项问题；核对原始行和处置状态后，再解释统计结果。` : '当前运行没有数据质量问题。'}</p></div><button className="secondary" onClick={() => onNavigate('/insights/quality')}>查看详情</button></section>
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
  return <Panel title="候选与证据范围"><p className="muted">系统候选只用于进一步核对，不代表典型性或代表性结论。没有证据的候选应作为待补证对象。</p>
    {suggestions.length ? suggestions.map(item => <details className="row" key={`${item.type}:${item.student_id}`} open={active === `${item.type}:${item.student_id}`} onToggle={event => { const key = `${item.type}:${item.student_id}`; if ((event.currentTarget as HTMLDetailsElement).open) setActive(key); else if (active === key) setActive(''); }}><summary>{item.type} · {item.student_id}</summary><p>{item.reason}</p><p>证据记录：{item.evidence_record_ids.join('、') || '暂无证据，待补充核验'}</p>{item.evidence_record_ids.length > 0 && <button className="secondary" onClick={() => setActive(`${item.type}:${item.student_id}`)}>查看候选证据</button>}</details>) : <p className="muted">当前运行没有返回案例候选。</p>}
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
    structured_plan: review.structured_plan ?? null,
  } : undefined);
  switch (path) {
    case '/home': return <Overview run={run} onNavigate={onNavigate} />;
    case '/knowledge/indicators': return <KnowledgePage run={run} />;
    case '/insights/classes': return <ClassPanel run={run} node={props.node} onNode={props.onNode} onOpenStudent={studentId => { props.onStudent(studentId); onNavigate('/insights/students'); }} />;
    case '/insights/students': return <StudentPanel run={run} student={props.student} indicator={props.indicator} node={props.node} onNode={props.onNode} onStudent={props.onStudent} onIndicator={props.onIndicator} onOpenEvidence={() => onNavigate('/insights/evidence')} />;
    case '/insights/evidence': return <EvidencePanel run={run} student={props.student} indicator={props.indicator} node={props.node} onNode={props.onNode} />;
    case '/insights/quality': return <QualityPanel run={run} />;
    case '/plan/reviews': return <>
      <Panel title="教学范围与证据"><div className="scope-fields"><label>学生<select value={props.student} onChange={event => props.onStudent(event.target.value)}>{run.students.map(item => <option key={item['学生编号']} value={item['学生编号']}>{item['学生编号']} · {item['模拟班级编号']}</option>)}</select></label><label>观察指标<select value={props.indicator} onChange={event => props.onIndicator(event.target.value)}>{run.objectives.map(item => <option key={item['指标编号']} value={item['指标编号']}>{item['指标编号']} · {item['观察指标']}</option>)}</select></label><label>测验节点<select value={props.node} onChange={event => props.onNode(event.target.value)}><option value="">请选择测验节点</option>{run.nodes.map(item => <option key={item['节点编号']} value={item['节点编号']}>{item['节点编号']}</option>)}</select></label></div>
        {props.node && (() => { const observation = run.observations.find(item => item.student_id === props.student && item.indicator_id === props.indicator && item.node_id === props.node); return <p className="muted">选中事件 {observation?.selected_count ?? 0} · 有效已评分 {observation?.scored_count ?? 0} · 待评分 {observation?.pending_count ?? 0} · 未作答 {observation?.unanswered_count ?? 0} · 排除 {observation?.excluded_count ?? 0}。{!observation && '当前范围无观察记录，不能据此判断未掌握。'}</p>; })()}{props.node && <button className="secondary" onClick={() => onNavigate('/insights/evidence')}>查看此范围作答证据</button>}
      </Panel>
      <ReviewPanel run={run} student={props.student} indicator={props.indicator} node={props.node} review={review} draft={props.draft} onDraft={props.onDraft} onSave={props.onSave} initialFields={initialReviewFields} onFieldsChange={fields => setReviewEdits(old => ({ ...old, [reviewScope]: fields }))} />
      <details className="review-save-note"><summary>复核保存与导出说明</summary><p>复核版本保存诊断、建议、调整条件、结构化方案与证据引用。完整方案只在材料来源签核仍有效时进入导出。</p></details>
    </>;
    case '/plan/cases': return <><CaseEvidence run={run} suggestions={props.suggestions} reviews={props.reviews} draft={props.draft} onOpenReview={(studentId, indicatorId, nodeId) => { props.onStudent(studentId); props.onIndicator(indicatorId); props.onNode(nodeId); onNavigate('/plan/reviews'); }} /><TeacherCaseEditor run={run} reviews={props.reviews} /><ExportPanel students={run.students} suggestions={props.suggestions} onExport={props.onExport} /></>;
    default: return <Overview run={run} onNavigate={onNavigate} />;
  }
}
