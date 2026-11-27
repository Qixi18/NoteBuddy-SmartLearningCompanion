import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { CaseCandidate, ClassInsights, Readiness, RunData } from '../types/api';

export type Row = Record<string, unknown>;

/**
 * 所有缓存键都带 run_id 与业务范围：切换运行或切换班级/节点/学生/指标不会复用旧数据。
 */
export const queryKeys = {
  run: ['run'] as const,
  readiness: ['readiness'] as const,
  cases: (runId: string, nodeId: string) => ['cases', runId, nodeId] as const,
  classInsights: (runId: string, nodeId: string) => ['class-insights', runId, nodeId] as const,
  materialCatalog: (runId: string) => ['material-catalog', runId] as const,
  sourceVerifications: (runId: string) => ['source-verifications', runId] as const,
  aiSourceMappings: (runId: string) => ['ai-source-mappings', runId] as const,
  knowledgeCandidates: (runId: string, indicatorId: string) => ['knowledge-candidates', runId, indicatorId] as const,
  studentInsights: (runId: string, nodeId: string, studentId: string, indicatorId: string) =>
    ['student-insights', runId, nodeId, studentId, indicatorId] as const,
  evidenceBundle: (runId: string, nodeId: string, studentId: string, indicatorId: string) =>
    ['evidence-bundle', runId, nodeId, studentId, indicatorId] as const,
  draft: (runId: string, nodeId: string, studentId: string, indicatorId: string) =>
    ['draft', runId, nodeId, studentId, indicatorId] as const,
  reviews: (runId: string) => ['reviews', runId] as const,
  teacherCases: (runId: string) => ['teacher-cases', runId] as const,
  teachingAdjustments: (runId: string, studentId: string) => ['teaching-adjustments', runId, studentId] as const,
  classReport: (runId: string, nodeId: string) => ['class-report', runId, nodeId] as const,
  classTeachingPlans: (runId: string, classId: string, nodeId: string) =>
    ['class-teaching-plans', runId, classId, nodeId] as const,
};

/**
 * 自动核验会改变来源核验记录，并影响下游教学建议、发布预检等业务数据。
 * 这里按《课程来源自动核验开发规划》5.4 的清单失效相关缓存，不整页刷新。
 */
export const sourceVerificationAffectedKeys = [
  ['source-verifications'],
  ['material-catalog'],
  ['knowledge-candidates'],
  ['ai-source-mappings'],
  ['class-insights'],
  ['student-insights'],
  ['evidence-bundle'],
  ['draft'],
  ['class-teaching-plans'],
  ['class-report'],
  ['readiness'],
] as const;

export async function invalidateAfterSourceVerification(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    sourceVerificationAffectedKeys.map(key => queryClient.invalidateQueries({ queryKey: key })),
  );
}

export function useRun() {
  return useQuery({ queryKey: queryKeys.run, queryFn: () => api<RunData>('/api/run') });
}

export function useReadiness() {
  return useQuery({ queryKey: queryKeys.readiness, queryFn: () => api<Readiness>('/api/readiness') });
}

export function useCases(runId: string, nodeId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cases(runId, nodeId),
    queryFn: () => api<CaseCandidate[]>(`/api/cases?node=${encodeURIComponent(nodeId)}`),
    enabled: Boolean(runId && nodeId) && enabled,
  });
}

export function useClassInsights(runId: string, nodeId: string) {
  return useQuery({
    queryKey: queryKeys.classInsights(runId, nodeId),
    queryFn: () => api<ClassInsights>(`/api/class-insights?node=${encodeURIComponent(nodeId)}`),
    enabled: Boolean(runId && nodeId),
  });
}

export function useMaterialCatalog(runId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.materialCatalog(runId),
    queryFn: () => api<Row>('/api/material-catalog'),
    enabled: Boolean(runId) && enabled,
  });
}

export function useSourceVerifications(runId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.sourceVerifications(runId),
    queryFn: () => api<Record<string, Row[]>>('/api/source-verifications'),
    enabled: Boolean(runId) && enabled,
  });
}

export function useKnowledgeCandidates(runId: string, indicatorId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.knowledgeCandidates(runId, indicatorId),
    queryFn: () => api<Row>(`/api/knowledge-link-candidates?indicator_id=${encodeURIComponent(indicatorId)}`),
    enabled: Boolean(runId && indicatorId) && enabled,
  });
}

function scopedStudentQuery<T>(options: {
  runId: string; nodeId: string; studentId: string; indicatorId: string; enabled?: boolean;
  key: (runId: string, nodeId: string, studentId: string, indicatorId: string) => readonly unknown[];
  path: string;
}) {
  return useQuery({
    queryKey: options.key(options.runId, options.nodeId, options.studentId, options.indicatorId),
    queryFn: () => api<T>(`${options.path}?student=${encodeURIComponent(options.studentId)}&indicator=${encodeURIComponent(options.indicatorId)}&node=${encodeURIComponent(options.nodeId)}`),
    enabled: Boolean(options.runId && options.studentId && options.indicatorId && options.nodeId) && (options.enabled ?? true),
  });
}

export function useStudentInsights(runId: string, nodeId: string, studentId: string, indicatorId: string, enabled = true) {
  return scopedStudentQuery<{ scope: Record<string, string>; claims: Array<Record<string, unknown>> }>({
    runId, nodeId, studentId, indicatorId, enabled, key: queryKeys.studentInsights, path: '/api/student-insights',
  });
}

export function useEvidenceBundle(runId: string, nodeId: string, studentId: string, indicatorId: string, enabled = true) {
  return scopedStudentQuery<Record<string, unknown>>({
    runId, nodeId, studentId, indicatorId, enabled, key: queryKeys.evidenceBundle, path: '/api/evidence-bundle',
  });
}

export function useDraft(runId: string, nodeId: string, studentId: string, indicatorId: string, enabled = true) {
  return scopedStudentQuery<Row>({
    runId, nodeId, studentId, indicatorId, enabled, key: queryKeys.draft, path: '/api/draft',
  });
}

export function useReviews(runId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reviews(runId),
    queryFn: () => api<Record<string, Row[]>>('/api/reviews'),
    enabled: Boolean(runId) && enabled,
  });
}

export function useTeacherCases(runId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.teacherCases(runId),
    queryFn: () => api<Record<string, Row[]>>('/api/teacher-cases'),
    enabled: Boolean(runId) && enabled,
  });
}

export function useTeachingAdjustments(runId: string, studentId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.teachingAdjustments(runId, studentId),
    queryFn: () => api<Row[]>('/api/teaching-adjustments'),
    enabled: Boolean(runId) && enabled,
  });
}

export function useClassReport(runId: string, nodeId: string, classId = '', enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.classReport(runId, nodeId), classId],
    queryFn: () => api<Row>(
      `/api/reports/class?node=${encodeURIComponent(nodeId)}${classId ? `&class=${encodeURIComponent(classId)}` : ''}`,
    ),
    enabled: Boolean(runId && nodeId) && enabled,
  });
}

export interface ClassPlanHistory {
  run_id: string;
  class_id: string;
  node_id: string;
  current_fingerprint: string;
  latest_status: string | null;
  plans: Row[];
}

export function useClassTeachingPlans(runId: string, classId: string, nodeId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.classTeachingPlans(runId, classId, nodeId),
    queryFn: () => api<ClassPlanHistory>(
      `/api/class-teaching-plans?class=${encodeURIComponent(classId)}&node=${encodeURIComponent(nodeId)}`,
    ),
    enabled: Boolean(runId && classId && nodeId) && enabled,
  });
}
