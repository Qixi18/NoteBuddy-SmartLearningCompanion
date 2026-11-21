export const routes = [
  { path: '/home', title: '开始', section: '开始', description: '查看当前批次、导入数据并继续当前分析。' },
  { path: '/requirements', title: '学习要求', section: '学习要求', description: '核对本次学习目标、对应题目和材料来源。' },
  { path: '/performance', title: '已有表现', section: '已有表现', description: '查看班级比较、学生记录和作答证据。' },
  { path: '/recommendations', title: '学习建议', section: '学习建议', description: '阅读、编辑并复核有证据支持的学习建议。' },
  { path: '/cases', title: '案例与交付', section: '案例与交付', description: '准备案例、阅读报告并检查交付成果。' },
] as const;

export type RoutePath = typeof routes[number]['path'];
export type NavigationView = 'class' | 'student' | 'quality' | 'evidence' | 'read' | 'edit' | 'observe' | 'prepare' | 'report' | 'check';
export type NavigationState = {
  path: RoutePath;
  view?: NavigationView;
  runId?: string;
  nodeId?: string;
  indicatorId?: string;
  classId?: string;
  studentId?: string;
  recordId?: string;
  sourceLine?: number;
  caseStudentIds?: string[];
  reportNodeId?: string;
  returnToCheck?: boolean;
  releaseCheckId?: string;
};

const legacyPaths: Record<string, { path: RoutePath; view?: NavigationView }> = {
  '/knowledge/indicators': { path: '/requirements' },
  '/knowledge/sources': { path: '/requirements' },
  '/insights/classes': { path: '/performance', view: 'class' },
  '/insights/students': { path: '/performance', view: 'student' },
  '/insights/evidence': { path: '/performance', view: 'evidence' },
  '/insights/quality': { path: '/performance', view: 'quality' },
  '/plan/reviews': { path: '/recommendations', view: 'read' },
  '/plan/adjustments': { path: '/recommendations', view: 'observe' },
  '/plan/cases': { path: '/cases', view: 'prepare' },
};

const pathSet = new Set<string>(routes.map(route => route.path));
const pageViews: Record<RoutePath, NavigationView | undefined> = {
  '/home': undefined,
  '/requirements': undefined,
  '/performance': 'class',
  '/recommendations': 'read',
  '/cases': 'prepare',
};

function validView(path: RoutePath, value: string | null): NavigationView | undefined {
  const allowed: Partial<Record<RoutePath, NavigationView[]>> = {
    '/performance': ['class', 'student', 'quality', 'evidence'],
    '/recommendations': ['read', 'edit', 'observe'],
    '/cases': ['prepare', 'report', 'check'],
  };
  return value && allowed[path]?.includes(value as NavigationView) ? value as NavigationView : undefined;
}

function safeId(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= 200 ? normalized : undefined;
}

export function parseNavigationHash(hash: string): NavigationState {
  const raw = hash.replace(/^#/, '');
  const queryIndex = raw.indexOf('?');
  const rawPath = (queryIndex < 0 ? raw : raw.slice(0, queryIndex)) || '/home';
  const params = new URLSearchParams(queryIndex < 0 ? '' : raw.slice(queryIndex + 1));
  const legacy = legacyPaths[rawPath];
  const path = legacy?.path ?? (pathSet.has(rawPath) ? rawPath as RoutePath : '/home');
  const requestedView = params.get('view');
  const inferredView = path === '/performance'
    ? safeId(params.get('recordId')) ? 'evidence' : safeId(params.get('studentId')) ? 'student' : undefined
    : undefined;
  const view = validView(path, requestedView) ?? legacy?.view ?? inferredView ?? pageViews[path];
  const state: NavigationState = { path };
  if (view) state.view = view;
  for (const key of ['runId', 'nodeId', 'indicatorId', 'classId', 'studentId', 'recordId'] as const) {
    const value = safeId(params.get(key));
    if (value) state[key] = value;
  }
  const reportNodeId = safeId(params.get('reportNodeId'));
  if (reportNodeId) state.reportNodeId = reportNodeId;
  const releaseCheckId = safeId(params.get('checkId'));
  if (params.get('returnToCheck') === '1' && releaseCheckId) {
    state.returnToCheck = true;
    state.releaseCheckId = releaseCheckId;
  }
  const line = Number(params.get('sourceLine'));
  if (Number.isSafeInteger(line) && line > 0) state.sourceLine = line;
  const rawCaseIds = params.getAll('caseId').slice(0, 3);
  const caseStudentIds = rawCaseIds.map(value => safeId(value) ?? '');
  if (caseStudentIds.some(Boolean)) state.caseStudentIds = caseStudentIds;
  return state;
}

export function normalizeHash(hash: string): RoutePath {
  return parseNavigationHash(hash).path;
}

export function serializeNavigation(state: NavigationState): string {
  const params = new URLSearchParams();
  const view = validView(state.path, state.view ?? null);
  // 当 URL 携带 studentId/recordId 时，解析端的视图推断会把无 view 的默认视图
  // 覆盖成 student/evidence；此时显式写出 view（含默认视图），保证
  // "班级比较"这类显式切换往返后不被推断顶掉。
  const needsExplicitView = Boolean(state.studentId || state.recordId);
  if (view && (view !== pageViews[state.path] || needsExplicitView)) params.set('view', view);
  for (const key of ['runId', 'nodeId', 'indicatorId', 'classId', 'studentId', 'recordId'] as const) {
    const value = safeId(state[key] ?? null);
    if (value) params.set(key, value);
  }
  const reportNodeId = safeId(state.reportNodeId ?? null);
  if (reportNodeId) params.set('reportNodeId', reportNodeId);
  if (state.returnToCheck && safeId(state.releaseCheckId ?? null)) {
    params.set('returnToCheck', '1');
    params.set('checkId', safeId(state.releaseCheckId ?? null)!);
  }
  if (Number.isSafeInteger(state.sourceLine) && (state.sourceLine ?? 0) > 0) params.set('sourceLine', String(state.sourceLine));
  for (const id of (state.caseStudentIds ?? []).slice(0, 3)) params.append('caseId', safeId(id) ?? '');
  const query = params.toString();
  return `#${state.path}${query ? `?${query}` : ''}`;
}

export function resolveCaseStudentIds(state: NavigationState, currentRunId: string | null, validStudentIds: readonly string[]): string[] {
  if (!currentRunId || state.runId !== currentRunId) return ['', '', ''];
  const selected = (state.caseStudentIds ?? []).slice(0, 3);
  const allowed = new Set(validStudentIds);
  return [0, 1, 2].map(index => {
    const id = selected[index] ?? '';
    return id && allowed.has(id) && selected.indexOf(id) === index ? id : '';
  });
}

export function routeFor(path: RoutePath) {
  return routes.find(route => route.path === path) ?? routes[0];
}

// 同范围切页：保留当前 URL 里的批次/节点/指标/学生等选择，仅切换页面与视图。
// 依据：重构规划 §5 切换规则 1——同一范围切页保留当前选择。
// 注意：serializeNavigation 会省略与页面默认视图相同的 view 参数；但 URL 保留
// studentId/recordId 时，解析端的视图推断会把默认视图覆盖成 student/evidence。
// 因此这里做一次往返校验，推断覆盖了显式目标视图时显式补回 view 参数。
export function switchViewHref(currentHash: string, path: RoutePath, view?: NavigationView): string {
  const state = parseNavigationHash(currentHash);
  const next: NavigationState = { ...state, path, view };
  const href = serializeNavigation(next).slice(1);
  if (view) {
    const parsed = parseNavigationHash(`#${href}`);
    if (parsed.view !== view) {
      const separator = href.includes('?') ? '&' : '?';
      return `${href}${separator}view=${view}`;
    }
  }
  return href;
}
