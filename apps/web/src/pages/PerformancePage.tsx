import type { AnalysisRun } from '../api/types';
import type { NavigationView } from '../app/navigation';
import { switchViewHref } from '../app/navigation';
import { AIAnalysisPanel } from '../features/ai-analysis/AIAnalysisPanel';
import type { AIAnalysisFinding } from '../api/types';
import { ClassPanel } from '../features/task02/components/ClassPanel';
import { EvidencePanel } from '../features/task02/components/EvidencePanel';
import { QualityPanel } from '../features/task02/components/QualityPanel';
import { StudentPanel } from '../features/task02/components/StudentPanel';

export function PerformancePage({ run, view, student, indicator, node, focusEvidence, onStudent, onIndicator, onNode, onNavigate, onEvidenceFocus, onEvidence }: {
  run: AnalysisRun;
  view?: NavigationView;
  student: string;
  indicator: string;
  node: string;
  focusEvidence?: { recordId: string; sourceLine: number } | null;
  onStudent: (value: string) => void;
  onIndicator: (value: string) => void;
  onNode: (value: string) => void;
  onNavigate: (path: string) => void;
  onEvidenceFocus?: (recordId: string, sourceLine: number) => void;
  onEvidence: (ref: AIAnalysisFinding['evidence_refs'][number]) => void;
}) {
  const viewNavigation = <nav className="performance-views" aria-label="已有表现视图">{([['class', '班级比较'], ['student', '学生分析'], ['quality', '数据质量与处置']] as const).map(([target, label]) => <button type="button" key={target} className="text-action" aria-current={(view ?? 'class') === target ? 'page' : undefined} onClick={() => onNavigate(switchViewHref(window.location.hash, '/performance', target))}>{label}</button>)}</nav>;
  if (view === 'quality') return <>{viewNavigation}<QualityPanel run={run} onOpenEvidence={scope => onNavigate(`/performance?view=evidence&studentId=${encodeURIComponent(scope.studentId)}&indicatorId=${encodeURIComponent(scope.indicatorId)}&nodeId=${encodeURIComponent(scope.nodeId)}`)} /></>;
  if (view === 'evidence') return <>{viewNavigation}<EvidencePanel run={run} student={student} indicator={indicator} node={node} onNode={onNode} focusEvidence={focusEvidence} onClose={() => onNavigate(`/performance?view=student&studentId=${encodeURIComponent(student)}&indicatorId=${encodeURIComponent(indicator)}&nodeId=${encodeURIComponent(node)}`)} /></>;
  if (view === 'student') return <>{viewNavigation}<StudentPanel run={run} student={student} indicator={indicator} node={node} onNode={onNode} onStudent={onStudent} onIndicator={onIndicator} onOpenEvidence={(recordId, sourceLine) => { if (recordId && sourceLine) onEvidenceFocus?.(recordId, sourceLine); onNavigate(`/performance?view=evidence&studentId=${encodeURIComponent(student)}&indicatorId=${encodeURIComponent(indicator)}&nodeId=${encodeURIComponent(node)}${recordId ? `&recordId=${encodeURIComponent(recordId)}` : ''}${sourceLine ? `&sourceLine=${sourceLine}` : ''}`); }} onCreateRecommendation={() => onNavigate(`/recommendations?studentId=${encodeURIComponent(student)}&indicatorId=${encodeURIComponent(indicator)}&nodeId=${encodeURIComponent(node)}`)} /><details className="ai-analysis-disclosure"><summary>辅助分析</summary><AIAnalysisPanel task="task03" runId={run.run_id} node={node || run.nodes[0]?.['节点编号']} student={student} indicator={indicator} onEvidence={onEvidence} /></details></>;
  return <>{viewNavigation}<ClassPanel run={run} node={node} indicator={indicator} onNode={onNode} onOpenStudent={studentId => onNavigate(`/performance?view=student&studentId=${encodeURIComponent(studentId)}&indicatorId=${encodeURIComponent(indicator)}${node ? `&nodeId=${encodeURIComponent(node)}` : ''}`)} onNavigate={onNavigate} /><details className="ai-analysis-disclosure"><summary>辅助分析</summary><AIAnalysisPanel task="task02" runId={run.run_id} node={node || run.nodes[0]?.['节点编号']} onEvidence={onEvidence} /></details></>;
}
