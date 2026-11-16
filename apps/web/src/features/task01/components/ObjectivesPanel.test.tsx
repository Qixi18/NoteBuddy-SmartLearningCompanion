// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText(/指标核验状态：pending/)).toBeTruthy();
  });
});
