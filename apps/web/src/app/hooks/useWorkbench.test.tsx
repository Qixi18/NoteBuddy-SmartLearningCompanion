// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import draftFixture from '../../../../../contracts/api/draft.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reviewForNode, useWorkbench } from './useWorkbench';
import type { Review } from '../../api/types';

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
    let resolveOldReviews!: (value: Record<string, never[]>) => void;
    let resolveOldCases!: (value: never[]) => void;
    apiMocks.run.mockReturnValueOnce(new Promise(resolve => { resolveOldRun = resolve; })).mockResolvedValueOnce({ run_id: 'run-new', students: [], objectives: [], responses: [], items: [] });
    apiMocks.reviews.mockReturnValueOnce(new Promise(resolve => { resolveOldReviews = resolve; })).mockResolvedValueOnce({});
    apiMocks.cases.mockReturnValueOnce(new Promise(resolve => { resolveOldCases = resolve; })).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useWorkbench());
    await act(async () => { await result.current.refresh(); });
    expect(result.current.run?.run_id).toBe('run-new');
    await act(async () => {
      resolveOldRun({ run_id: 'run-old', students: [], objectives: [], responses: [], items: [] });
      resolveOldReviews({});
      resolveOldCases([]);
      await Promise.resolve();
    });
    expect(result.current.run?.run_id).toBe('run-new');
  });
});
