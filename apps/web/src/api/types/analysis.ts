import type { Objective, LearningItem, SourceIndexEntry } from './subject';

export interface QualityFinding {
  code: string;
  record_id: string;
  source_line: number;
  detail: string;
}

export interface QualityReport {
  raw_rows: number;
  events: number;
  selected_revisions: number;
  eligible_scored: number;
  excluded_record_ids: string[];
  finding_counts: Record<string, number>;
  findings: QualityFinding[];
}

export interface Student {
  '学生编号': string;
  '模拟班级编号': string;
}

export interface ResponseRecord {
  '记录编号': string;
  '学生编号': string;
  '材料编号': string;
  '节点编号': string;
  '作答事件编号': string;
  '修订版本': string;
  '评分状态': string;
  '得分': string;
  '满分': string;
  '学生最终作答': string;
  '解答过程': string;
  '评分点得分': string;
  _source_line: number;
}

export interface Metric {
  kind: 'student' | 'class' | 'topic' | 'indicator' | 'item' | 'node' | 'student_indicator' | 'class_indicator';
  key: string;
  score: number;
  maximum: number;
  ratio: number | null;
  count: number;
  record_ids: string[];
  event_ids: string[];
}

export interface Observation {
  student_id: string;
  class_id: string;
  indicator_id: string;
  selected_count: number;
  scored_count: number;
  pending_count: number;
  unanswered_count: number;
  excluded_count: number;
  record_ids: string[];
}

export interface AnalysisRun {
  run_id: string;
  created_at: string;
  rule_version: string;
  quality: QualityReport;
  objectives: Objective[];
  items: LearningItem[];
  students: Student[];
  nodes: Array<{ '节点编号': string; '可用题目编号': string }>;
  metrics: Metric[];
  responses: ResponseRecord[];
  observations: Observation[];
  source_index: SourceIndexEntry[];
}
