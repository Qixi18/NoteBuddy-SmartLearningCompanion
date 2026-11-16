import { afterAll, describe, expect, it } from 'vitest';
import { learningApi } from './client';
import type { AnalysisRun } from './types';

const liveEnv = (import.meta as ImportMeta & { env: { VITE_SMART_LEARNING_LIVE_CONTRACT?: string; VITE_SMART_LEARNING_API_BASE_URL?: string; VITE_SMART_LEARNING_IMPORT_DIR?: string } }).env;
const runtimeEnv = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const liveEnabled = liveEnv.VITE_SMART_LEARNING_LIVE_CONTRACT === '1' || runtimeEnv.VITE_SMART_LEARNING_LIVE_CONTRACT === '1';
const baseUrl = liveEnv.VITE_SMART_LEARNING_API_BASE_URL ?? runtimeEnv.VITE_SMART_LEARNING_API_BASE_URL;
const importDir = liveEnv.VITE_SMART_LEARNING_IMPORT_DIR ?? runtimeEnv.VITE_SMART_LEARNING_IMPORT_DIR;
const previousFetch = globalThis.fetch;

if (baseUrl) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(typeof input === 'string' ? input : input.toString(), baseUrl);
    return previousFetch(new Request(requestUrl, init));
  }) as typeof fetch;
}

afterAll(() => { globalThis.fetch = previousFetch; });

describe.skipIf(!liveEnabled || !baseUrl || !importDir)('live FastAPI contract', () => {
  it('imports, reads, drafts, and exports through the live FastAPI contract', async () => {
    const imported = await learningApi.importFolder(importDir!);
    expect(imported.run_id).toBeTruthy();
    const run = await learningApi.run() as AnalysisRun;
    expect(run.run_id).toBe(imported.run_id);
    expect(Array.isArray(run.quality.record_dispositions)).toBe(true);
    expect(Array.isArray(run.rubric_observations)).toBe(true);
    const cases = await learningApi.cases();
    expect(Array.isArray(cases)).toBe(true);
    const studentId = run.students[0]?.['学生编号'];
    const indicatorId = run.objectives[0]?.['指标编号'];
    expect(studentId).toBeTruthy();
    expect(indicatorId).toBeTruthy();
    if (studentId && indicatorId) {
      const nodeId = run.nodes[0]?.['节点编号'];
      const draft = await learningApi.ruleDraft(studentId, indicatorId, nodeId);
      expect(draft.student_id).toBe(studentId);
      expect(draft.indicator_id).toBe(indicatorId);
      expect(draft.node_id).toBe(nodeId);
      expect(draft).toHaveProperty('rule_id');
      expect(draft).toHaveProperty('evidence_record_ids');
      const review = await learningApi.saveReview({
        student_id: studentId,
        indicator_id: indicatorId,
        status: 'needs_observation',
        diagnosis: draft.diagnosis,
        recommendation: draft.recommendation,
        adjustment_condition: draft.adjustment_condition,
        reason: 'live API contract test',
        source: 'rule',
        evidence_record_ids: draft.evidence_record_ids,
        original_draft: draft,
      });
      expect(review.version).toBe(1);
      expect((await learningApi.reviews())[`${studentId}:${indicatorId}`]?.[0]?.version).toBe(1);
    }
    const caseIds = run.students.slice(0, 3).map(student => student['学生编号']);
    expect(caseIds).toHaveLength(3);
    const response = await fetch(learningApi.exportUrl(caseIds));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/zip');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
