import { useState } from 'react';
import type { AnalysisRun, CaseSuggestion, Draft, Review } from '../api/types';
import type { NavigationView } from '../app/navigation';
import { Panel } from '../components/Panel';
import { TeacherCaseEditor } from '../features/task03/components/TeacherCaseEditor';
import { CaseReport } from '../features/export/CaseReport';
import { ClassReport } from '../features/export/ClassReport';
import { ExportPanel } from '../features/export/ExportPanel';

function CaseEvidence({ run, suggestions, reviews, draft, onOpenReview }: { run: AnalysisRun; suggestions: CaseSuggestion[]; reviews: Record<string, Review[]>; draft: Draft | null; onOpenReview: (studentId: string, indicatorId: string, nodeId: string) => void }) {
  const [active, setActive] = useState('');
  const selected = suggestions.find(item => `${item.type}:${item.student_id}` === active);
  const evidence = selected ? (run.raw_responses ?? run.responses).filter(row => selected.evidence_record_ids.includes(row['记录编号'])) : [];
  const relatedReviews = selected ? Object.entries(reviews).flatMap(([key, history]) => history.filter(review => key.startsWith(`${selected.student_id}:`) && review.evidence_record_ids.some(id => selected.evidence_record_ids.includes(id))).map(review => ({ key, review }))) : [];
  return <Panel id="case-candidates" title="候选与证据范围"><p className="muted">系统候选只用于进一步核对，不代表典型性或代表性结论。没有证据的候选应作为待补证对象。</p>
    {suggestions.length ? <div className="case-candidates">{suggestions.map(item => <details className="case-candidate" key={`${item.type}:${item.student_id}`} open={active === `${item.type}:${item.student_id}`} onToggle={event => { const key = `${item.type}:${item.student_id}`; if ((event.currentTarget as HTMLDetailsElement).open) setActive(key); else if (active === key) setActive(''); }}><summary>{item.type} · {item.student_id}{item.class_id ? ` · ${item.class_id}` : ''}</summary><p>{item.reason}</p><p>证据记录：{item.evidence_record_ids.join('、') || '暂无证据，待补充核验'}</p></details>)}</div> : <p className="muted">当前运行没有返回案例候选。</p>}
    {selected && <div className="case-detail"><h3>{selected.student_id} 的可追溯记录</h3>{evidence.length ? evidence.map((record, index) => { const item = run.items.find(value => value['材料编号'] === record['材料编号']); const rubric = run.rubric_observations?.find(value => value.record_id === record['记录编号'] && value.student_id === record['学生编号'] && value.item_id === record['材料编号'] && value.node_id === record['节点编号']); const observation = run.observations.find(value => value.student_id === selected.student_id && value.indicator_id === item?.['指标编号'] && value.node_id === record['节点编号']); const linkedDraft = draft?.student_id === selected.student_id && draft.indicator_id === item?.['指标编号'] && draft.node_id === record['节点编号'] && draft.evidence_record_ids.includes(record['记录编号']) ? draft : null;
      return <details className="row" key={`${record['记录编号']}-${index}`}><summary>{record['记录编号']} · {record['材料编号']} · 节点 {record['节点编号']} · 修订 {record['修订版本']}</summary><p>题目：{item?.['题干或内容'] || '未提供题干'}</p><p>作答：{record['学生最终作答'] || '未作答'}</p><p>解答过程：{record['解答过程'] || '未提供'}</p><p>得分：{record['得分']}/{record['满分']} · 评分状态：{record['评分状态']}</p><p>评分点要求：{item?.['评分点'] || '未提供'} · 评分点得分原文：{record['评分点得分'] || '未提供'}</p><p>结构化评分点：{rubric?.state === 'valid' ? '校验一致' : rubric?.state === 'conflict' ? `存在冲突：${rubric.conflicts.join('、')}` : '未知，不能按 0 分处理'}</p>{rubric?.points.length ? <ul>{rubric.points.map(point => <li key={point.point_id}>{point.point_id}：{point.earned}/{point.maximum}</li>)}</ul> : null}<p>当前节点该学生有效评分数：{observation ? observation.scored_count : '无可用观察记录'}；可用题目数：{observation?.available_item_count ?? '未知'}。这不表示班级代表性。</p><small>记录 {record['记录编号']} · 事件 {record['作答事件编号']} · CSV 第 {record._source_line} 行</small>{item?.['指标编号'] && <button className="secondary" onClick={() => onOpenReview(selected.student_id, item['指标编号'], record['节点编号'])}>在建议复核中查看此证据</button>}</details>;
    }) : <p className="muted">候选记录 ID 未能在当前运行证据中匹配；此候选不可作为已核实案例。</p>}
      <section className="case-reviews"><h3>关联的教师复核</h3>{relatedReviews.length ? relatedReviews.map(({ key, review }) => <details className="row" key={`${key}:${review.version}`}><summary>{key} · 节点 {review.node_id ?? review.original_draft?.node_id ?? '范围未记录'} · 版本 {review.version} · {review.status}</summary><p>诊断：{review.diagnosis}</p><p>建议：{review.recommendation}</p><p>复核理由：{review.reason}</p><small>关联证据：{review.evidence_record_ids.filter(id => selected?.evidence_record_ids.includes(id)).join('、')}</small></details>) : <p className="muted">当前候选证据没有关联的已保存复核版本。</p>}</section>
    </div>}
  </Panel>;
}

export function CasesPage({ run, view = 'prepare', suggestions, reviews, draft, ids, onSelect, student, node, onNode, dataRevision = 0, onDataChanged, onDirtyChange, onBeforeScopeChange, onNavigate, onExport }: {
  run: AnalysisRun; view?: NavigationView; suggestions: CaseSuggestion[]; reviews: Record<string, Review[]>; draft: Draft | null; ids: string[]; onSelect: (ids: string[]) => void; student?: string; node: string; onNode: (node: string) => void; dataRevision?: number; onDataChanged?: () => void; onDirtyChange?: (dirty: boolean) => void; onBeforeScopeChange?: () => boolean; onNavigate: (path: string) => void; onExport: (ids: string[]) => void;
}) {
  const [caseRevision, setCaseRevision] = useState(0);
  return <div className="cases-layout">
    <nav className="case-workflow" aria-label="案例与交付视图导航">{([['prepare', '案例准备'], ['report', '阅读报告'], ['check', '交付检查']] as const).map(([target, label]) => <button key={target} type="button" className={`text-action${view === target ? ' active' : ''}`} aria-current={view === target ? 'page' : undefined} onClick={() => onNavigate(`/cases?view=${target}`)}>{label}</button>)}</nav>
    <section hidden={view !== 'prepare'} aria-label="案例准备"><CaseEvidence run={run} suggestions={suggestions} reviews={reviews} draft={draft} onOpenReview={(studentId, indicatorId, nodeId) => onNavigate(`/recommendations?view=read&studentId=${encodeURIComponent(studentId)}&indicatorId=${encodeURIComponent(indicatorId)}&nodeId=${encodeURIComponent(nodeId)}`)} />
      <TeacherCaseEditor run={run} reviews={reviews} initialStudentId={student} onSaved={() => { setCaseRevision(revision => revision + 1); onDataChanged?.(); }} onDirtyChange={onDirtyChange} onBeforeScopeChange={onBeforeScopeChange} /></section>
    <section hidden={view !== 'report'} aria-label="阅读报告"><CaseReport key={`${caseRevision}:${dataRevision}`} run={run} ids={ids} onSelect={onSelect} /><ClassReport run={run} node={node} onNode={onNode} /></section>
    <section hidden={view !== 'check'} aria-label="交付检查"><ExportPanel key={JSON.stringify([ids, node, caseRevision, dataRevision])} students={run.students} runId={run.run_id} ids={ids} node={node} onNavigate={onNavigate} onExport={onExport} /></section>
  </div>;
}
