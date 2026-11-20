import type { TeachingPlanV2 } from './teaching';

export interface CaseReportEvidence {
  kind: 'coverage' | 'response';
  record_id?: string;
  source_line?: number | null;
  node_id?: string;
  indicator_id?: string;
  material_id?: string;
  prompt?: string;
  answer?: string;
  work?: string;
  score?: string | number;
  maximum?: string | number;
  score_status?: string;
  source_locator?: string;
  description?: string;
}

export interface CaseReportReview {
  indicator_id: string;
  node_id: string;
  version: number;
  status: string;
  diagnosis: string;
  recommendation: string;
  reason: string;
  reviewer: string;
  structured_plan: { activity: string; steps: string[]; practice: string[]; observation_points: string[]; material_ids: string[] } | null;
  teaching_plan_v2: TeachingPlanV2 | null;
  source_verification_versions?: Record<string, number>;
  source_status: string;
}

export interface CaseReport {
  run_id: string;
  student_id: string;
  class_id: string;
  status: 'confirmed' | 'incomplete';
  message?: string;
  case_version?: number;
  reviewer?: string;
  reviewed_at?: string;
  narrative?: string;
  limitations?: string;
  evidence: CaseReportEvidence[];
  reviews: CaseReportReview[];
  adjustments: Array<Record<string, unknown>>;
}

export interface CaseReports {
  run_id: string;
  status: 'ready' | 'incomplete';
  cases: CaseReport[];
  comparison: Array<{ student_id: string; class_id: string; status: string; review_count: number; evidence_count: number; adjustment_count: number }>;
  limitations: string[];
}

export interface CompetitionClassReport {
  run_id: string;
  node_id: string;
  status: 'ready' | 'incomplete';
  classes: Array<{ class_id: string; student_count: number; student_ids: string[]; scored_record_count: number }>;
  comparisons: Array<{
    indicator_id: string;
    status: 'available' | 'unavailable_no_common_questions';
    common_material_ids: string[];
    difference: number | null;
    classes: Array<{ class_id: string; observed_student_count: number; scored_record_count: number; ratio: number | null; common_ratio: number | null; common_record_count: number }>;
  }>;
  common_observations: Array<{ indicator_id: string; issue_id: string; label: string; by_class: Array<{ class_id: string; affected_count: number; observed_student_count: number; evidence_refs: Array<{ record_id: string; source_line: number | null; material_id: string }> }> }>;
  limitations: string[];
}

export interface ReleaseCheck {
  id: string;
  label: string;
  status: 'passed' | 'blocked' | 'not_checked';
  category: 'machine' | 'human';
  detail: string;
}

export interface ReleasePreflight {
  run_id: string;
  case_ids: string[];
  node_id: string;
  checks: ReleaseCheck[];
  fingerprint: string;
  release_status: 'blocked' | 'ready_with_open_checks' | 'ready';
}

export interface SubmissionExportPayload {
  run_id: string;
  case_ids: string[];
  node_id: string;
  preflight_fingerprint: string;
  reviewer: string;
  content_reviewed: boolean;
}

