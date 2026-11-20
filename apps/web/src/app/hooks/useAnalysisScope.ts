import { useEffect, useMemo, useRef } from 'react';
import type { AnalysisRun } from '../../api/types';
import type { NavigationState } from '../navigation';

export type AnalysisScope = {
  runId: string;
  classId: string;
  studentId: string;
  indicatorId: string;
  nodeId: string;
  recordId: string;
  sourceLine?: number;
  stale: boolean;
  notice?: string;
};

export function resolveAnalysisScope(run: AnalysisRun | null, navigation: NavigationState): AnalysisScope {
  if (!run) return { runId: '', classId: '', studentId: '', indicatorId: '', nodeId: '', recordId: '', stale: false };

  const rangeIdsPresent = Boolean(navigation.nodeId || navigation.indicatorId || navigation.classId || navigation.studentId || navigation.recordId || navigation.sourceLine);
  const runMismatch = Boolean(navigation.runId && navigation.runId !== run.run_id);
  const unboundRange = rangeIdsPresent && navigation.runId !== run.run_id;
  if (runMismatch) {
    return {
      runId: run.run_id, classId: '', studentId: '', indicatorId: '', nodeId: '', recordId: '', stale: true,
      notice: '此链接属于另一数据批次；请重新选择分析范围。',
    };
  }

  const classes = new Set(run.students.map(student => student['模拟班级编号']));
  const student = navigation.studentId && !unboundRange
    ? run.students.find(item => item['学生编号'] === navigation.studentId)
    : undefined;
  const hasInvalidStudent = Boolean(navigation.studentId && !student);
  const hasInvalidClass = Boolean(navigation.classId && !student && !classes.has(navigation.classId));
  const objectiveIds = new Set(run.objectives.map(item => item['指标编号']));
  const indicatorId = navigation.indicatorId
    ? !unboundRange && objectiveIds.has(navigation.indicatorId) ? navigation.indicatorId : ''
    : run.objectives[0]?.['指标编号'] ?? '';
  const nodeIds = new Set(run.nodes.map(item => item['节点编号']));
  const nodeId = navigation.nodeId && !unboundRange && nodeIds.has(navigation.nodeId) ? navigation.nodeId : '';
  const records = [...run.responses, ...(run.raw_responses ?? [])];
  const evidence = navigation.recordId && !unboundRange
    ? records.find(item => item['记录编号'] === navigation.recordId && (navigation.sourceLine === undefined || item._source_line === navigation.sourceLine))
    : undefined;
  const hasInvalidEvidence = Boolean(navigation.recordId && !evidence);
  const stale = unboundRange || hasInvalidStudent || hasInvalidClass || Boolean(navigation.indicatorId && !indicatorId)
    || Boolean(navigation.nodeId && !nodeId) || hasInvalidEvidence;

  return {
    runId: run.run_id,
    classId: student?.['模拟班级编号'] ?? (navigation.classId && !hasInvalidClass && !unboundRange ? navigation.classId : ''),
    studentId: student?.['学生编号'] ?? '',
    indicatorId,
    nodeId,
    recordId: evidence?.['记录编号'] ?? '',
    sourceLine: evidence?._source_line,
    stale,
    notice: stale ? '链接中的部分范围已不在当前数据批次中，请重新选择对应范围。' : undefined,
  };
}

export function useAnalysisScope(
  run: AnalysisRun | null,
  navigation: NavigationState,
  onSelection: { student: (id: string) => void; indicator: (id: string) => void; node: (id: string) => void },
) {
  const scope = useMemo(() => resolveAnalysisScope(run, navigation), [run, navigation]);
  const appliedKey = useRef('');
  const key = [scope.runId, scope.studentId, scope.indicatorId, scope.nodeId].join(':');

  useEffect(() => {
    if (appliedKey.current === key) return;
    appliedKey.current = key;
    onSelection.student(scope.studentId);
    onSelection.indicator(scope.indicatorId);
    onSelection.node(scope.nodeId);
  }, [key, onSelection, scope]);

  return { scope };
}
