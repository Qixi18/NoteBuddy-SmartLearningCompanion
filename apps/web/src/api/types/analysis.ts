import type { Objective, LearningItem, SourceIndexEntry } from './subject';

export interface QualityFinding {
  code: string;
  record_id: string | null;
  source_line: number | null;
  detail: string;
  event_id?: string | null;
  source_file?: string;
  severity?: 'INFO' | 'WARN' | 'ERROR';
  disposition?: string;
}

export interface QualityReport {
  raw_rows: number;
  events: number;
  selected_revisions: number;
  eligible_scored: number;
  excluded_record_ids: string[];
  finding_counts: Record<string, number>;
  findings: QualityFinding[];
  record_dispositions?: Array<{
    record_id: string | null;
    event_id: string | null;
    source_file: string;
    source_line: number | null;
    disposition: 'scored' | 'pending' | 'unanswered' | 'superseded' | 'excluded';
  }>;
  disposition_counts?: Record<string, number>;
  raw_status_counts?: Record<string, number>;
  event_disposition_counts?: Record<string, number>;
}

export interface Student {
  '学生编号': string;
  '模拟班级编号': string;
}

export interface ResponseRecord {
  '记录编号': string;
  '学生编号': string;
  '材料编号': string;
  '节点编号': string;
  '作答事件编号': string;
  '修订版本': string;
  '评分状态': string;
  '得分': string;
  '满分': string;
  '学生最终作答': string;
  '解答过程': string;
  '评分点得分': string;
  _source_line: number;
}

export interface Metric {
  kind: 'student' | 'class' | 'topic' | 'indicator' | 'item' | 'node' | 'student_indicator' | 'class_indicator' | 'student_node_indicator';
  key: string;
  score: number;
  maximum: number;
  ratio: number | null;
  count: number;
  record_ids: string[];
  event_ids: string[];
  node_id?: string;
  indicator_id?: string;
  student_id?: string | null;
  class_id?: string | null;
}

export interface Observation {
  student_id: string;
  class_id: string;
  indicator_id: string;
  selected_count: number;
  scored_count: number;
  pending_count: number;
  unanswered_count: number;
  excluded_count: number;
  record_ids: string[];
  node_id?: string | null;
  state?: 'scored' | 'pending' | 'unanswered' | 'excluded' | 'no_record' | 'not_measured' | 'unknown';
  unknown_reason?: string | null;
  available_item_count?: number;
  quarantined_count?: number;
  quarantined_record_ids?: string[];
}

export interface AnalysisRun {
  run_id: string;
  created_at: string;
  rule_version: string;
  quality: QualityReport;
  rubric_observations?: RubricObservation[];
  objectives: Objective[];
  items: LearningItem[];
  students: Student[];
  nodes: Array<{ '节点编号': string; '可用题目编号': string; '模拟测验日期'?: string; '已教及测量主题'?: string; '说明'?: string }>;
  metrics: Metric[];
  responses: ResponseRecord[];
  raw_responses?: ResponseRecord[];
  observations: Observation[];
  source_index: SourceIndexEntry[];
}

export type AIAnalysisTask = 'task01' | 'task02' | 'task03';
export interface AIAnalysisFinding {
  finding_id: string;
  category: string;
  claim: string;
  interpretation: string;
  support_level: 'supported' | 'limited' | 'conflicting' | 'unavailable';
  limitations: string;
  next_step: string;
  evidence_refs: Array<{
    kind: string;
    record_id?: string | null;
    student_id?: string | null;
    indicator_id?: string | null;
    node_id?: string | null;
    material_id?: string | null;
    name?: string | null;
    page?: number | null;
    source_line?: number | null;
    excerpt: string;
    alias?: string;
  }>;
}
export interface AIAnalysisResult {
  analysis_id: string;
  run_id: string;
  task: AIAnalysisTask;
  scope_key: string;
  scope: Record<string, unknown>;
  source_fingerprint: string;
  model: string;
  prompt_version: string;
  schema_version: string;
  generation: number;
  status: 'running' | 'complete' | 'partial' | 'insufficient_evidence' | 'failed';
  findings: AIAnalysisFinding[];
  coverage: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  stale: boolean;
}
export interface AIAnalysisPreview {
  analysis: AIAnalysisResult | null;
  stale: boolean;
  run_id: string;
  task: AIAnalysisTask;
  scope: Record<string, unknown>;
  scope_key: string;
  source_fingerprint: string;
  provider: string;
  model: string;
  model_configured: boolean;
  input_summary: { packet_count: number; record_count: number; evidence_count: number; objective_count: number };
}

export interface EvidenceBundle {
  scope: { run_id: string; student_id: string; indicator_id: string; node_id: string };
  responses: Array<{
    kind: 'response';
    evidence_id: string;
    record_id: string | null;
    event_id: string | null;
    source_line: number | null;
    student_id: string;
    indicator_id: string;
    node_id: string;
    material_id: string;
    state: string;
    score: string | null;
    maximum: string | null;
    raw_response: string;
    solution_steps: string;
    disposition: string;
    rubric_observation: Record<string, unknown> | null;
  }>;
  items: Array<{ material_id: string; prompt: string; maximum: string; rubric: string }>;
  rubric_definitions: Array<{ point_id: string; item_id: string; description: string; maximum: number }>;
  coverage: {
    expected_material_ids: string[];
    observed_material_ids: string[];
    unobserved_material_ids: string[];
    record_count: number;
    unknown_reason: string | null;
    evidence_id: string;
  };
  source_versions: Record<string, number>;
  source_context: { status: string; stale: boolean; topic_id?: string; material_ids?: string[]; resource_links?: Array<Record<string, unknown>>; rubric_mappings: Array<Record<string, unknown>> };
  issues: Array<Record<string, unknown>>;
  fingerprint: string;
}

export interface InsightEvidenceRef {
  evidence_id: string;
  record_id: string | null;
  source_line: number | null;
  material_id: string;
  description: string;
}

export interface InsightClaim {
  claim_id: string;
  kind: 'fact' | 'rule_observation' | 'hypothesis';
  text: string;
  evidence_refs: InsightEvidenceRef[];
  limitations: string[];
  review_status: 'not_reviewed' | 'teacher_reviewed';
}

export interface StudentInsights {
  scope: EvidenceBundle['scope'];
  bundle_fingerprint: string;
  claims: InsightClaim[];
}

export interface ClassInsights {
  run_id: string;
  node_id: string;
  classes: Array<{ class_id: string; student_count: number; student_ids: string[]; scored_record_count: number }>;
  comparisons: Array<{
    indicator_id: string;
    status: 'available' | 'unavailable_no_common_questions';
    common_material_ids: string[];
    classes: Array<{
      class_id: string;
      scored_record_count: number;
      observed_student_count: number;
      score: number;
      maximum: number;
      ratio: number | null;
      common_score: number | null;
      common_maximum: number | null;
      common_ratio: number | null;
      common_record_count: number;
    }>;
  }>;
  issues: Array<{
    indicator_id: string;
    issue_id: string;
    label: string;
    by_class: Array<{ class_id: string; affected_count: number; affected_student_ids: string[]; observed_student_count: number; evidence_refs: Array<{ record_id: string; source_line: number | null; material_id: string }> }>;
    limitations: string[];
  }>;
  limitations: string[];
}

export interface RubricObservation {
  record_id: string;
  event_id: string;
  student_id: string;
  item_id: string;
  node_id: string;
  state: 'valid' | 'conflict' | 'unknown';
  reason: string;
  conflicts: string[];
  points: Array<{ point_id: string; earned: number; maximum: number }>;
  total_score: number | null;
  total_maximum: number | null;
}
