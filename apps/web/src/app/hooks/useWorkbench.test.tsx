// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import draftFixture from '../../../../../contracts/api/draft.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reviewForNode, useWorkbench } from './useWorkbench';
import type { CaseSuggestion, Review, ReviewMap } from '../../api/types';

const apiMocks = vi.hoisted(() => ({
  run: vi.fn(),
  reviews: vi.fn(),
  cases: vi.fn(),
  ruleDraft: vi.fn(),
  modelDraft: vi.fn(),
  saveReview: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  learningApi: apiMocks,
}));

afterEach(() => vi.clearAllMocks());

describe('useWorkbench node scope', () => {
  it('treats a missing first run as a normal first-use state', async () => {
    apiMocks.run.mockRejectedValue(new Error('尚未导入赛事数据'));
    const { result } = renderHook(() => useWorkbench());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.run).toBeNull();
    expect(result.current.error).toBe(false);
    expect(result.current.message).toBe('');
  });

  it('selects review history for the active node and supports legacy draft scope', () => {
    const n01 = { node_id: 'N01', original_draft: { node_id: 'N01' }, version: 1 } as unknown as Review;
    const legacyN02 = { original_draft: { node_id: 'N02' }, version: 2 } as unknown as Review;
    const n02 = { node_id: 'N02', original_draft: { node_id: 'N02' }, version: 3 } as unknown as Review;
    expect(reviewForNode([n01, legacyN02, n02], 'N01')).toBe(n01);
    expect(reviewForNode([n01, legacyN02, n02], 'N02')).toBe(n02);
    expect(reviewForNode([n01, legacyN02, n02], null)).toBeUndefined();
  });

  it('forwards selected node and clears an old draft when node changes', async () => {
    apiMocks.run.mockResolvedValue({
      run_id: 'run-1', students: [], objectives: [], responses: [], items: [],
    });
    apiMocks.reviews.mockResolvedValue({});
    apiMocks.cases.mockResolvedValue([]);
    apiMocks.ruleDraft.mockResolvedValue(draftFixture);

    const { result } = renderHook(() => useWorkbench());
    await waitFor(() => expect(apiMocks.run).toHaveBeenCalled());
    await waitFor(() => expect(result.current.run?.run_id).toBe('run-1'));
    act(() => {
      result.current.setStudent('D01');
      result.current.setIndicator('T01I1');
    });
    act(() => result.current.setNode('N02'));
    await act(async () => result.current.makeDraft('rule', 'N02'));

    expect(apiMocks.ruleDraft).toHaveBeenCalledWith('D01', 'T01I1', 'N02');
    expect(result.current.draft).toEqual(draftFixture);
    act(() => result.current.setNode('N01'));
    expect(result.current.draft).toBeNull();
  });

  it('clears a draft and node selection when the active run changes', async () => {
    const baseRun = { run_id: 'run-1', students: [], objectives: [], responses: [], items: [] };
    apiMocks.run.mockResolvedValueOnce(baseRun).mockResolvedValueOnce({ ...baseRun, run_id: 'run-2' });
    apiMocks.reviews.mockResolvedValue({});
    apiMocks.cases.mockResolvedValue([]);
    apiMocks.ruleDraft.mockResolvedValue(draftFixture);

    const { result } = renderHook(() => useWorkbench());
    await waitFor(() => expect(apiMocks.run).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.run?.run_id).toBe('run-1'));
    act(() => result.current.setNode('N02'));
    await act(async () => result.current.makeDraft('rule', 'N02'));
    expect(result.current.draft).toEqual(draftFixture);

    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.run?.run_id).toBe('run-2'));
    await waitFor(() => expect(result.current.draft).toBeNull());
    expect(result.current.node).toBe('');
  });

  it('discards a late draft response after the user changes node scope', async () => {
    apiMocks.run.mockResolvedValue({ run_id: 'run-1', students: [], objectives: [], responses: [], items: [] });
    apiMocks.reviews.mockResolvedValue({});
    apiMocks.cases.mockResolvedValue([]);
    let resolveDraft!: (value: typeof draftFixture) => void;
    apiMocks.ruleDraft.mockReturnValue(new Promise(resolve => { resolveDraft = resolve; }));
    const { result } = renderHook(() => useWorkbench());
    await waitFor(() => expect(apiMocks.run).toHaveBeenCalled());
    await waitFor(() => expect(result.current.run?.run_id).toBe('run-1'));
    act(() => { result.current.setStudent('D01'); result.current.setIndicator('T01I1'); result.current.setNode('N02'); });
    let pending!: Promise<void>;
    act(() => { pending = result.current.makeDraft('rule', 'N02'); });
    act(() => result.current.setNode('N01'));
    await act(async () => { resolveDraft(draftFixture); await pending; });
    expect(result.current.draft).toBeNull();
  });

  it('does not let an older refresh overwrite a newer run', async () => {
    let resolveOldRun!: (value: { run_id: string; students: never[]; objectives: never[]; responses: never[]; items: never[] }) => void;
    apiMocks.run.mockReturnValueOnce(new Promise(resolve => { resolveOldRun = resolve; })).mockResolvedValueOnce({ run_id: 'run-new', students: [], objectives: [], responses: [], items: [] });
    apiMocks.reviews.mockResolvedValue({});
    apiMocks.cases.mockResolvedValue([]);
    const { result } = renderHook(() => useWorkbench());
    await act(async () => { await result.current.refresh(); });
    expect(result.current.run?.run_id).toBe('run-new');
    await act(async () => {
      resolveOldRun({ run_id: 'run-old', students: [], objectives: [], responses: [], items: [] });
      await Promise.resolve();
    });
    expect(result.current.run?.run_id).toBe('run-new');
  });

  it('keeps the active run visible when auxiliary requests fail', async () => {
    apiMocks.run.mockResolvedValue({ run_id: 'run-1', students: [], objectives: [], responses: [], items: [] });
    apiMocks.reviews.mockRejectedValue(new Error('reviews unavailable'));
    apiMocks.cases.mockResolvedValue([]);
    const { result } = renderHook(() => useWorkbench());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.run?.run_id).toBe('run-1');
    expect(result.current.error).toBe(true);
    expect(result.current.message).toContain('复核历史读取失败');
  });

  it('keeps last known auxiliary data when refresh of the same run fails', async () => {
    const currentRun = { run_id: 'run-1', students: [], objectives: [], responses: [], items: [] };
    const savedReviews = { 'D01:I1': [{ version: 1 }] } as unknown as ReviewMap;
    const savedCases = [{ student_id: 'D01', type: 'case' }] as unknown as CaseSuggestion[];
    apiMocks.run.mockResolvedValue(currentRun);
    apiMocks.reviews.mockResolvedValueOnce(savedReviews).mockRejectedValueOnce(new Error('reviews offline'));
    apiMocks.cases.mockResolvedValueOnce(savedCases).mockRejectedValueOnce(new Error('cases offline'));
    const { result } = renderHook(() => useWorkbench());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.refresh(); });

    expect(result.current.run?.run_id).toBe('run-1');
    expect(result.current.reviews).toEqual(savedReviews);
    expect(result.current.suggestions).toEqual(savedCases);
    expect(result.current.error).toBe(true);
  });

  it('shows a connection error and can recover after the run API returns', async () => {
    apiMocks.run.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce({
      run_id: 'run-recovered', students: [], objectives: [], responses: [], items: [],
    });
    apiMocks.reviews.mockResolvedValue({});
    apiMocks.cases.mockResolvedValue([]);
    const { result } = renderHook(() => useWorkbench());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.message).toContain('Failed to fetch');

    await act(async () => { await result.current.refresh(); });
    expect(result.current.run?.run_id).toBe('run-recovered');
    expect(result.current.error).toBe(false);
  });

  it('announces model provider failures without replacing the active draft', async () => {
    apiMocks.run.mockResolvedValue({ run_id: 'run-1', students: [], objectives: [], responses: [], items: [] });
    apiMocks.reviews.mockResolvedValue({});
    apiMocks.cases.mockResolvedValue([]);
    apiMocks.modelDraft.mockRejectedValue(new Error('模型服务暂不可用'));
    const { result } = renderHook(() => useWorkbench());
    await waitFor(() => expect(result.current.run?.run_id).toBe('run-1'));
    act(() => { result.current.setStudent('D01'); result.current.setIndicator('T01I1'); result.current.setNode('N01'); });

    await act(async () => { await result.current.makeDraft('deepseek', 'N01'); });

    expect(result.current.error).toBe(true);
    expect(result.current.message).toContain('模型服务暂不可用');
    expect(result.current.draft).toBeNull();
  });

  it('keeps the selected node while changing student and clears the old draft', async () => {
    apiMocks.run.mockResolvedValue({ run_id: 'run-1', students: [], objectives: [], responses: [], items: [] });
    apiMocks.reviews.mockResolvedValue({});
    apiMocks.cases.mockResolvedValue([]);
    apiMocks.ruleDraft.mockResolvedValue(draftFixture);
    const { result } = renderHook(() => useWorkbench());
    await waitFor(() => expect(result.current.run?.run_id).toBe('run-1'));
    act(() => { result.current.setStudent('D01'); result.current.setIndicator('I1'); result.current.setNode('N01'); });
    await act(async () => result.current.makeDraft('rule', 'N01'));
    expect(result.current.draft).not.toBeNull();
    act(() => result.current.setStudent('D02'));
    expect(result.current.node).toBe('N01');
    expect(result.current.draft).toBeNull();
  });
});
