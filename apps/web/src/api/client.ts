import type { AIAnalysisPreview, AIAnalysisResult, AIAnalysisTask, AnalysisRun, CaseReports, CaseSuggestion, ClassInsights, CompetitionClassReport, Draft, EvidenceBundle, ImportResult, MaterialCatalog, ReleasePreflight, ReviewMap, ReviewPayload, ReviewStatus, SourceVerification, SourceVerificationPayload, StudentInsights, SubmissionExportPayload, TeacherCase, TeacherCasePayload, TeachingAdjustment, TeachingAdjustmentCreate, TeachingAdjustmentUpdate } from './types';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(typeof body === 'object' && body && 'error' in body ? String(body.error) : `请求失败 (${response.status})`);
  return body as T;
}

export const jsonRequest = (body: unknown): RequestInit => ({
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export const learningApi = {
  aiAnalysisPreview: (task: AIAnalysisTask, runId: string, node?: string, student?: string, indicator?: string) => api<AIAnalysisPreview>(`/api/ai-analysis?${new URLSearchParams({ task, run_id: runId, ...(node ? { node_id: node } : {}), ...(student ? { student_id: student } : {}), ...(indicator ? { indicator_id: indicator } : {}) })}`),
  generateAIAnalysis: (payload: { task: AIAnalysisTask; run_id: string; node_id?: string; student_id?: string; indicator_id?: string; action: 'generate' | 'refresh' | 'retry_failed'; request_id: string; analysis_id?: string; transmission_confirmed: true }) => api<AIAnalysisResult>('/api/ai-analysis', jsonRequest(payload)),
  run: () => api<AnalysisRun>('/api/run'),
  reviews: () => api<ReviewMap>('/api/reviews'),
  cases: () => api<CaseSuggestion[]>('/api/cases'),
  importFolder: (folder: string) => api<ImportResult>('/api/import', jsonRequest({ folder })),
  importFiles: (files: Record<string, string>) => api<ImportResult>('/api/import-files', jsonRequest({ files })),
  ruleDraft: (student: string, indicator: string, node?: string) => api<Draft>(`/api/draft?student=${encodeURIComponent(student)}&indicator=${encodeURIComponent(indicator)}${node ? `&node=${encodeURIComponent(node)}` : ''}`),
  modelDraft: (student: string, indicator: string, node?: string) => api<Draft>('/api/deepseek', jsonRequest({ student_id: student, indicator_id: indicator, node_id: node ?? null })),
  saveReview: (payload: ReviewPayload) => api<ReviewMap[string][number]>('/api/review', jsonRequest(payload)),
  sourceVerifications: () => api<Record<string, SourceVerification[]>>('/api/source-verifications'),
  materialCatalog: () => api<MaterialCatalog>('/api/material-catalog'),
  evidenceBundle: (student: string, indicator: string, node: string) => api<EvidenceBundle>(`/api/evidence-bundle?${new URLSearchParams({ student, indicator, node })}`),
  studentInsights: (student: string, indicator: string, node: string) => api<StudentInsights>(`/api/student-insights?${new URLSearchParams({ student, indicator, node })}`),
  classInsights: (node: string) => api<ClassInsights>(`/api/class-insights?${new URLSearchParams({ node })}`),
  caseReports: (students: string[]) => api<CaseReports>(`/api/reports/cases?${students.map(student => `students=${encodeURIComponent(student)}`).join('&')}`),
  classReport: (node: string) => api<CompetitionClassReport>(`/api/reports/class?${new URLSearchParams({ node })}`),
  releaseChecks: (caseIds: string[], node: string, reviewer: string, contentReviewed: boolean) => api<ReleasePreflight>(`/api/release-checks?${[...caseIds.map(id => `case_ids=${encodeURIComponent(id)}`), `node=${encodeURIComponent(node)}`, `reviewer=${encodeURIComponent(reviewer)}`, `content_reviewed=${contentReviewed}`].join('&')}`),
  async exportSubmission(payload: SubmissionExportPayload): Promise<Blob> {
    const response = await fetch('/api/export-submission', jsonRequest(payload));
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body === 'object' && body && 'error' in body ? String(body.error) : `请求失败 (${response.status})`);
    }
    return response.blob();
  },
  saveSourceVerification: (payload: SourceVerificationPayload) => api<SourceVerification>('/api/source-verification', jsonRequest(payload)),
  teacherCases: () => api<Record<string, TeacherCase[]>>('/api/teacher-cases'),
  saveTeacherCase: (payload: TeacherCasePayload) => api<TeacherCase>('/api/teacher-case', jsonRequest(payload)),
  teachingAdjustments: () => api<TeachingAdjustment[]>('/api/teaching-adjustments'),
  createTeachingAdjustment: (payload: TeachingAdjustmentCreate) => api<TeachingAdjustment>('/api/teaching-adjustments', jsonRequest(payload)),
  updateTeachingAdjustment: (id: string, payload: TeachingAdjustmentUpdate) => api<TeachingAdjustment>(`/api/teaching-adjustments/${encodeURIComponent(id)}`, { ...jsonRequest(payload), method: 'PATCH' }),
  exportUrl: (studentIds: string[]) => `/api/export?cases=${encodeURIComponent(studentIds.join(','))}`,
  sourceUrl: (file: string) => `/api/source?file=${encodeURIComponent(file)}`,
  async reviewHistory(key: string) {
    const reviews = await learningApi.reviews();
    return reviews[key] ?? [];
  },
};

export function isReviewStatus(value: string): value is ReviewStatus {
  return ['accepted', 'edited', 'rejected', 'needs_observation'].includes(value);
}
