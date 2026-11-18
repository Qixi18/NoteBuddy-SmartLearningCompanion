import type { AnalysisRun, CaseSuggestion, Draft, ImportResult, ReviewMap, ReviewPayload, ReviewStatus, SourceVerification, SourceVerificationPayload, TeacherCase, TeacherCasePayload } from './types';

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
  run: () => api<AnalysisRun>('/api/run'),
  reviews: () => api<ReviewMap>('/api/reviews'),
  cases: () => api<CaseSuggestion[]>('/api/cases'),
  importFolder: (folder: string) => api<ImportResult>('/api/import', jsonRequest({ folder })),
  importFiles: (files: Record<string, string>) => api<ImportResult>('/api/import-files', jsonRequest({ files })),
  ruleDraft: (student: string, indicator: string, node?: string) => api<Draft>(`/api/draft?student=${encodeURIComponent(student)}&indicator=${encodeURIComponent(indicator)}${node ? `&node=${encodeURIComponent(node)}` : ''}`),
  modelDraft: (student: string, indicator: string, node?: string) => api<Draft>('/api/deepseek', jsonRequest({ student_id: student, indicator_id: indicator, node_id: node ?? null })),
  saveReview: (payload: ReviewPayload) => api<ReviewMap[string][number]>('/api/review', jsonRequest(payload)),
  sourceVerifications: () => api<Record<string, SourceVerification[]>>('/api/source-verifications'),
  saveSourceVerification: (payload: SourceVerificationPayload) => api<SourceVerification>('/api/source-verification', jsonRequest(payload)),
  teacherCases: () => api<Record<string, TeacherCase[]>>('/api/teacher-cases'),
  saveTeacherCase: (payload: TeacherCasePayload) => api<TeacherCase>('/api/teacher-case', jsonRequest(payload)),
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
