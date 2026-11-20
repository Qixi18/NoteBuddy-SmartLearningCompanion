// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisRun, CaseSuggestion, Draft, Review } from '../api/types';
import draftFixtureJson from '../../../../contracts/api/draft.json';
import { WorkbenchPage } from './WorkbenchPages';
import { learningApi } from '../api/client';
import { parseNavigationHash } from '../app/navigation';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const draftFixture = draftFixtureJson as Draft;

function makeRun(): AnalysisRun {
  const record = { '记录编号': 'R1', '学生编号': 'D01', '材料编号': 'Q1', '节点编号': 'N1', '作答事件编号': 'E1', '修订版本': '1', '评分状态': '已评分', '得分': '1', '满分': '2', '学生最终作答': '作答文本', '解答过程': '过程', '评分点得分': 'P1=1', _source_line: 8 };
  return {
    run_id: 'run-1', created_at: '2026-11-17', rule_version: '1',
    quality: { raw_rows: 1, events: 1, selected_revisions: 1, eligible_scored: 1, excluded_record_ids: [], finding_counts: {}, findings: [] },
    objectives: [{ '主题编号': 'T1', '指标编号': 'I1', '观察指标': '指标一' }],
    items: [{ '材料编号': 'Q1', '指标编号': 'I1', '题干或内容': '题目一', '评分点': 'P1' }],
    students: [{ '学生编号': 'D01', '模拟班级编号': 'C1' }], nodes: [{ '节点编号': 'N1', '可用题目编号': 'Q1' }],
    metrics: [
      { kind: 'class', key: 'C1', score: 1, maximum: 2, ratio: 0.5, count: 1, record_ids: ['R1'], event_ids: ['E1'] },
      { kind: 'class_indicator', key: 'C1:I1', score: 1, maximum: 2, ratio: null, count: 1, record_ids: ['R1'], event_ids: ['E1'] },
    ],
    responses: [record], raw_responses: [record], observations: [
      { student_id: 'D01', class_id: 'C1', indicator_id: 'I1', node_id: 'N1', selected_count: 1, scored_count: 2, pending_count: 0, unanswered_count: 0, excluded_count: 0, record_ids: ['R1'] },
      { student_id: 'D01', class_id: 'C1', indicator_id: 'I2', node_id: 'N1', selected_count: 1, scored_count: 99, pending_count: 0, unanswered_count: 0, excluded_count: 0, record_ids: ['R2'] },
    ], source_index: [], rubric_observations: [{ record_id: 'R1', event_id: 'E1', student_id: 'D01', item_id: 'Q1', node_id: 'N1', state: 'valid', reason: '校验一致', conflicts: [], points: [], total_score: 1, total_maximum: 2 }],
  };
}

const defaults = {
  path: '/home' as const, run: makeRun(), reviews: {}, suggestions: [], student: 'D01', indicator: 'I1', node: 'N1', draft: null,
  onStudent: vi.fn(), onIndicator: vi.fn(), onNode: vi.fn(), onDraft: vi.fn(async () => undefined), onSave: vi.fn(async () => undefined), onExport: vi.fn(), onNavigate: vi.fn(),
};

describe('WorkbenchPage empty state', () => {
  it('does not show analysis figures when no run is available', () => {
    render(<WorkbenchPage path="/home" run={null} reviews={{}} suggestions={[]} student="" indicator="" node="" draft={null} onStudent={() => undefined} onIndicator={() => undefined} onNode={() => undefined} onDraft={async () => undefined} onSave={async () => undefined} onExport={() => undefined} onNavigate={() => undefined} />);
    expect(screen.getByRole('heading', { name: '先导入一份学情数据' })).not.toBeNull();
    expect(screen.getByRole('button', { name: '选择数据文件夹' })).not.toBeNull();
    expect(screen.queryByText('学生')).toBeNull();
  });

  it('keeps the home focused on current run and task entry points', () => {
    render(<WorkbenchPage {...defaults} />);
    expect(screen.getByLabelText('当前运行摘要').children).toHaveLength(4);
    expect(screen.getByRole('button', { name: '查看详情' })).not.toBeNull();
    expect(screen.queryByText(/方案 PDF/)).toBeNull();
  });

  it('does not invent a student target on the recommendation page', () => {
    render(<WorkbenchPage {...defaults} path="/recommendations" student="" />);
    expect(screen.getByText('请选择一名学生，再查看或生成对应范围的学习建议。')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '生成规则草稿' })).toBeNull();
  });

  it('shows source availability and explains when model drafting is unavailable', async () => {
    vi.spyOn(learningApi, 'readiness').mockResolvedValue({
      sources: { status: 'available_unverified', pdf_count: 9 },
      model: { configured: false },
    });
    const { rerender } = render(<WorkbenchPage {...defaults} />);
    expect(await screen.findByText('找到 9 份，按指标核验')).not.toBeNull();
    rerender(<WorkbenchPage {...defaults} path="/plan/reviews" />);
    expect(await screen.findByText('本机未配置模型，可使用规则草稿。')).not.toBeNull();
    expect((screen.getByRole('button', { name: '使用模型生成草稿' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '生成规则草稿' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not turn an old snapshot without node metrics into a zero percent score', () => {
    render(<WorkbenchPage {...defaults} path="/insights/classes" />);
    expect(screen.getByText(/旧统计快照/)).not.toBeNull();
    expect(screen.queryByText(/得分率 0.0%/)).toBeNull();
  });

  it('drills from a class member into student analysis', () => {
    const run = makeRun();
    run.metrics.push({ kind: 'class_indicator', key: 'C1:I1@N1', class_id: 'C1', indicator_id: 'I1', node_id: 'N1', score: 1, maximum: 2, ratio: 0.5, count: 1, record_ids: ['R1'], event_ids: ['E1'] });
    render(<WorkbenchPage {...defaults} run={run} path="/insights/classes" />);
    fireEvent.click(screen.getByText('查看本班学生（1）'));
    fireEvent.click(screen.getByRole('button', { name: 'D01' }));
    expect(parseNavigationHash(`#${defaults.onNavigate.mock.calls.at(-1)?.[0]}`)).toMatchObject({ path: '/performance', view: 'student', studentId: 'D01' });
  });

  it('drills from a student and node scope into matching evidence', () => {
    render(<WorkbenchPage {...defaults} path="/insights/students" />);
    fireEvent.click(screen.getByRole('button', { name: '查看此范围作答证据' }));
    expect(parseNavigationHash(`#${defaults.onNavigate.mock.calls.at(-1)?.[0]}`)).toMatchObject({ path: '/performance', view: 'evidence', studentId: 'D01', indicatorId: 'I1', nodeId: 'N1' });
  });

  it('preserves unsaved review edits when navigating away and back', () => {
    const draft = { ...draftFixture, student_id: 'D01', indicator_id: 'I1', node_id: 'N1' };
    const { rerender } = render(<WorkbenchPage {...defaults} path="/plan/reviews" draft={draft} />);
    const diagnosis = screen.getByLabelText('诊断') as HTMLTextAreaElement;
    fireEvent.change(diagnosis, { target: { value: '教师补充的诊断' } });
    rerender(<WorkbenchPage {...defaults} path="/home" draft={draft} />);
    rerender(<WorkbenchPage {...defaults} path="/plan/reviews" draft={draft} />);
    expect((screen.getByLabelText('诊断') as HTMLTextAreaElement).value).toBe('教师补充的诊断');
  });

  it('shows evidence and only the review version linked to that candidate evidence', async () => {
    const candidate: CaseSuggestion = { student_id: 'D01', class_id: 'DC01', type: '部分得分', reason: '节点 N1 的候选', evidence_record_ids: ['R1'] };
    const review: Review = { status: 'accepted', diagnosis: '有证据的诊断', recommendation: '有证据的建议', adjustment_condition: '', reason: '核验通过', source: 'rule', model: null, prompt_version: null, evidence_record_ids: ['R1'], node_id: 'N1', version: 1, original_draft: null, reviewer: '教师', updated_at: '2026-11-17' };
    const unrelated: Review = { ...review, diagnosis: '无关指标的复核', evidence_record_ids: ['R2'], version: 2 };
    render(<WorkbenchPage {...defaults} path="/plan/cases" suggestions={[candidate]} reviews={{ 'D01:I1': [review, unrelated] }} />);
    fireEvent.click(screen.getByText('部分得分 · D01 · DC01'));
    expect(await screen.findByText('D01 的可追溯记录')).not.toBeNull();
    expect(screen.getByText(/当前节点该学生有效评分数：2/)).not.toBeNull();
    expect(screen.getByText('诊断：有证据的诊断')).not.toBeNull();
    expect(screen.queryByText('无关指标的复核')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '在建议复核中查看此证据' }));
    expect(parseNavigationHash(`#${defaults.onNavigate.mock.calls.at(-1)?.[0]}`)).toMatchObject({ path: '/recommendations', view: 'read', studentId: 'D01', indicatorId: 'I1', nodeId: 'N1' });
  });
});
