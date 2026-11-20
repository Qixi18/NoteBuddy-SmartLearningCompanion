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
