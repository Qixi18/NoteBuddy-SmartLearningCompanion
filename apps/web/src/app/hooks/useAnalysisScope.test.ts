// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisRun } from '../../api/types';
import { parseNavigationHash } from '../navigation';
import { resolveAnalysisScope, useAnalysisScope } from './useAnalysisScope';

const run = {
  run_id: 'run-2',
  students: [
    { '学生编号': 'D01', '模拟班级编号': 'DC01' },
    { '学生编号': 'D02', '模拟班级编号': 'DC02' },
  ],
  objectives: [{ '指标编号': 'I1' }, { '指标编号': 'I2' }],
  nodes: [{ '节点编号': 'N1' }, { '节点编号': 'N2' }],
  responses: [{ '记录编号': 'R1', _source_line: 10 }],
  raw_responses: [],
} as unknown as AnalysisRun;

describe('analysis scope from navigation', () => {
  it('keeps the student unselected while using the first indicator as the directory default', () => {
    expect(resolveAnalysisScope(run, parseNavigationHash('#/performance'))).toMatchObject({
      studentId: '', indicatorId: 'I1', nodeId: '', classId: '', stale: false,
    });
  });

  it('accepts valid IDs for the current run and derives a selected student class', () => {
    expect(resolveAnalysisScope(run, parseNavigationHash('#/performance?runId=run-2&studentId=D02&classId=DC01&indicatorId=I2&nodeId=N2'))).toMatchObject({
      studentId: 'D02', classId: 'DC02', indicatorId: 'I2', nodeId: 'N2', stale: false,
    });
  });

  it('does not restore selections from a different run', () => {
    expect(resolveAnalysisScope(run, parseNavigationHash('#/performance?runId=run-1&studentId=D01&indicatorId=I2&nodeId=N2'))).toMatchObject({
      studentId: '', indicatorId: '', nodeId: '', stale: true,
    });
  });

  it('does not replace invalid IDs with another student or node', () => {
    expect(resolveAnalysisScope(run, parseNavigationHash('#/performance?runId=run-2&studentId=missing&indicatorId=I2&nodeId=missing'))).toMatchObject({
      studentId: '', indicatorId: 'I2', nodeId: '', stale: true,
    });
  });

  it('applies the validated URL scope to the workbench selection', () => {
    const onSelection = { student: vi.fn(), indicator: vi.fn(), node: vi.fn() };
    const navigation = parseNavigationHash('#/performance?runId=run-2&studentId=D02&indicatorId=I2&nodeId=N2');
    const { result } = renderHook(() => useAnalysisScope(run, navigation, onSelection));

    expect(result.current.scope.classId).toBe('DC02');
    expect(onSelection.student).toHaveBeenCalledWith('D02');
    expect(onSelection.indicator).toHaveBeenCalledWith('I2');
    expect(onSelection.node).toHaveBeenCalledWith('N2');
  });
});
