export type ReviewStatus = 'accepted' | 'edited' | 'rejected' | 'needs_observation';
export type ReviewProvider = 'rule' | 'deepseek';

export interface ImportResult {
  run_id: string;
  quality: import('./analysis').QualityReport;
}
