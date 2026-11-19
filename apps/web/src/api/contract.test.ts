import { describe, expect, it, vi, afterEach } from 'vitest';
import health from '../../../../contracts/api/health.json';
import errorFixture from '../../../../contracts/api/error.json';
import reviewRequest from '../../../../contracts/api/review-request.json';
import reviewSuccess from '../../../../contracts/api/review-success.json';
import draftFixture from '../../../../contracts/api/draft.json';
import analysisRunFixture from '../../../../contracts/api/analysis-run.json';
import sourceVerificationFixture from '../../../../contracts/api/source-verification.json';
import teacherCaseFixture from '../../../../contracts/api/teacher-case.json';
import { api, jsonRequest, learningApi } from './client';
import type { AnalysisRun, SourceVerificationPayload, TeacherCasePayload } from './types';

afterEach(() => vi.unstubAllGlobals());

describe('shared API fixtures', () => {
  it('accepts the shared health response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(health), {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    await expect(api<{ status: string }>('/api/health')).resolves.toEqual(health);
  });

  it('uses the error text in the shared error envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(errorFixture), {
      status: 422, headers: { 'content-type': 'application/json' },
    })));
    await expect(api('/api/health')).rejects.toThrow(errorFixture.error);
  });

  it('sends and receives the shared review contract unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(reviewSuccess), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/api/review', jsonRequest(reviewRequest))).resolves.toEqual(reviewSuccess);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(reviewRequest);
  });

  it('keeps the node-scoped draft contract aligned with the shared fixture', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(draftFixture), {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(learningApi.ruleDraft('D01', 'T01I1', 'N01')).resolves.toEqual(draftFixture);
    expect(fetchMock.mock.calls[0][0]).toContain('node=N01');
    await expect(learningApi.modelDraft('D01', 'T01I1', 'N01')).resolves.toEqual(draftFixture);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ student_id: 'D01', indicator_id: 'T01I1', node_id: 'N01' });
  });

  it('keeps analysis quality disposition fields aligned with the shared fixture', () => {
    const run = analysisRunFixture as unknown as AnalysisRun;
    expect(run.quality.disposition_counts?.scored).toBe(1);
    expect(run.quality.record_dispositions?.[1].disposition).toBe('superseded');
    expect(run.rubric_observations?.[0].points[0].point_id).toBe('Q001P1');
  });

  it('validates shared source verification and teacher case request fixtures', () => {
    const sourcePayload = sourceVerificationFixture as unknown as SourceVerificationPayload;
    const casePayload = teacherCaseFixture as unknown as TeacherCasePayload;
    expect(sourcePayload.status).toBe('verified');
    expect(sourcePayload.knowledge_links).toEqual([]);
    expect(casePayload.review_refs[0]).toEqual({ indicator_id: 'T01I1', node_id: 'N01', version: 1 });
  });
});
