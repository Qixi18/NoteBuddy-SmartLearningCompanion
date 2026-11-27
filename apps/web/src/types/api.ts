export interface QualityReport {
  raw_rows: number;
  events: number;
  selected_revisions: number;
  eligible_scored: number;
  excluded_record_ids: string[];
  finding_counts: Record<string, number>;
  findings: Array<Record<string, unknown>>;
  disposition_counts: Record<string, number>;
}

export interface RunData {
  run_id: string;
  created_at: string;
  /** 学科名称：由导入数据提供时展示，缺失时界面显示“未提供”。 */
  subject?: string;
  quality: QualityReport;
  objectives: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  students: Array<Record<string, unknown>>;
  nodes: Array<Record<string, unknown>>;
  node_ordering_ambiguous_ids?: string[];
  responses: Array<Record<string, unknown>>;
  metrics: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
}

export interface ClassSummary {
  class_id: string;
  student_count: number;
  student_ids: string[];
  scored_record_count: number;
  raw_record_count: number;
}

export interface ClassComparison {
  indicator_id: string;
  status: string;
  common_material_ids: string[];
  classes: Array<{
    class_id: string;
    scored_record_count: number;
    observed_student_count: number;
    ratio: number | null;
    common_ratio: number | null;
    common_record_count: number;
  }>;
}

export interface ClassInsights {
  run_id: string;
  node_id: string;
  classes: ClassSummary[];
  comparisons: ClassComparison[];
  issues: Array<Record<string, unknown>>;
  limitations: string[];
}

export interface CaseCandidate {
  student_id: string;
  class_id: string;
  type: string;
  reason: string;
  evidence_record_ids: string[];
}

export interface Readiness {
  status?: string;
  model?: { configured?: boolean; provider?: string; model?: string };
  [key: string]: unknown;
}

export interface ApiProblem extends Error {
  status?: number;
  code?: string;
  requestId?: string;
}

/** 机器核验的逐项检查（来源/课标/教材/题目关联/引用/指纹）。 */
export interface VerificationCheck {
  id: string;
  label: string;
  status: 'passed' | 'failed' | 'skipped';
  detail: string;
}

export type VerificationStatus = 'verified' | 'needs_review' | 'skipped';

export interface MachineVerificationResult {
  indicator_id: string;
  status: VerificationStatus;
  verified_by: string | null;
  /** 证据不足时的稳定原因码：TEXT_UNAVAILABLE / CURRICULUM_MISMATCH / … */
  reason_code: string | null;
  reason: string;
  confidence: number | null;
  verification_version: number | null;
  version: number | null;
  checks: VerificationCheck[];
  evidence: Record<string, unknown>;
}

export interface MachineVerificationSummary {
  total: number;
  verified: number;
  needs_review: number;
  skipped: number;
}

export interface MachineVerificationResponse {
  run_id: string | null;
  summary: MachineVerificationSummary;
  results: MachineVerificationResult[];
  verified: Array<Record<string, unknown>>;
  skipped: Array<{ indicator_id: string; reason: string }>;
}

/** AI 来源映射预览：确认前先看清会向模型发送哪些文件与页数。 */
export interface SourceMappingPreview {
  run_id: string;
  indicator_ids: string[];
  provider: string;
  model: string;
  billing_unit?: string;
  cache_behavior?: string;
  source_files: Array<{ name: string; pages?: number[]; lines?: number[] }>;
  source_count: number;
  input_bytes: number;
  fingerprint: string;
}

export interface SourceMappingResult {
  run_id: string;
  results: Array<Record<string, unknown> & { indicator_id?: string; status?: string; error?: string }>;
}

export interface SourceVerificationEvidence {
  type: string;
  file?: string;
  slice?: string;
  page?: number | null;
  text_source?: string;
  keywords_matched?: string[];
  keywords_total?: number;
  match_ratio?: number;
  excerpt?: string;
}

