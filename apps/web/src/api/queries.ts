import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { CaseCandidate, ClassInsights, Readiness, RunData } from '../types/api';

export const queryKeys = {
  run: ['run'] as const,
  readiness: ['readiness'] as const,
  cases: ['cases'] as const,
  classInsights: (runId: string, nodeId: string) => ['class-insights', runId, nodeId] as const,
};

export function useRun() {
  return useQuery({ queryKey: queryKeys.run, queryFn: () => api<RunData>('/api/run') });
}

export function useReadiness() {
  return useQuery({ queryKey: queryKeys.readiness, queryFn: () => api<Readiness>('/api/readiness') });
}

export function useCases(enabled = true) {
  return useQuery({ queryKey: queryKeys.cases, queryFn: () => api<CaseCandidate[]>('/api/cases'), enabled });
}

export function useClassInsights(runId: string, nodeId: string) {
  return useQuery({
    queryKey: queryKeys.classInsights(runId, nodeId),
    queryFn: () => api<ClassInsights>(`/api/class-insights?node=${encodeURIComponent(nodeId)}`),
    enabled: Boolean(runId && nodeId),
  });
}
