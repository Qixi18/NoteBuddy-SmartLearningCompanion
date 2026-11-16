// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisRun } from '../../../api/types';
import { ClassPanel } from './ClassPanel';
import { EvidencePanel } from './EvidencePanel';
import { QualityPanel } from './QualityPanel';
import { StudentPanel } from './StudentPanel';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const run = {
  run_id: 'run1', created_at: '', rule_version: '2',
  quality: {
    raw_rows: 2, events: 1, selected_revisions: 1, eligible_scored: 1,
    excluded_record_ids: [], finding_counts: {}, findings: [],
    disposition_counts: { scored: 1, superseded: 1 },
    raw_status_counts: { '已评分': 2 }, event_disposition_counts: { scored: 1 },
    record_dispositions: [
      { record_id: 'R1', event_id: 'E1', source_file: '作答记录.csv', source_line: 2, disposition: 'superseded' },
      { record_id: 'R2', event_id: 'E1', source_file: '作答记录.csv', source_line: 3, disposition: 'scored' },
    ],
  },
  objectives: [{ '主题编号': 'T01', '指标编号': 'I1', '观察指标': '代数' }],
  items: [{ '材料编号': 'Q001', '指标编号': 'I1', '题干或内容': '题干', '评分点': 'P1', '满分': '2' }],
  students: [{ '学生编号': 'D01', '模拟班级编号': 'C1' }, { '学生编号': 'D02', '模拟班级编号': 'C1' }],
  nodes: [{ '节点编号': 'N01', '可用题目编号': 'Q001' }, { '节点编号': 'N02', '可用题目编号': 'Q002' }],
  source_index: [],
  responses: [{ '记录编号': 'R2', '学生编号': 'D01', '材料编号': 'Q001', '节点编号': 'N01', '作答事件编号': 'E1', '修订版本': '2', '评分状态': '已评分', '得分': '1', '满分': '2', '学生最终作答': 'x', '解答过程': '步骤', '评分点得分': 'P1=1', _source_line: 3 }],
  raw_responses: [
    { '记录编号': 'R1', '学生编号': 'D01', '材料编号': 'Q001', '节点编号': 'N01', '作答事件编号': 'E1', '修订版本': '1', '评分状态': '已评分', '得分': '0', '满分': '2', '学生最终作答': '旧答案', '解答过程': '', '评分点得分': '', _source_line: 2 },
    { '记录编号': 'R2', '学生编号': 'D01', '材料编号': 'Q001', '节点编号': 'N01', '作答事件编号': 'E1', '修订版本': '2', '评分状态': '已评分', '得分': '1', '满分': '2', '学生最终作答': 'x', '解答过程': '步骤', '评分点得分': 'P1=1', _source_line: 3 },
    { '记录编号': 'R-D02', '学生编号': 'D02', '材料编号': 'Q001', '节点编号': 'N01', '作答事件编号': 'E2', '修订版本': '1', '评分状态': '已评分', '得分': '2', '满分': '2', '学生最终作答': 'other student', '解答过程': 'other steps', '评分点得分': 'P1=2', _source_line: 4 },
  ],
  rubric_observations: [{ record_id: 'R2', student_id: 'D01', item_id: 'Q001', node_id: 'N01', state: 'valid', reason: '评分点编号、得分范围及总分校验一致。', conflicts: [], points: [{ point_id: 'Q001P1', earned: 1, maximum: 2 }] }],
  metrics: [
    { kind: 'class', key: 'C1', score: 1, maximum: 2, ratio: 0.5, count: 1, record_ids: ['R2'], event_ids: ['E1'] },
    { kind: 'class_indicator', key: 'C1:I1', score: 1, maximum: 2, ratio: 0.5, count: 1, record_ids: ['R2'], event_ids: ['E1'] },
    { kind: 'student_indicator', key: 'D01:I1', score: 1, maximum: 2, ratio: 0.5, count: 1, record_ids: ['R2'], event_ids: ['E1'] },
    { kind: 'class_indicator', key: 'C1:I1@N01', class_id: 'C1', indicator_id: 'I1', node_id: 'N01', score: 1, maximum: 2, ratio: 0.5, count: 1, record_ids: ['R2'], event_ids: ['E1'] },
    { kind: 'student_indicator', key: 'D01:I1@N01', student_id: 'D01', indicator_id: 'I1', node_id: 'N01', score: 1, maximum: 2, ratio: 0.5, count: 1, record_ids: ['R2'], event_ids: ['E1'] },
  ],
  observations: [{ student_id: 'D01', class_id: 'C1', indicator_id: 'I1', node_id: 'N01', state: 'scored', unknown_reason: null, available_item_count: 1, selected_count: 1, scored_count: 1, pending_count: 0, unanswered_count: 0, excluded_count: 0, record_ids: ['R2'] }],
} as unknown as AnalysisRun;

describe('TASK02 result panels', () => {
  it('shows raw row dispositions and distinguishes row counts from event counts', () => {
    render(<QualityPanel run={run} />);
    expect(screen.getByText(/原始行评分状态/)).toBeTruthy();
    expect(screen.getByText(/最终事件处置/)).toBeTruthy();
    fireEvent.click(screen.getByText('逐行处置明细'));
    expect(screen.getByText(/R1 · E1 · 第 2 行 · superseded/)).toBeTruthy();
  });

  it('renders class scores by node without using an empty denominator as zero', () => {
    render(<ClassPanel run={run} />);
    expect(screen.getByText('按测验节点与指标比较')).toBeTruthy();
    expect(screen.getByText(/N01/)).toBeTruthy();
    expect(screen.getAllByText(/C1：1\/2（50.0%，1 条）/)).toHaveLength(2);
  });

  it('lets the learner view select a node and labels unknown status explicitly', () => {
    render(<StudentPanel run={run} student="D01" indicator="I1" onStudent={() => {}} onIndicator={() => {}} />);
    expect(screen.getByText(/有效记录 1 条/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('测验节点'), { target: { value: 'N02' } });
    expect(screen.getByText(/暂无有效已评分记录/)).toBeTruthy();
  });

  it('resets selected node when student or run changes', () => {
    const { rerender } = render(<StudentPanel run={run} student="D01" indicator="I1" onStudent={() => {}} onIndicator={() => {}} />);
    fireEvent.change(screen.getByLabelText('测验节点'), { target: { value: 'N02' } });
    rerender(<StudentPanel run={run} student="D02" indicator="I1" onStudent={() => {}} onIndicator={() => {}} />);
    expect((screen.getByLabelText('测验节点') as HTMLSelectElement).value).toBe('N01');
    fireEvent.change(screen.getByLabelText('测验节点'), { target: { value: 'N02' } });
    rerender(<StudentPanel run={{ ...run, run_id: 'run2' }} student="D02" indicator="I1" onStudent={() => {}} onIndicator={() => {}} />);
    expect((screen.getByLabelText('测验节点') as HTMLSelectElement).value).toBe('N01');
  });

  it('shows original and superseded evidence for the selected node', () => {
    render(<EvidencePanel run={run} student="D01" indicator="I1" />);
    expect(screen.getByText(/R1 · Q001 · 已评分 · 0\/2 · 修订 1 · superseded/)).toBeTruthy();
    expect(screen.getByText(/R2 · Q001 · 已评分 · 1\/2 · 修订 2 · scored/)).toBeTruthy();
    expect(screen.getByText('结构化评分点状态：校验一致')).toBeTruthy();
    expect(screen.getByText('Q001P1：1/2')).toBeTruthy();
    expect(screen.getByText('该修订未进入当前分析版本；逐点评分未知。')).toBeTruthy();
    expect(screen.queryByText(/other student/)).toBeNull();
  });

  it('resets evidence node when the student/indicator changes', () => {
    const { rerender } = render(<EvidencePanel run={run} student="D01" indicator="I1" />);
    fireEvent.change(screen.getByLabelText('证据节点'), { target: { value: 'N02' } });
    rerender(<EvidencePanel run={run} student="D02" indicator="I1" />);
    expect((screen.getByLabelText('证据节点') as HTMLSelectElement).value).toBe('N01');
    expect(screen.getByText(/R-D02/)).toBeTruthy();
    expect(screen.queryByText(/D01/)).toBeNull();
  });
});
