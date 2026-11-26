import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRun } from '../../api/queries';
import {
  applyScope,
  classIds,
  nodeRows,
  readScope,
  resolveScope,
  scopeHref,
  scopeSearch,
  studentRows,
  text,
  type AnalysisScope,
  type ScopeParam,
} from './scopeUtils';

export interface WorkbenchScope {
  /** 当前运行（未导入时为 undefined）。 */
  run: ReturnType<typeof useRun>['data'];
  runQuery: ReturnType<typeof useRun>;
  /** 已按当前运行校正过的范围。 */
  scope: AnalysisScope;
  /** 包含当前范围的 search 字符串，可直接用于 Link。 */
  search: string;
  params: URLSearchParams;
  classes: string[];
  nodes: ReturnType<typeof nodeRows>;
  students: ReturnType<typeof studentRows>;
  /** 修改任意范围参数；空字符串表示清除。 */
  update: (patch: Partial<Record<ScopeParam, string>>) => void;
  setClass: (classId: string) => void;
  setNode: (nodeId: string) => void;
  setStudent: (studentId: string) => void;
  setIndicator: (indicatorId: string) => void;
  /** 指向同一范围的页面链接对象。 */
  href: (path: string) => { pathname: string; search: string };
}

/**
 * 九个页面共用的分析范围管理。
 * - 从 URL 读取 `node` / `class` / `student` / `indicator`；
 * - 用当前运行的数据校验并回退；
 * - 把校正后的范围写回 URL（replace，不产生历史记录）；
 * - 所有页面链接统一附带当前范围，避免跨页丢参数。
 */
export function useWorkbenchScope(): WorkbenchScope {
  const runQuery = useRun();
  const run = runQuery.data;
  const [params, setParams] = useSearchParams();

  const raw = useMemo(() => readScope(params, run?.run_id ?? ''), [params, run?.run_id]);
  const scope = useMemo(() => resolveScope(run, raw), [run, raw]);

  useEffect(() => {
    if (!run) return;
    const next = applyScope(params, {
      node: scope.nodeId,
      class: scope.classId,
      student: scope.studentId,
      indicator: scope.indicatorId,
    });
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [run, scope.nodeId, scope.classId, scope.studentId, scope.indicatorId, params, setParams]);

  const update = (patch: Partial<Record<ScopeParam, string>>) => {
    setParams(current => {
      const next = applyScope(current, patch);
      return next.toString() === current.toString() ? current : next;
    });
  };

  const setClass = (classId: string) => update({ class: classId, student: '' });

  const setNode = (nodeId: string) => update({ node: nodeId });

  const setStudent = (studentId: string) => {
    const student = studentRows(run).find(row => text(row['学生编号']) === studentId);
    update({ student: studentId, ...(student ? { class: text(student['模拟班级编号']) } : {}) });
  };

  const setIndicator = (indicatorId: string) => update({ indicator: indicatorId });

  const search = useMemo(() => scopeSearch(params, scope), [params, scope]);

  return {
    run,
    runQuery,
    scope,
    search,
    params,
    classes: classIds(run),
    nodes: nodeRows(run),
    students: studentRows(run),
    update,
    setClass,
    setNode,
    setStudent,
    setIndicator,
    href: (path: string) => scopeHref(path, search),
  };
}
