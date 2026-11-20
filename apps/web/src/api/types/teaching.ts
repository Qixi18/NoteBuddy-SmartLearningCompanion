export interface Draft {
  student_id: string;
  indicator_id: string;
  node_id?: string | null;
  scope_required?: boolean;
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
  run_id?: string | null;
  rule_id?: string | null;
  evidence_kind?: string;
  observed_fact?: string;
  inference_limit?: string;
  unknown_reason?: string | null;
  steps?: string[];
  activity?: string;
  source_locator?: string | null;
  evidence_source_lines?: number[];
  resource_selection?: ResourceSelection | null;
  teaching_plan_preview?: TeachingPlanV2 | null;
  teaching_plan_preview_error?: string | null;
}

export interface TeachingPlanV2 {
  schema_version: 2;
  scope: { run_id: string; student_id: string; indicator_id: string; node_id: string };
  goal: string;
  purpose: 'remediation' | 'transfer' | 'diagnostic';
  material_ids: string[];
  resource_reasons: Array<{ material_id: string; resource_type: string; reason_codes: string[]; explanation: string }>;
  steps: string[];
  hints: Array<{ level: 'direction' | 'structure' | 'local_check'; student_prompt: string; teacher_note: string }>;
  observation_points: string[];
  adjustment_conditions: string[];
  evidence_refs: Array<{ evidence_id: string; record_id: string; material_id: string; source_line: number }>;
  source_versions: Record<string, number>;
  evidence_fingerprint: string;
  template_version: string;
  teacher_review_required: true;
}

export interface ResourceSelectionEntry {
  material_id: string;
  resource_type: string;
  title: string;
  purpose: string;
  reason_codes: string[];
  reason: string;
}

export interface ResourceSelection {
  status: 'ready' | 'blocked';
  purpose: 'remediation' | 'transfer' | 'diagnostic';
  practice_items: ResourceSelectionEntry[];
  learning_resources: ResourceSelectionEntry[];
  excluded: Array<{ material_id: string; reason_codes: string[]; reason: string }>;
  reason_codes: string[];
  candidate_node_item_count?: number | null;
}

export interface CaseSuggestion {
  student_id: string;
  class_id?: string;
  type: string;
  reason: string;
  evidence_record_ids: string[];
}
