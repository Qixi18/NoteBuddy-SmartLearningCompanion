import { useState } from 'react';
import type { AnalysisRun, AIAnalysisFinding, Draft, Review, ReviewStatus, StructuredPlan, TeachingPlanV2, WorkbenchReadiness, EvidenceReference } from '../api/types';
import type { NavigationView } from '../app/navigation';
import { AIAnalysisPanel } from '../features/ai-analysis/AIAnalysisPanel';
import { ReviewPanel } from '../features/task03/components/ReviewPanel';
import { TeachingAdjustmentsPanel } from '../features/task03/components/TeachingAdjustmentsPanel';

type ReviewFields = { status: ReviewStatus; diagnosis: string; recommendation: string; adjustment_condition: string; reason: string; reviewer: string; structured_plan: StructuredPlan | null; teaching_plan_v2: TeachingPlanV2 | null; evidence_refs?: EvidenceReference[] };

export function RecommendationsPage({ run, view, student, indicator, node, reviews, draft, readiness, review, initialFields, caseIds = ['', '', ''], onStudent, onIndicator, onNode, onDraft, onSave, onNavigate, onEvidence, onFieldsChange, onDataChanged, onDirtyChange, onBeforeScopeChange }: {
  run: AnalysisRun; view?: NavigationView; student: string; indicator: string; node: string; reviews: Record<string, Review[]>; draft: Draft | null; readiness?: WorkbenchReadiness; review?: Review; initialFields?: ReviewFields;
  caseIds?: string[];
  onStudent: (value: string) => void; onIndicator: (value: string) => void; onNode: (value: string) => void; onDraft: (provider: 'rule' | 'deepseek', node: string) => Promise<void>; onSave: (fields: ReviewFields) => Promise<void>; onNavigate: (path: string) => void; onEvidence: (ref: AIAnalysisFinding['evidence_refs'][number]) => void; onFieldsChange: (fields: ReviewFields) => void; onDataChanged?: () => void; onDirtyChange?: (dirty: boolean) => void; onBeforeScopeChange?: () => boolean;
}) {
  const [replaceCaseIndex, setReplaceCaseIndex] = useState(-1);
  const addToPreparation = (ids: string[]) => {
    const params = new URLSearchParams({ view: 'prepare', studentId: student });
    ids.slice(0, 3).forEach(id => params.append('caseId', id));
    onNavigate(`/cases?${params.toString()}`);
  };
  const addCurrentStudent = () => {
    if (!student) return;
    if (caseIds.includes(student)) {
      addToPreparation(caseIds);
      return;
    }
    const emptySlot = caseIds.findIndex(id => !id);
    if (emptySlot < 0) {
      setReplaceCaseIndex(-1);
      return;
    }
    const next = [...caseIds];
    next[emptySlot] = student;
    addToPreparation(next);
  };
  const recommendationNavigation = <nav className="recommendation-views" aria-label="学习建议视图">{([['read', '建议阅读与复核'], ['observe', '观察与调整']] as const).map(([target, label]) => <button type="button" key={target} className="text-action" aria-current={(view ?? 'read') === target ? 'page' : undefined} onClick={() => onNavigate(`/recommendations?view=${target}`)}>{label}</button>)}</nav>;
  if (view === 'observe') return <>{recommendationNavigation}<TeachingAdjustmentsPanel run={run} reviews={reviews} onSaved={onDataChanged} onDirtyChange={onDirtyChange} onBeforeScopeChange={onBeforeScopeChange} /></>;
  const observation = student && node ? run.observations.find(item => item.student_id === student && item.indicator_id === indicator && item.node_id === node) : undefined;
  return <>{recommendationNavigation}
    <section className="card review-range"><h2>学习建议范围</h2><div className="scope-fields"><label>学生<select value={student} onChange={event => onStudent(event.target.value)}><option value="">请选择学生</option>{run.students.map(item => <option key={item['学生编号']} value={item['学生编号']}>{item['学生编号']} · {item['模拟班级编号']}</option>)}</select></label><label>观察指标<select value={indicator} onChange={event => onIndicator(event.target.value)}>{run.objectives.map(item => <option key={item['指标编号']} value={item['指标编号']}>{item['指标编号']} · {item['观察指标']}</option>)}</select></label><label>测验节点<select value={node} onChange={event => onNode(event.target.value)}><option value="">请选择测验节点</option>{run.nodes.map(item => <option key={item['节点编号']} value={item['节点编号']}>{item['节点编号']}</option>)}</select></label></div>
      {observation && <div className="review-range-stats"><span>选中事件 <strong>{observation.selected_count}</strong></span><span>有效评分 <strong>{observation.scored_count}</strong></span><span className="is-pending">待评分 <strong>{observation.pending_count}</strong></span><span>未作答 <strong>{observation.unanswered_count}</strong></span><span className="is-excluded">排除 <strong>{observation.excluded_count}</strong></span></div>}{student && node && !observation && <p className="muted">当前范围无观察记录，不能据此判断未掌握。</p>}
      {student && node && <button className="secondary review-evidence-link" onClick={() => onNavigate(`/performance?view=evidence&studentId=${encodeURIComponent(student)}&indicatorId=${encodeURIComponent(indicator)}&nodeId=${encodeURIComponent(node)}`)}>查看此范围作答证据</button>}
      {student && <div className="case-preparation-action"><button type="button" className="secondary" onClick={addCurrentStudent}>{caseIds.includes(student) ? '前往案例准备' : '加入案例准备'}</button>{caseIds.includes(student) ? <span className="muted">该学生已在当前报告候选中。</span> : caseIds.every(Boolean) ? <><label>替换一名报告候选<select aria-label="选择要替换的报告候选" value={replaceCaseIndex} onChange={event => setReplaceCaseIndex(Number(event.target.value))}><option value={-1}>选择要替换的学生</option>{caseIds.map((id, index) => <option key={`${id}:${index}`} value={index}>第 {index + 1} 位 · {id}</option>)}</select></label><button type="button" disabled={replaceCaseIndex < 0} onClick={() => { const next = [...caseIds]; next[replaceCaseIndex] = student; addToPreparation(next); }}>替换所选候选并加入</button><p className="muted">已有三名不同候选；请选择要替换的一位。不会自动替换或创建、确认正式案例。</p></> : <span className="muted">只加入待选报告名单；不会自动创建或确认正式案例。</span>}</div>}
    </section>
    {!student ? <p className="scope-empty-state">请选择一名学生，再查看或生成对应范围的学习建议。</p> : !node ? <p className="scope-empty-state">请选择测验节点后查看此学生在对应范围内的建议。</p> : <ReviewPanel run={run} student={student} indicator={indicator} node={node} review={review} draft={draft} modelConfigured={readiness?.model.configured} onDraft={onDraft} onSave={async fields => { await onSave(fields); onDataChanged?.(); }} initialFields={initialFields} onFieldsChange={onFieldsChange} onDirtyChange={onDirtyChange} />}
    {student && node && <details className="ai-analysis-disclosure"><summary>辅助分析</summary><AIAnalysisPanel task="task03" runId={run.run_id} node={node} student={student} indicator={indicator} onEvidence={onEvidence} /></details>}
    <details className="review-save-note"><summary>复核保存与导出说明</summary><p>复核版本保存诊断、建议、调整条件、结构化方案与证据引用。完整方案只在材料来源签核仍有效时进入导出。</p></details>
  </>;
}
