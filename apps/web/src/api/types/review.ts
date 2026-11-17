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
}

export interface Review extends Omit<ReviewPayload, 'student_id' | 'indicator_id' | 'original_draft'> {
  node_id: string | null;
  version: number;
  original_draft: Draft | null;
  reviewer: string;
  updated_at: string;
}

export type ReviewMap = Record<string, Review[]>;
