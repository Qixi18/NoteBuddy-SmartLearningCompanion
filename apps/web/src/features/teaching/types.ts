/**
 * Task03 学生个性化教学建议的数据契约。
 *
 * 这里只描述后端已经验证过的结构；页面和组件不得在此之外补造字段，
 * 也不得把缺失字段当成"暂时为 0"的默认值展示。
 */
import type { Row } from '../shared/workbenchTypes';

export type PlanPurpose = 'remediation' | 'transfer' | 'diagnostic';
export type HintLevel = 'direction' | 'structure' | 'local_check';
export type PlanStatus =
  | 'ready'
  | 'blocked'
  | 'requires_scoring'
  | 'requires_source_verification'
  | 'requires_scope_selection';

export interface PlanScope {
  run_id: string;
  student_id: string;
  indicator_id: string;
  node_id: string;
}

export interface PlanHint {
  level: HintLevel;
  student_prompt: string;
  teacher_note?: string;
}

export interface PlanResourceReason {
  material_id: string;
  resource_type: string;
  reason_codes: string[];
  explanation: string;
}

export interface PlanEvidenceRef {
  kind: 'response' | 'coverage';
  evidence_id: string;
  record_id: string;
  material_id: string;
  source_line: number;
}

export interface TeachingPlanV2 {
  schema_version: 2;
  scope: PlanScope;
  goal: string;
  purpose: PlanPurpose;
  material_ids: string[];
  resource_reasons: PlanResourceReason[];
  steps: string[];
  hints: PlanHint[];
  observation_points: string[];
  adjustment_conditions: string[];
  evidence_refs: PlanEvidenceRef[];
  source_versions: Record<string, number>;
  evidence_fingerprint: string;
  template_version: string;
  teacher_review_required: true;
}

export interface ResourceSelectionEntry {
  material_id: string;
  resource_type: string;
  title: string;
  purpose?: string;
  source_file?: string;
  locator?: string;
  source_verified?: boolean;
  indicator_id?: string;
  node_ids?: string[];
  reason_codes: string[];
  reason: string;
  reason_details: Array<{ code: string; description: string }>;
}

export interface ResourceSelectionExcluded {
  material_id: string;
  reason_codes: string[];
  reason: string;
}

export interface ResourceSelection {
  status: 'ready' | 'blocked';
  purpose: PlanPurpose;
  practice_items: ResourceSelectionEntry[];
  learning_resources: ResourceSelectionEntry[];
  excluded: ResourceSelectionExcluded[];
  reason_codes: string[];
  candidate_node_item_count?: number | null;
}

export interface Draft {
  run_id?: string | null;
  student_id: string;
  indicator_id: string;
  node_id?: string | null;
  scope_required?: boolean;
  objective?: string;
  diagnosis: string;
  recommendation: string;
  adjustment_condition: string;
  observed_fact?: string;
  inference_limit?: string;
  unknown_reason?: string | null;
  score_points_to_review?: string[];
  observation_point?: string;
  evidence_record_ids: string[];
  observed_record_ids?: string[];
  rule_id?: string | null;
  evidence_kind?: string | null;
  steps?: string[];
  activity?: string | null;
  source_locator?: string | null;
  resource_selection?: ResourceSelection | null;
  teaching_plan_preview?: TeachingPlanV2 | null;
  teaching_plan_preview_error?: string | null;
  plan_status: PlanStatus;
  source?: 'rule' | 'deepseek';
  [key: string]: unknown;
}

export interface InsightClaim {
  claim_id?: string;
  kind: string;
  text: string;
  evidence_refs?: Array<{ record_id?: string; material_id?: string; description?: string }>;
  limitations?: string[];
}

export interface StudentInsights {
  scope?: Record<string, string>;
  claims?: InsightClaim[];
}

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  ready: '可生成方案',
  blocked: '方案已阻塞',
  requires_scoring: '等待完成评分',
  requires_source_verification: '等待来源核验',
  requires_scope_selection: '等待选择测验节点',
};

export const PURPOSE_LABELS: Record<PlanPurpose, string> = {
  remediation: '补救与巩固',
  transfer: '迁移观察',
  diagnostic: '补充诊断',
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  accepted: '已采纳',
  edited: '修改后采纳',
  rejected: '已驳回',
  needs_observation: '继续观察',
};

export const EVIDENCE_KIND_LABELS: Record<string, string> = {
  unknown: '证据状态未知',
  scope: '节点范围事实',
  pending: '待评分记录',
  unanswered: '未作答记录',
  no_record: '无作答记录',
  none: '无有效证据',
  score_and_rubric_conflict: '得分与评分点冲突',
  repeated_mapped_rubric_loss: '重复失分评分点',
  item_score: '题目得分事实',
  full_score_items: '题目满分事实',
  single_full_score_item: '单题满分事实',
};

export const HINT_LEVEL_LABELS: Record<HintLevel, string> = {
  direction: '方向提示',
  structure: '结构提示',
  local_check: '局部检查',
};

/** 只把方案中 kind=response 的引用转成复核接口需要的记录编号。 */
export function planResponseRecordIds(plan: TeachingPlanV2 | null | undefined): string[] {
  if (!plan) return [];
  return [...new Set(plan.evidence_refs.filter(ref => ref.kind === 'response').map(ref => ref.record_id).filter(Boolean))];
}

export function isCoveragePlan(plan: TeachingPlanV2 | null | undefined): boolean {
  return Boolean(plan && plan.evidence_refs.length && plan.evidence_refs.every(ref => ref.kind === 'coverage'));
}

/** 把任意对象安全收窄为 V2 方案，避免把半成品 JSON 当成正式方案渲染。 */
export function asTeachingPlan(value: unknown): TeachingPlanV2 | null {
  if (!value || typeof value !== 'object') return null;
  const plan = value as Partial<TeachingPlanV2>;
  if (plan.schema_version !== 2 || !plan.scope || !plan.goal) return null;
  return plan as TeachingPlanV2;
}

export function materialEntryMap(selection: ResourceSelection | null | undefined): Map<string, ResourceSelectionEntry> {
  const map = new Map<string, ResourceSelectionEntry>();
  for (const entry of [...(selection?.practice_items ?? []), ...(selection?.learning_resources ?? [])]) {
    map.set(entry.material_id, entry);
  }
  return map;
}

export function planToRow(plan: TeachingPlanV2): Row {
  return plan as unknown as Row;
}
