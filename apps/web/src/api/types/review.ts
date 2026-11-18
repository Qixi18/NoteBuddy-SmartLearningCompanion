import type { Draft } from './teaching';
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
  original_draft?: Draft;
  reviewer?: string;
  structured_plan?: StructuredPlan | null;
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
  reviewer: string;
  reason: string;
  version: number;
  reviewed_at: string;
}

export type SourceVerificationPayload = Omit<SourceVerification, 'run_id' | 'version' | 'reviewed_at'>;

export interface TeacherCase {
  run_id: string;
  student_id: string;
  status: 'draft' | 'confirmed' | 'rejected';
  narrative: string;
  limitations: string;
  evidence_record_ids: string[];
  review_refs: Array<{ indicator_id: string; node_id: string; version: number }>;
  reviewer: string;
  version: number;
  reviewed_at: string;
}

export type TeacherCasePayload = Omit<TeacherCase, 'run_id' | 'version' | 'reviewed_at'>;

export interface Review extends Omit<ReviewPayload, 'student_id' | 'indicator_id' | 'original_draft'> {
  node_id: string | null;
  version: number;
  original_draft: Draft | null;
  reviewer: string;
  updated_at: string;
  source_verification_versions?: Record<string, number>;
}

export type ReviewMap = Record<string, Review[]>;
