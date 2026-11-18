// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AnalysisRun } from '../../../api/types';
import { ObjectivesPanel } from './ObjectivesPanel';

describe('ObjectivesPanel source checks', () => {
  it('shows topic-level checks separately from pending indicator verification', () => {
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
    expect(screen.getAllByText(/指标关系状态：待核验/).length).toBeGreaterThan(0);
  });

  it('changes indicator details without treating another indicator source as verified', () => {
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
    expect(screen.getAllByText(/指标关系状态：待核验/).length).toBeGreaterThan(0);
  });
});
