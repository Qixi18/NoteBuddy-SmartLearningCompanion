import { describe, expect, it } from 'vitest';
import { normalizeHash, parseNavigationHash, resolveCaseStudentIds, routeFor, serializeNavigation, switchViewHref } from './navigation';

describe('navigation', () => {
  it('switching views preserves run, node, indicator and student ids', () => {
    const href = switchViewHref(
      '#/performance?runId=r1&nodeId=N01&indicatorId=I01&studentId=D01&view=quality',
      '/performance',
      'student',
    );
    expect(parseNavigationHash(`#${href}`)).toMatchObject({
      path: '/performance',
      view: 'student',
      runId: 'r1',
      nodeId: 'N01',
      indicatorId: 'I01',
      studentId: 'D01',
    });
  });

  it('explicit class view survives studentId view inference', () => {
    // 学生 ID 在 URL 中时，解析推断会把默认视图覆盖为学生分析；
    // 显式目标视图（如班级比较）必须经往返校验后补回 view 参数。
    const href = switchViewHref(
      '#/performance?runId=r1&nodeId=N01&indicatorId=I01&studentId=D01',
      '/performance',
      'class',
    );
    const parsed = parseNavigationHash(`#${href}`);
    expect(parsed.view).toBe('class');
    expect(parsed.studentId).toBe('D01');
  });

  it('switching pages keeps scope ids and drops only the source view', () => {
    const href = switchViewHref(
      '#/performance?runId=r1&nodeId=N01&view=quality',
      '/requirements',
    );
    expect(parseNavigationHash(`#${href}`)).toMatchObject({
      path: '/requirements',
      runId: 'r1',
      nodeId: 'N01',
    });
    expect(parseNavigationHash(`#${href}`).view).toBeUndefined();
  });

  it('keeps known Chinese workbench views addressable', () => {
    expect(normalizeHash('#/insights/evidence')).toBe('/performance');
    expect(routeFor('/recommendations').title).toBe('学习建议');
    expect(normalizeHash('#/knowledge/sources')).toBe('/requirements');
  });

  it('maps legacy views to the five workflow pages without losing their local view', () => {
    expect(parseNavigationHash('#/insights/classes')).toMatchObject({ path: '/performance', view: 'class' });
    expect(parseNavigationHash('#/insights/students')).toMatchObject({ path: '/performance', view: 'student' });
    expect(parseNavigationHash('#/insights/evidence')).toMatchObject({ path: '/performance', view: 'evidence' });
    expect(parseNavigationHash('#/insights/quality')).toMatchObject({ path: '/performance', view: 'quality' });
    expect(parseNavigationHash('#/plan/reviews')).toMatchObject({ path: '/recommendations', view: 'read' });
    expect(parseNavigationHash('#/plan/adjustments')).toMatchObject({ path: '/recommendations', view: 'observe' });
    expect(parseNavigationHash('#/plan/cases')).toMatchObject({ path: '/cases', view: 'prepare' });
    expect(normalizeHash('#/knowledge/sources')).toBe('/requirements');
  });

  it('restores and serializes only supported range IDs and evidence location', () => {
    const location = parseNavigationHash('#/performance?nodeId=N2&indicatorId=M4&studentId=S7&classId=DC02&recordId=R8&sourceLine=12&answer=private');
    expect(location).toEqual({
      path: '/performance', view: 'evidence', nodeId: 'N2', indicatorId: 'M4',
      studentId: 'S7', classId: 'DC02', recordId: 'R8', sourceLine: 12,
    });
    expect(serializeNavigation(location)).toBe('#/performance?view=evidence&nodeId=N2&indicatorId=M4&classId=DC02&studentId=S7&recordId=R8&sourceLine=12');
    expect(parseNavigationHash('#/performance?studentId=&sourceLine=-1')).toEqual({ path: '/performance', view: 'class' });
  });

  it('preserves three case slots in the run URL without storing report text', () => {
    const state = parseNavigationHash('#/cases?runId=run-1&caseId=&caseId=S2&caseId=S3&narrative=private');
    expect(state.caseStudentIds).toEqual(['', 'S2', 'S3']);
    expect(serializeNavigation(state)).toBe('#/cases?runId=run-1&caseId=&caseId=S2&caseId=S3');
  });

  it('keeps the delivery report node separate from the analysis node', () => {
    const state = parseNavigationHash('#/cases?runId=run-1&nodeId=N-analysis&reportNodeId=N-report');
    expect(state).toMatchObject({ nodeId: 'N-analysis', reportNodeId: 'N-report' });
    expect(serializeNavigation(state)).toBe('#/cases?runId=run-1&nodeId=N-analysis&reportNodeId=N-report');
  });

  it('preserves a release repair destination and the blocked check identity', () => {
    const state = parseNavigationHash('#/requirements?returnToCheck=1&checkId=source_signoffs&runId=run-4&caseId=S1&reportNodeId=N2');
    expect(state).toMatchObject({ path: '/requirements', returnToCheck: true, releaseCheckId: 'source_signoffs', runId: 'run-4' });
    expect(serializeNavigation(state)).toBe('#/requirements?runId=run-4&reportNodeId=N2&returnToCheck=1&checkId=source_signoffs&caseId=S1');
    expect(parseNavigationHash('#/requirements?returnToCheck=1')).toMatchObject({ path: '/requirements' });
  });

  it('restores only distinct case students belonging to the current run', () => {
    const selected = parseNavigationHash('#/cases?runId=run-1&caseId=S1&caseId=S1&caseId=unknown');
    expect(resolveCaseStudentIds(selected, 'run-1', ['S1', 'S2'])).toEqual(['S1', '', '']);
    expect(resolveCaseStudentIds(selected, 'run-2', ['S1', 'S2'])).toEqual(['', '', '']);
  });
});
