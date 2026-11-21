import type { Draft, TeachingPlanV2 } from './teaching';
import type { ReviewStatus } from './common';

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
  evidence_refs?: EvidenceReference[];
  original_draft?: Draft;
  reviewer?: string;
  structured_plan?: StructuredPlan | null;
  teaching_plan_v2?: TeachingPlanV2 | null;
}

export interface EvidenceReference {
  kind: 'coverage' | 'response';
  evidence_id: string;
  scope: { run_id: string; student_id: string; indicator_id: string; node_id: string };
  record_id?: string | null;
  source_line?: number | null;
}

export interface StructuredPlan {
  material_ids: string[];
  activity: string;
  steps: string[];
  practice: string[];
  observation_points: string[];
}

export interface SourceVerification {
  run_id: string;
  indicator_id: string;
  status: 'pending' | 'verified' | 'rejected';
  curriculum_locator: string;
  textbook_locator: string;
  material_ids: string[];
  knowledge_links: Array<{ target_indicator_id: string; relation: string; evidence: string }>;
  rubric_mappings?: Array<{
    issue_id: string;
    label?: string;
    rubric_point_ids: string[];
    material_ids?: string[];
    evidence?: string;
    reviewer?: string;
    status: 'pending' | 'verified';
  }>;
  resource_links?: Array<ResourceLink>;
  source_fingerprints?: Record<string, string>;
  stale?: boolean;
  reviewer: string;
  reason: string;
  version: number;
  reviewed_at: string;
  // 契约 #5：机器核验层署名与证据快照（机器核验管线的记录才携带）。
  verified_by?: string | null;
  confidence?: number | null;
  machine_evidence?: Array<{
    type: string;
    material_id?: string;
    slice?: string;
    page?: number;
    keywords_matched?: string[];
    keywords_total?: number;
    excerpt?: string;
    confidence?: number;
  }>;
}

export interface ResourceLink {
  material_id: string;
  purpose: string;
  indicator_ids: string[];
  allowed_node_ids: string[];
  source_locator: string;
  evidence: string;
  status: 'pending' | 'verified';
  resource_type?: string;
  content_hash?: string;
}

export type SourceVerificationPayload = Omit<SourceVerification, 'run_id' | 'version' | 'reviewed_at'> & { expected_version?: number };

export interface TeacherCase {
  run_id: string;
  student_id: string;
  status: 'draft' | 'confirmed' | 'rejected';
  narrative: string;
  limitations: string;
  evidence_record_ids: string[];
  evidence_refs?: EvidenceReference[];
  review_refs: Array<{ indicator_id: string; node_id: string; version: number }>;
  reviewer: string;
  version: number;
  reviewed_at: string;
}

export type TeacherCasePayload = Omit<TeacherCase, 'run_id' | 'version' | 'reviewed_at'>;

export interface TeachingAdjustment {
  adjustment_id: string;
  student_id: string;
  indicator_id: string;
  origin_run_id: string;
  origin_node_id: string;
  review_version: number;
  origin_evidence_refs?: EvidenceReference[];
  planned_activity: string;
  planned_practice: string[];
  observation_points: string[];
  teacher: string;
  planned_at: string;
  implementation: string;
  implementation_status: 'completed' | 'partial' | 'not_completed';
  outcome_observations: string;
  followup_run_id: string | null;
  followup_node_id: string | null;
  followup_evidence_record_ids: string[];
  followup_evidence_refs?: EvidenceReference[];
  comparability: 'pending' | 'comparable' | 'not_comparable' | 'undetermined';
  comparability_reason: string;
  teacher_conclusion: string;
  reviewer: string;
  concluded_at: string | null;
  created_at: string;
  updated_at: string;
  history: Array<Pick<TeachingAdjustment, 'implementation' | 'implementation_status' | 'outcome_observations' | 'followup_run_id' | 'followup_node_id' | 'followup_evidence_record_ids' | 'followup_evidence_refs' | 'comparability' | 'comparability_reason' | 'teacher_conclusion' | 'reviewer' | 'concluded_at' | 'updated_at'>>;
}

export type TeachingAdjustmentCreate = Pick<TeachingAdjustment, 'student_id' | 'indicator_id' | 'origin_run_id' | 'origin_node_id' | 'review_version' | 'origin_evidence_refs' | 'planned_activity' | 'planned_practice' | 'observation_points' | 'teacher' | 'planned_at'>;
export type TeachingAdjustmentUpdate = Pick<TeachingAdjustment, 'implementation' | 'implementation_status' | 'outcome_observations' | 'followup_run_id' | 'followup_node_id' | 'followup_evidence_record_ids' | 'followup_evidence_refs' | 'comparability' | 'comparability_reason' | 'teacher_conclusion' | 'reviewer' | 'concluded_at'>;

export interface Review extends Omit<ReviewPayload, 'student_id' | 'indicator_id' | 'original_draft'> {
  node_id: string | null;
  version: number;
  original_draft: Draft | null;
  reviewer: string;
  updated_at: string;
  source_verification_versions?: Record<string, number>;
  teaching_plan_v2?: TeachingPlanV2 | null;
}

export type ReviewMap = Record<string, Review[]>;
