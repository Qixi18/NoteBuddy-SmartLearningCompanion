import type { RunData } from '../../types/api';

export type Row = Record<string, unknown>;

/** 统一的教学分析范围。所有页面都应以这五个维度表达"当前在看什么"。 */
export interface AnalysisScope {
  runId: string;
  classId: string;
  nodeId: string;
  studentId: string;
  indicatorId: string;
}

export const SCOPE_PARAMS = ['node', 'class', 'student', 'indicator'] as const;
export type ScopeParam = (typeof SCOPE_PARAMS)[number];

export const EMPTY_SCOPE: AnalysisScope = {
  runId: '',
  classId: '',
  nodeId: '',
  studentId: '',
  indicatorId: '',
};

export function text(value: unknown): string {
  return value == null ? '' : String(value);
}

export function studentRows(run: RunData | undefined): Row[] {
  return run?.students ?? [];
}

export function nodeRows(run: RunData | undefined): Row[] {
  return run?.nodes ?? [];
}

export function objectiveRows(run: RunData | undefined): Row[] {
  return run?.objectives ?? [];
}

export function classIds(run: RunData | undefined): string[] {
  return [...new Set(studentRows(run).map(row => text(row['模拟班级编号'])).filter(Boolean))];
}

export function nodeIds(run: RunData | undefined): string[] {
  return [...new Set(nodeRows(run).map(row => text(row['节点编号'])).filter(Boolean))];
}

export function indicatorIds(run: RunData | undefined): string[] {
  return [...new Set(objectiveRows(run).map(row => text(row['指标编号'])).filter(Boolean))];
}

export function studentsOfClass(run: RunData | undefined, classId: string): Row[] {
  return studentRows(run).filter(row => text(row['模拟班级编号']) === classId);
}

/** 从 URL 查询参数读取范围（不做有效性校验）。 */
export function readScope(params: URLSearchParams, runId = ''): AnalysisScope {
  return {
    runId,
    classId: params.get('class') ?? '',
    nodeId: params.get('node') ?? '',
    studentId: params.get('student') ?? '',
    indicatorId: params.get('indicator') ?? '',
  };
}

/**
 * 把范围落到当前运行上：无效值丢弃并回退到默认值。
 * 显式选择的学生优先于班级：若学生不属于当前班级，班级跟随学生。
 */
export function resolveScope(run: RunData | undefined, raw: AnalysisScope): AnalysisScope {
  if (!run) return { ...raw };
  const classes = classIds(run);
  const nodes = nodeIds(run);
  const indicators = indicatorIds(run);

  let classId = classes.includes(raw.classId) ? raw.classId : classes[0] ?? '';
  let studentId = '';
  if (raw.studentId) {
    const student = studentRows(run).find(row => text(row['学生编号']) === raw.studentId);
    if (student) {
      studentId = raw.studentId;
      const studentClass = text(student['模拟班级编号']);
      if (studentClass) classId = studentClass;
    }
  }
  const nodeId = nodes.includes(raw.nodeId) ? raw.nodeId : nodes[0] ?? '';
  const indicatorId = indicators.includes(raw.indicatorId) ? raw.indicatorId : '';

  return { runId: run.run_id, classId, nodeId, studentId, indicatorId };
}

/** 范围是否已经和当前运行一致（用于判断是否需要清理失效参数）。 */
export function isScopeSettled(run: RunData | undefined, scope: AnalysisScope): boolean {
  if (!run) return true;
  return scope.runId === run.run_id
    && classIds(run).includes(scope.classId)
    && nodeIds(run).includes(scope.nodeId)
    && (!scope.studentId || studentRows(run).some(row => text(row['学生编号']) === scope.studentId))
    && (!scope.indicatorId || indicatorIds(run).includes(scope.indicatorId));
}

/** 更新查询参数：空字符串表示删除该参数。 */
export function applyScope(params: URLSearchParams, patch: Partial<Record<ScopeParam, string>>): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of SCOPE_PARAMS) {
    if (!(key in patch)) continue;
    const value = patch[key] ?? '';
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}

/** 把已解析的范围写回查询参数，生成可直接给 Link 的 search 字符串。 */
export function scopeSearch(params: URLSearchParams, scope: AnalysisScope): string {
  return applyScope(params, {
    node: scope.nodeId,
    class: scope.classId,
    student: scope.studentId,
    indicator: scope.indicatorId,
  }).toString();
}

/** 缓存键使用的范围指纹：不同运行、不同班级/节点/学生/指标不能共用缓存。 */
export function scopeFingerprint(scope: AnalysisScope): string {
  return [scope.runId, scope.classId, scope.nodeId, scope.studentId, scope.indicatorId].join('|');
}

/** 链接到同一分析范围下的另一个页面。 */
export function scopeHref(path: string, search: string): { pathname: string; search: string } {
  return { pathname: path, search };
}
