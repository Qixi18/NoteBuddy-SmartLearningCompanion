const dispositionLabels: Record<string, string> = {
  scored: '计入有效评分',
  pending: '待评分',
  unanswered: '未作答',
  superseded: '已由新修订替代',
  superseded_short: '已替代',
  scored_short: '已评分',
  excluded_short: '已排除',
  excluded: '已排除',
  unknown: '处置状态待核对',
};

const findingLabels: Record<string, string> = {
  invalid_score: '评分超出允许范围',
  multiple_revisions: '存在多个修订版本',
  pending: '有待评分记录',
  unanswered: '存在未作答记录',
  duplicate_or_missing_record_id: '记录编号为空或重复',
  broken_reference: '学生、材料或节点引用不存在',
  item_not_available: '材料不在测验节点范围内',
  topic_mismatch: '作答主题与材料不一致',
  unknown_indicator: '材料指标不在课程要求中',
  unknown_status: '存在无法识别的评分状态',
  status_score_conflict: '待评分或未作答记录带有分值',
  item_max_mismatch: '记录满分与材料满分不同',
  missing_event_id: '作答事件编号为空',
  invalid_revision: '修订版本信息无效',
  revision_conflict: '无法唯一确定最新修订版本',
  event_identity_conflict: '同一事件的学生、材料或节点不一致',
  rubric_conflict: '评分点与题目或总分不一致',
};

export function dispositionLabel(value: string | null | undefined): string {
  return value ? dispositionLabels[value] ?? '处置状态待核对' : '处置状态待核对';
}

export function findingLabel(value: string | null | undefined): string {
  return value ? findingLabels[value] ?? '需要核对的数据项' : '需要核对的数据项';
}

export function severityLabel(value: string | null | undefined): string {
  if (value === 'ERROR') return '已自动排除';
  if (value === 'WARN') return '总分保留';
  return '信息';
}
