// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisRun, CaseSuggestion, Review } from '../api/types';
import draftFixture from '../../../../contracts/api/draft.json';
import { WorkbenchPage } from './WorkbenchPages';

afterEach(cleanup);

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
    expect(screen.getByRole('heading', { name: '还没有可查看的分析运行' })).not.toBeNull();
    expect(screen.queryByText('学生')).toBeNull();
  });

  it('lists external submissions as unverified rather than implying they are done', () => {
    render(<WorkbenchPage {...defaults} />);
    expect(screen.getByText(/方案 PDF/)).not.toBeNull();
    expect(screen.getByText(/MP4 不超过 5 分钟 · 待站外准备与核验/)).not.toBeNull();
    expect(screen.getByText(/不会显示虚构的完成状态/)).not.toBeNull();
  });

  it('does not turn a missing indicator denominator into a zero percent score', () => {
    render(<WorkbenchPage {...defaults} />);
    expect(screen.getByText('C1：1/2（无分母，1 条）')).not.toBeNull();
  });

  it('drills from a class member into student analysis', () => {
    render(<WorkbenchPage {...defaults} path="/insights/classes" />);
    fireEvent.click(screen.getByText('查看本班学生（1）'));
    fireEvent.click(screen.getByRole('button', { name: 'D01' }));
    expect(defaults.onStudent).toHaveBeenCalledWith('D01');
    expect(defaults.onNavigate).toHaveBeenCalledWith('/insights/students');
  });

  it('drills from a student and node scope into matching evidence', () => {
    render(<WorkbenchPage {...defaults} path="/insights/students" />);
    fireEvent.click(screen.getByRole('button', { name: '查看此范围作答证据' }));
    expect(defaults.onNavigate).toHaveBeenCalledWith('/insights/evidence');
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
    const candidate: CaseSuggestion = { student_id: 'D01', type: '部分得分', reason: '节点 N1 的候选', evidence_record_ids: ['R1'] };
    const review: Review = { status: 'accepted', diagnosis: '有证据的诊断', recommendation: '有证据的建议', adjustment_condition: '', reason: '核验通过', source: 'rule', model: null, prompt_version: null, evidence_record_ids: ['R1'], node_id: 'N1', version: 1, original_draft: null, reviewer: '教师', updated_at: '2026-11-17' };
    const unrelated: Review = { ...review, diagnosis: '无关指标的复核', evidence_record_ids: ['R2'], version: 2 };
    render(<WorkbenchPage {...defaults} path="/plan/cases" suggestions={[candidate]} reviews={{ 'D01:I1': [review, unrelated] }} />);
    fireEvent.click(screen.getByText('部分得分 · D01'));
    expect(await screen.findByText('D01 的可追溯记录')).not.toBeNull();
    expect(screen.getByText(/当前节点该学生有效评分数：2/)).not.toBeNull();
    expect(screen.getByText('诊断：有证据的诊断')).not.toBeNull();
    expect(screen.queryByText('无关指标的复核')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '在建议复核中查看此证据' }));
    expect(defaults.onStudent).toHaveBeenCalledWith('D01');
    expect(defaults.onIndicator).toHaveBeenCalledWith('I1');
    expect(defaults.onNode).toHaveBeenCalledWith('N1');
    expect(defaults.onNavigate).toHaveBeenCalledWith('/plan/reviews');
  });
});
