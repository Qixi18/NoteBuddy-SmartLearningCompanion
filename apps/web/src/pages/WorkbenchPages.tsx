import { useEffect, useState } from 'react';
import { learningApi } from '../api/client';
import type { AnalysisRun, CaseSuggestion, Draft, EvidenceReference, Review, ReviewStatus, StructuredPlan, TeachingPlanV2, WorkbenchReadiness } from '../api/types';
import { ImportPanel } from '../features/import/ImportPanel';
import { parseNavigationHash, type NavigationView } from '../app/navigation';
import { AIAnalysisPanel } from '../features/ai-analysis/AIAnalysisPanel';
import type { AIAnalysisFinding } from '../api/types';
import { StartPage } from './StartPage';
import { RequirementsPage } from './RequirementsPage';
import { PerformancePage } from './PerformancePage';
import { CasesPage } from './CasesPage';
import { RecommendationsPage } from './RecommendationsPage';

type ReviewFields = { status: ReviewStatus; diagnosis: string; recommendation: string; adjustment_condition: string; reason: string; reviewer: string; structured_plan: StructuredPlan | null; teaching_plan_v2: TeachingPlanV2 | null; evidence_refs?: EvidenceReference[] };
type PageProps = {
  path: string;
  view?: NavigationView;
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
  onNavigate: (path: string) => void;
  onEvidenceFocus?: (recordId: string, sourceLine: number) => void;
  onImported?: (id: string) => Promise<void>;
  onMessage?: (text: string, error?: boolean) => void;
  onDataChanged?: () => void;
  dataRevision?: number;
  caseIds?: string[];
  onCaseIds?: (ids: string[]) => void;
  reportNodeId?: string;
  onReportNode?: (id: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBeforeScopeChange?: () => boolean;
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

export function WorkbenchPage(props: PageProps) {
  const [reviewEdits, setReviewEdits] = useState<Record<string, ReviewFields>>({});
  const { path, run, onNavigate } = props;
  const route = parseNavigationHash(`#${path}`);
  const canonicalPath = route.path;
  const localView = props.view ?? route.view;
  const [readiness, setReadiness] = useState<WorkbenchReadiness>();
  const showReadiness = Boolean(run && (canonicalPath === '/home' || canonicalPath === '/recommendations'));
  useEffect(() => {
    if (!showReadiness) return;
    let active = true;
    learningApi.readiness().then(value => {
      if (active) setReadiness(value?.sources && value?.model ? value : undefined);
    }).catch(() => { if (active) setReadiness(undefined); });
    return () => { active = false; };
  }, [showReadiness, run?.run_id]);
  const reportNode = run?.nodes.some(item => item['节点编号'] === props.reportNodeId)
    ? props.reportNodeId ?? '' : run?.nodes[0]?.['节点编号'] ?? '';
  if (!run) return <EmptyRun onImported={props.onImported} onMessage={props.onMessage} />;
  const openAiEvidence = (ref: AIAnalysisFinding['evidence_refs'][number]) => {
    if (ref.record_id && ref.source_line) {
      props.onEvidenceFocus?.(ref.record_id, ref.source_line);
      const params = new URLSearchParams({ view: 'evidence', recordId: ref.record_id, sourceLine: String(ref.source_line) });
      if (ref.student_id) params.set('studentId', ref.student_id);
      if (ref.indicator_id) params.set('indicatorId', ref.indicator_id);
      if (ref.node_id) params.set('nodeId', ref.node_id);
      onNavigate(`/performance?${params.toString()}`);
    } else if (ref.indicator_id) {
      onNavigate(`/requirements?indicatorId=${encodeURIComponent(ref.indicator_id)}`);
    }
  };
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
  switch (canonicalPath) {
    case '/home': return <StartPage run={run} readiness={readiness} student={props.student} node={props.node} draft={props.draft} review={review} onNavigate={onNavigate} />;
    case '/requirements': return <RequirementsPage run={run} indicator={props.indicator} onIndicator={props.onIndicator} onEvidence={openAiEvidence} onDataChanged={props.onDataChanged} onDirtyChange={props.onDirtyChange} />;
    case '/performance': return <PerformancePage run={run} view={localView} student={props.student} indicator={props.indicator} node={props.node} focusEvidence={props.focusEvidence} onStudent={props.onStudent} onIndicator={props.onIndicator} onNode={props.onNode} onNavigate={onNavigate} onEvidenceFocus={props.onEvidenceFocus} onEvidence={openAiEvidence} />;
    case '/recommendations': return <RecommendationsPage run={run} view={localView} student={props.student} indicator={props.indicator} node={props.node} reviews={props.reviews} draft={props.draft} readiness={readiness} review={review} initialFields={initialReviewFields} caseIds={props.caseIds} onStudent={props.onStudent} onIndicator={props.onIndicator} onNode={props.onNode} onDraft={props.onDraft} onSave={props.onSave} onNavigate={onNavigate} onEvidence={openAiEvidence} onFieldsChange={fields => setReviewEdits(old => ({ ...old, [reviewScope]: fields }))} onDataChanged={props.onDataChanged} onDirtyChange={props.onDirtyChange} onBeforeScopeChange={props.onBeforeScopeChange} />;
    case '/cases': return <CasesPage run={run} view={localView} suggestions={props.suggestions} reviews={props.reviews} draft={props.draft} ids={props.caseIds ?? ['', '', '']} onSelect={props.onCaseIds ?? (() => undefined)} student={props.student} node={reportNode} onNode={props.onReportNode ?? (() => undefined)} dataRevision={props.dataRevision} onDataChanged={props.onDataChanged} onDirtyChange={props.onDirtyChange} onBeforeScopeChange={props.onBeforeScopeChange} onNavigate={onNavigate} onExport={props.onExport} />;
    default: return <StartPage run={run} readiness={readiness} student={props.student} node={props.node} draft={props.draft} review={review} onNavigate={onNavigate} />;
  }
}
