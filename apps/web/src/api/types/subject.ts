export interface Objective {
  '主题编号': string;
  '指标编号': string;
  '观察指标': string;
  '主题'?: string;
  '课标文件页／正文页'?: string;
  '教材正文页'?: string;
  '主题目标'?: string;
}

export interface LearningItem {
  '材料编号': string;
  '主题编号'?: string;
  '指标编号': string;
  '题干或内容'?: string;
  '评分点'?: string;
  '满分'?: string;
}

export interface SourceCheck {
  curriculum_file_page?: number;
  curriculum_body_page?: number;
  curriculum_check?: string;
  textbook_slices?: string[];
  textbook_check?: string;
}

export interface IndicatorCheck {
  topic_id?: string;
  status?: string;
  curriculum_locator?: string;
  textbook_locator?: string;
  reviewer?: string;
  checked_at?: string;
}

export interface SourceIndexEntry {
  indicator_id: string;
  topic_id: string;
  curriculum_reference?: string;
  textbook_reference?: string;
  source_check: SourceCheck;
  indicator_check?: IndicatorCheck;
  verification: string;
  integrity_issues?: string[];
}
