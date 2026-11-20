// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AnalysisRun } from '../api/types';
import { ScopeBar } from './ScopeBar';

const run = {
  objectives: [{ '指标编号': 'M01', '观察指标': '识别图形关系' }],
  students: [],
} as unknown as AnalysisRun;

describe('ScopeBar', () => {
  it('summarizes only the selected analysis scope and makes missing choices explicit', () => {
    render(<ScopeBar run={run} scope={{
      runId: 'run-1', classId: 'DC02', studentId: '', indicatorId: 'M01', nodeId: '', recordId: '', stale: false,
    }} />);

    expect(screen.getByRole('region', { name: '当前分析范围' })).not.toBeNull();
    expect(screen.getByText('M01 · 识别图形关系')).not.toBeNull();
    expect(screen.getByText('尚未选择测验节点')).not.toBeNull();
    expect(screen.getByText('DC02')).not.toBeNull();
    expect(screen.getByText('尚未选择学生')).not.toBeNull();
  });
});
