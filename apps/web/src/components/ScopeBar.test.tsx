// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisRun } from '../api/types';
import { ScopeBar } from './ScopeBar';

const run = {
  objectives: [{ '指标编号': 'M01', '观察指标': '识别图形关系' }],
  students: [],
} as unknown as AnalysisRun;

describe('ScopeBar', () => {
  it('summarizes only the selected analysis scope and makes missing choices explicit', () => {
    const onNavigate = vi.fn();
    render(<ScopeBar run={run} path="/performance" onNavigate={onNavigate} scope={{
      runId: 'run-1', classId: 'DC02', studentId: '', indicatorId: 'M01', nodeId: '', recordId: '', stale: false,
    }} />);

    expect(screen.getByRole('region', { name: '当前分析范围' })).not.toBeNull();
    expect(screen.getByText('M01 · 识别图形关系')).not.toBeNull();
    expect(screen.getByText('尚未选择测验节点')).not.toBeNull();
    expect(screen.getByText('DC02')).not.toBeNull();
    expect(screen.getByText('尚未选择学生')).not.toBeNull();
    const chain = screen.getByRole('navigation', { name: '要求、表现与建议证据链' });
    expect(within(chain).getByRole('link', { name: '已有表现' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(chain).getByRole('link', { name: '学习建议' }));
    expect(onNavigate).toHaveBeenCalledWith('/recommendations');
  });
});
