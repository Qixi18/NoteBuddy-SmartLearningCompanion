// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { learningApi } from '../../../api/client';
import type { AnalysisRun } from '../../../api/types';
import { ObjectivesPanel } from './ObjectivesPanel';

describe('ObjectivesPanel source checks', () => {
  beforeEach(() => {
    vi.spyOn(learningApi, 'sourceVerifications').mockResolvedValue({});
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows topic-level checks separately from pending indicator verification', async () => {
    const run = {
      objectives: [{
        '指标编号': 'T01I1',
        '观察指标': '理解代数式',
        '主题编号': 'T01',
        '主题目标': '理解代数式',
      }],
      items: [],
      source_index: [{
        indicator_id: 'T01I1',
        topic_id: 'T01',
        source_check: {
          curriculum_check: '课标主题定位待人工核验',
          textbook_check: '主题教材切片已核查',
          textbook_slices: [],
        },
        verification: 'pending',
      }],
    } as unknown as AnalysisRun;

    render(<ObjectivesPanel run={run} />);

    expect(screen.getByText(/课标主题定位待人工核验/)).toBeTruthy();
    expect(screen.getByText(/主题教材切片已核查/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText(/指标关系状态：待核验/).length).toBeGreaterThan(0);
    });
  });

  it('changes indicator details without treating another indicator source as verified', async () => {
    const run = {
      objectives: [
        { '指标编号': 'I1', '主题编号': 'T1', '观察指标': '指标一' },
        { '指标编号': 'I2', '主题编号': 'T1', '观察指标': '指标二' },
      ],
      items: [{ '指标编号': 'I2', '材料编号': 'Q2', '题干或内容': '第二题' }],
      source_index: [{ indicator_id: 'I2', verification: 'pending' }],
    } as unknown as AnalysisRun;
    render(<ObjectivesPanel run={run} />);
    fireEvent.click(screen.getByRole('button', { name: /I2.*指标二/ }));
    expect(screen.getByRole('heading', { name: 'I2 · 指标二' })).toBeTruthy();
    expect(screen.getByText('第二题')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText(/指标关系状态：待核验/).length).toBeGreaterThan(0);
    });
  });

  it('shows the latest human signoff instead of the immutable run snapshot status', async () => {
    vi.spyOn(learningApi, 'sourceVerifications').mockResolvedValue({
      T01I1: [{
        run_id: 'run-1',
        indicator_id: 'T01I1',
        status: 'verified',
        curriculum_locator: '课标第 62 页',
        textbook_locator: '教材第 68 页',
        material_ids: ['Q001'],
        knowledge_links: [],
        reviewer: '数学教师甲',
        reason: '已核对原页',
        version: 1,
        reviewed_at: '2026-11-19T00:00:00+00:00',
      }],
    });
    const run = {
      run_id: 'run-1',
      objectives: [{ '指标编号': 'T01I1', '观察指标': '理解代数式', '主题编号': 'T01' }],
      items: [{ '指标编号': 'T01I1', '材料编号': 'Q001', '题干或内容': '一道已核验题目' }],
      source_index: [{ indicator_id: 'T01I1', verification: 'pending' }],
    } as unknown as AnalysisRun;

    render(<ObjectivesPanel run={run} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /T01I1.*已核验/ })).toBeTruthy();
      expect(screen.getByText('指标关系状态：已核验。主题说明仅供定位；以指标级核验记录判断材料关系。')).toBeTruthy();
    });
  });
});
