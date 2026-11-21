import type { AnalysisRun } from '../api/types';
import type { AIAnalysisFinding } from '../api/types';
import { ObjectivesPanel } from '../features/task01/components/ObjectivesPanel';
import { AIAnalysisPanel } from '../features/ai-analysis/AIAnalysisPanel';

export function RequirementsPage({ run, indicator, onIndicator, onEvidence, onDataChanged, onDirtyChange }: {
  run: AnalysisRun;
  indicator: string;
  onIndicator: (id: string) => void;
  onEvidence: (ref: AIAnalysisFinding['evidence_refs'][number]) => void;
  onDataChanged?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const topics = new Set(run.objectives.map(item => item['主题'] || item['主题编号']));
  return <>
    <p className="scope-summary">当前运行 {run.run_id} · {topics.size} 个主题 · {run.objectives.length} 项指标。OCR自动提取来源文本；未确认的指标关系不会作为已确认材料。</p>
    <ObjectivesPanel run={run} indicatorId={indicator} onIndicatorChange={onIndicator} onSaved={onDataChanged} onDirtyChange={onDirtyChange} />
    <details className="ai-analysis-disclosure"><summary>辅助分析</summary><AIAnalysisPanel task="task01" runId={run.run_id} onEvidence={onEvidence} /></details>
  </>;
}
