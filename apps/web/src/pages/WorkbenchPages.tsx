import { useState } from 'react';
import type { AnalysisRun, CaseSuggestion, Draft, Review, ReviewStatus } from '../api/types';
import { Panel } from '../components/Panel';
import { ObjectivesPanel } from '../features/task01/components/ObjectivesPanel';
import { ClassPanel } from '../features/task02/components/ClassPanel';
import { StudentPanel } from '../features/task02/components/StudentPanel';
import { EvidencePanel } from '../features/task02/components/EvidencePanel';
import { QualityPanel } from '../features/task02/components/QualityPanel';
import { ReviewPanel } from '../features/task03/components/ReviewPanel';
import { ExportPanel } from '../features/export/ExportPanel';
import { routes, type RoutePath } from '../app/navigation';

type ReviewFields = { status: ReviewStatus; diagnosis: string; recommendation: string; adjustment_condition: string; reason: string };
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
};

function EmptyRun({ onNavigate }: { onNavigate: (path: RoutePath) => void }) {
  return <section className="empty-state"><h2>还没有可查看的分析运行</h2><p>导入包含六类 CSV 的目录后，概览和业务页面会读取当前接口返回的数据。</p><button onClick={() => onNavigate('/home')}>返回全局概览</button></section>;
}

function Overview({ run, onNavigate }: { run: AnalysisRun; onNavigate: (path: RoutePath) => void }) {
  const classCount = new Set(run.students.map(student => student['模拟班级编号'])).size;
  const summary = [
    ['学生', run.students.length, '当前快照中的学生记录'],
    ['班级', classCount, '按学生班级编号去重'],
    ['原始作答行', run.quality.raw_rows, '包含待评分、未作答及旧修订'],
    ['作答事件', run.quality.events, '按事件编号归并原始行'],
    ['选中修订', run.quality.selected_revisions, '事件中选择的有效修订'],
    ['有效已评分', run.quality.eligible_scored, '作为有效评分统计分母'],
  ];
  return <>
    <section className="stat-grid" aria-label="当前运行摘要">{summary.map(([label, value, note]) => <div className="stat-block" key={String(label)}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}
    </section>
    <section className="overview-meta"><p>当前运行 <strong>{run.run_id}</strong> · 规则版本 {run.rule_version} · 创建于 {run.created_at}</p><p>数据范围仅限此快照；各节点分别统计，不能据此推断跨节点进步。</p></section>
    <ClassPanel run={run} />
    <section className="entry-list" aria-label="业务入口">
      {routes.filter(route => ['/knowledge/indicators', '/insights/classes', '/plan/reviews'].includes(route.path)).map(route => <button className="entry-link" key={route.path} onClick={() => onNavigate(route.path)}><strong>{route.section}</strong><span>{route.description}</span><span aria-hidden="true">查看 →</span></button>)}
    </section>
    <div className="grid"><QualityPanel run={run} /><Panel title="当前能力边界"><p className="muted">跨节点趋势、共性错误聚合、完整知识关系图和结构化方案保存尚未由当前契约支持。</p><p>赛事独立评测兼容性尚未使用组织方数据验证。</p><span className="tag">部分支持</span><h3>站外赛事交付物</h3><ul className="deliverable-list"><li><strong>方案 PDF</strong><span>不超过 20 页 · 待站外准备与核验</span></li><li><strong>演示视频</strong><span>MP4 不超过 5 分钟 · 待站外准备与核验</span></li><li><strong>答辩 PPT</strong><span>站外提交材料 · 待站外准备与核验</span></li></ul><small>Web 不读取这些材料的文件状态，因此不会显示虚构的完成状态。</small></Panel></div>
  </>;
}

function KnowledgePage({ run, sourcesOnly = false }: { run: AnalysisRun; sourcesOnly?: boolean }) {
  return <>
    <div className="grid"><Panel title="当前指标范围"><strong className="stat">{run.objectives.length}</strong><p>个目标 / 观察指标来自当前分析快照</p><p>关联题目数以指标明细为准，来源状态保留待核验与异常提示。</p></Panel><Panel title="知识关系图 · 待建设"><span className="tag">待建设</span><p>当前 API 只提供指标、题目关联和来源索引，尚无经过核验的完整知识关系图或覆盖率结论。</p></Panel></div>
    <ObjectivesPanel run={run} />
    {sourcesOnly && <Panel title="来源核验边界"><p>来源链接来自当前运行的来源索引。指标级页码与材料映射仍需人工核验；待核验、异常和缺失状态不代表已确认。</p><p className="muted">课程标准或教材链接仅在接口提供有效定位时显示。</p></Panel>}
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
    <div className="placeholder"><span className="tag">部分支持</span><p>案例叙述、教师逐项确认和导出前内容预览尚无持久化契约。当前 ZIP 包不等于完整案例报告；请人工补充背景、证据解释和课堂反思。</p></div>
  </Panel>;
}

export function WorkbenchPage(props: PageProps) {
  const [reviewEdits, setReviewEdits] = useState<Record<string, ReviewFields>>({});
  const { path, run, onNavigate } = props;
  if (!run) return <EmptyRun onNavigate={onNavigate} />;
  const reviewNodes = [...new Set(run.responses.filter(row => row['学生编号'] === props.student && run.items.some(item => item['材料编号'] === row['材料编号'] && item['指标编号'] === props.indicator)).map(row => row['节点编号']))];
  const reviewKey = `${props.student}:${props.indicator}`;
  const review = (props.reviews[reviewKey] ?? []).filter(item => (item.node_id ?? item.original_draft?.node_id ?? null) === (props.node || (reviewNodes.length === 1 ? reviewNodes[0] : null))).at(-1);
  const reviewScope = `${reviewKey}:${props.node || (reviewNodes.length === 1 ? reviewNodes[0] : '')}`;
  const initialReviewFields = reviewEdits[reviewScope] ?? (review ? {
    status: review.status,
    diagnosis: review.diagnosis,
    recommendation: review.recommendation,
    adjustment_condition: review.adjustment_condition || '',
    reason: review.reason,
  } : undefined);
  switch (path) {
    case '/home': return <Overview run={run} onNavigate={onNavigate} />;
    case '/knowledge/indicators': return <KnowledgePage run={run} />;
    case '/knowledge/sources': return <KnowledgePage run={run} sourcesOnly />;
    case '/insights/classes': return <ClassPanel run={run} onOpenStudent={studentId => { props.onStudent(studentId); onNavigate('/insights/students'); }} />;
    case '/insights/students': return <StudentPanel run={run} student={props.student} indicator={props.indicator} node={props.node} onNode={props.onNode} onStudent={props.onStudent} onIndicator={props.onIndicator} onOpenEvidence={() => onNavigate('/insights/evidence')} />;
    case '/insights/evidence': return <EvidencePanel run={run} student={props.student} indicator={props.indicator} node={props.node} onNode={props.onNode} />;
    case '/insights/quality': return <QualityPanel run={run} />;
    case '/plan/reviews': return <>
      <StudentPanel run={run} student={props.student} indicator={props.indicator} node={props.node} onNode={props.onNode} onStudent={props.onStudent} onIndicator={props.onIndicator} />
      <ReviewPanel student={props.student} indicator={props.indicator} node={props.node} nodes={reviewNodes} onNode={props.onNode} review={review} draft={props.draft} onDraft={props.onDraft} onSave={props.onSave} initialFields={initialReviewFields} onFieldsChange={fields => setReviewEdits(old => ({ ...old, [reviewScope]: fields }))} />
      <Panel title="结构化方案编辑 · 待建设"><span className="tag">待建设</span><p>当前复核接口可保存诊断、建议、调整条件、理由、状态和证据 ID；材料、活动步骤、观察点及评分点的独立修改尚不能持久化。</p></Panel>
      <Panel title="分析边界 · 待建设"><p>此快照不支持跨节点进步或总体掌握情况推断。共性问题分类、材料选择理由和建议优先级尚无经核验字段。</p></Panel>
    </>;
    case '/plan/cases': return <><CaseEvidence run={run} suggestions={props.suggestions} reviews={props.reviews} draft={props.draft} onOpenReview={(studentId, indicatorId, nodeId) => { props.onStudent(studentId); props.onIndicator(indicatorId); props.onNode(nodeId); onNavigate('/plan/reviews'); }} /><ExportPanel students={run.students} suggestions={props.suggestions} onExport={props.onExport} /></>;
    default: return <Overview run={run} onNavigate={onNavigate} />;
  }
}
