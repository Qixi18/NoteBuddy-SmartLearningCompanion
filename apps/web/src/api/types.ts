export type ReviewStatus = 'accepted' | 'edited' | 'rejected' | 'needs_observation';
export type ReviewProvider = 'rule' | 'deepseek';

export interface QualityFinding {
  code: string;
  record_id: string;
  source_line: number;
  detail: string;
}

export interface QualityReport {
  raw_rows: number;
  events: number;
  selected_revisions: number;
  eligible_scored: number;
  excluded_record_ids: string[];
  finding_counts: Record<string, number>;
  findings: QualityFinding[];
}

export interface Objective {
  '主题编号': string;
  '指标编号': string;
  '观察指标': string;
  '主题'?: string;
  '课标文件页／正文页'?: string;
  '教材正文页'?: string;
  '主题目标'?: string;
}

export interface LearningItem {
  '材料编号': string;
  '主题编号'?: string;
  '指标编号': string;
  '题干或内容'?: string;
  '评分点'?: string;
  '满分'?: string;
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
  kind: 'student' | 'class' | 'topic' | 'indicator' | 'item' | 'node' | 'student_indicator' | 'class_indicator';
  key: string;
  score: number;
  maximum: number;
  ratio: number | null;
  count: number;
  record_ids: string[];
  event_ids: string[];
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
}

export interface SourceCheck {
  curriculum_file_page?: number;
  curriculum_body_page?: number;
  curriculum_check?: string;
  textbook_slices?: string[];
  textbook_check?: string;
}

export interface SourceIndexEntry {
  indicator_id: string;
  topic_id: string;
  curriculum_reference?: string;
  textbook_reference?: string;
  source_check: SourceCheck;
  verification: string;
}

export interface AnalysisRun {
  run_id: string;
  created_at: string;
  rule_version: string;
  quality: QualityReport;
  objectives: Objective[];
  items: LearningItem[];
  students: Student[];
  nodes: Array<{ '节点编号': string; '可用题目编号': string }>;
  metrics: Metric[];
  responses: ResponseRecord[];
  observations: Observation[];
  source_index: SourceIndexEntry[];
}

export interface Draft {
  student_id: string;
  indicator_id: string;
  objective: string;
  diagnosis: string;
  recommendation: string;
  adjustment_condition: string;
  material_ids: string[];
  score_points_to_review: string[];
  observation_point: string;
  evidence_record_ids: string[];
  observed_record_ids: string[];
  source: string;
  status: string;
  prompt_version: string | null;
  model: string | null;
}

export interface ReviewPayload {
  student_id: string;
  indicator_id: string;
  status: ReviewStatus;
  diagnosis: string;
  recommendation: string;
  adjustment_condition: string;
  reason: string;
  source: string;
  model?: string | null;
  prompt_version?: string | null;
  evidence_record_ids: string[];
  original_draft?: Draft;
}

export interface Review extends Omit<ReviewPayload, 'student_id' | 'indicator_id' | 'original_draft'> {
  version: number;
  original_draft: Draft | null;
  reviewer: string;
  updated_at: string;
}

export type ReviewMap = Record<string, Review[]>;

export interface CaseSuggestion {
  student_id: string;
  type: string;
  reason: string;
  evidence_record_ids: string[];
}

export interface ImportResult {
  run_id: string;
  quality: QualityReport;
}
