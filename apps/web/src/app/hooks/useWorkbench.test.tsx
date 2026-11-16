// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import draftFixture from '../../../../../contracts/api/draft.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkbench } from './useWorkbench';

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
  it('forwards selected node and clears an old draft when node changes', async () => {
    apiMocks.run.mockResolvedValue({
      run_id: 'run-1', students: [], objectives: [], responses: [], items: [],
    });
    apiMocks.reviews.mockResolvedValue({});
    apiMocks.cases.mockResolvedValue([]);
    apiMocks.ruleDraft.mockResolvedValue(draftFixture);

    const { result } = renderHook(() => useWorkbench());
    await waitFor(() => expect(apiMocks.run).toHaveBeenCalled());
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
    act(() => result.current.setNode('N02'));
    await act(async () => result.current.makeDraft('rule', 'N02'));
    expect(result.current.draft).toEqual(draftFixture);

    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.run?.run_id).toBe('run-2'));
    await waitFor(() => expect(result.current.draft).toBeNull());
    expect(result.current.node).toBe('');
  });
});
