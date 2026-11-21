export type ReviewStatus = 'accepted' | 'edited' | 'rejected' | 'needs_observation';
export type ReviewProvider = 'rule' | 'deepseek';

export interface ImportResult {
  run_id: string;
  quality: import('./analysis').QualityReport;
  source_parsing?: {
    provider?: string;
    purpose?: string;
    status?: 'complete' | 'partial' | 'failed' | 'no_sources' | 'not_requested';
    file_count?: number;
    parsed_file_count?: number;
    files?: Record<string, { status?: string; page_count?: number; reason?: string }>;
  };
}

export interface WorkbenchReadiness {
  sources: { status: 'available_unverified' | 'missing'; pdf_count: number };
  model: { configured: boolean };
  deepseek_ocr?: { configured: boolean };
}
