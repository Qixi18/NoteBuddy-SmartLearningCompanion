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
