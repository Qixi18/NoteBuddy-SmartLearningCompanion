export type ReviewStatus = 'accepted' | 'edited' | 'rejected' | 'needs_observation';
export type ReviewProvider = 'rule' | 'deepseek';

export interface ImportResult {
  run_id: string;
  quality: import('./analysis').QualityReport;
}

export interface WorkbenchReadiness {
  sources: { status: 'available_unverified' | 'missing'; pdf_count: number };
  model: { configured: boolean };
}
