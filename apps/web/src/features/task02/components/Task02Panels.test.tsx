// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { learningApi } from '../../../api/client';
import type { AnalysisRun } from '../../../api/types';
import { ClassPanel } from './ClassPanel';
import { EvidencePanel } from './EvidencePanel';
import { QualityPanel } from './QualityPanel';
import { StudentPanel } from './StudentPanel';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.spyOn(learningApi, 'studentInsights').mockResolvedValue({
    scope: { run_id: 'run1', student_id: 'D01', indicator_id: 'I1', node_id: 'N01' },
    bundle_fingerprint: 'bundle-1', claims: [],
  });
  vi.spyOn(learningApi, 'classInsights').mockResolvedValue({
    run_id: 'run1', node_id: 'N01', classes: [], comparisons: [], issues: [], limitations: [],
  });
});

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
    const onNode = vi.fn();
    const { rerender } = render(<ClassPanel run={run} node="" onNode={onNode} />);
    expect(screen.getByText(/选择一个测验节点，查看各班在该节点的有效评分/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('测验节点'), { target: { value: 'N01' } });
    expect(onNode).toHaveBeenCalledWith('N01');
    rerender(<ClassPanel run={run} node="N01" onNode={onNode} />);
    fireEvent.click(screen.getByText('节点 N01 的指标明细'));
    expect(screen.getByText(/C1：1\/2（50.0%，1 条）/)).toBeTruthy();
  });

  it('keeps the class comparison inside the selected indicator scope', () => {
    const scopedRun = {
      ...run,
      objectives: [...run.objectives, { '主题编号': 'T01', '指标编号': 'I2', '观察指标': '几何' }],
      metrics: [...run.metrics, { kind: 'class_indicator', key: 'C1:I2@N01', class_id: 'C1', indicator_id: 'I2', node_id: 'N01', score: 2, maximum: 2, ratio: 1, count: 1, record_ids: ['R-X'], event_ids: ['E-X'] }],
    } as AnalysisRun;
    render(<ClassPanel run={scopedRun} node="N01" indicator="I1" />);
    fireEvent.click(screen.getByText('节点 N01 的指标明细'));

    expect(screen.getByText(/C1：1\/2（50\.0%，1 条）/)).toBeTruthy();
    expect(screen.queryByText(/I2 · 几何/)).toBeNull();
  });

  it('shows common-item scope and deduplicated issue counts with student drilldown', async () => {
    vi.spyOn(learningApi, 'classInsights').mockResolvedValue({
      run_id: 'run1', node_id: 'N01', classes: [],
      comparisons: [{
        indicator_id: 'I1', status: 'available', common_material_ids: ['Q001'],
        classes: [
          { class_id: 'C1', scored_record_count: 2, observed_student_count: 2, score: 3, maximum: 4, ratio: 0.75, common_score: 3, common_maximum: 4, common_ratio: 0.75, common_record_count: 2 },
          { class_id: 'C2', scored_record_count: 2, observed_student_count: 2, score: 2, maximum: 4, ratio: 0.5, common_score: 2, common_maximum: 4, common_ratio: 0.5, common_record_count: 2 },
        ],
      }],
      issues: [{
        indicator_id: 'I1', issue_id: 'same-step', label: '步骤依据缺失',
        by_class: [{ class_id: 'C1', affected_count: 1, affected_student_ids: ['D01'], observed_student_count: 2, evidence_refs: [{ record_id: 'R1', source_line: 2, material_id: 'Q001' }] }],
        limitations: ['按学生去重。'],
      }],
      limitations: ['不输出班级能力排名或显著性结论。'],
    });
    const onOpenStudent = vi.fn();
    render(<ClassPanel run={run} node="N01" onOpenStudent={onOpenStudent} />);
    expect(await screen.findByText('共同观察题目：Q001')).toBeTruthy();
    expect(screen.getByText(/C1：1\/2 名可观察学生有跨题/)).toBeTruthy();
    fireEvent.click(screen.getByText('查看原始记录来源（1）'));
    expect(screen.getByText(/C1 · R1 · Q001 · CSV第 2 行/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看 D01 证据' }));
    expect(onOpenStudent).toHaveBeenCalledWith('D01');
    expect(screen.getByText(/不输出班级能力排名/)).toBeTruthy();
  });

  it('lets the learner view select a node and labels unknown status explicitly', () => {
    render(<StudentPanel run={run} student="D01" indicator="I1" onStudent={() => {}} onIndicator={() => {}} onCreateRecommendation={() => {}} />);
    expect(screen.getByText(/有效记录 1 条/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('测验节点'), { target: { value: 'N02' } });
    expect(screen.getByText(/暂无有效已评分记录/)).toBeTruthy();
  });

  it('keeps key scoring states visible and puts technical dispositions behind disclosure', () => {
    render(<StudentPanel run={run} student="D01" indicator="I1" node="N01" onStudent={() => {}} onIndicator={() => {}} onCreateRecommendation={() => {}} />);
    expect(screen.getByLabelText('当前节点评分状态').textContent).toContain('有效评分 1');
    expect(screen.getByLabelText('当前节点评分状态').textContent).toContain('待评分 0');
    expect(screen.getByLabelText('当前节点评分状态').textContent).toContain('未作答 0');
    expect(screen.getByText('选中事件 1').closest('details')?.open).toBe(false);
    fireEvent.click(screen.getByText('查看记录处理详情'));
    expect(screen.getByText('选中事件 1').closest('details')?.open).toBe(true);
    expect(screen.getByLabelText('记录处理详情').textContent).toContain('选中事件 1');
  });

  it('offers a direct recommendation path and an observation path without scored evidence', () => {
    const onCreateRecommendation = vi.fn();
    const onNode = vi.fn();
    const { rerender } = render(<StudentPanel run={run} student="D01" indicator="I1" node="N01" onNode={onNode} onStudent={() => {}} onIndicator={() => {}} onCreateRecommendation={onCreateRecommendation} />);
    fireEvent.click(screen.getByRole('button', { name: /形成学习建议/ }));
    expect(onCreateRecommendation).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('测验节点'), { target: { value: 'N02' } });
    rerender(<StudentPanel run={run} student="D01" indicator="I1" node="N02" onNode={onNode} onStudent={() => {}} onIndicator={() => {}} onCreateRecommendation={onCreateRecommendation} />);
    expect(screen.getByRole('button', { name: /补充观察并形成建议/ })).toBeTruthy();
    expect(screen.getByText(/不把缺失记录当作学习结论/)).toBeTruthy();
  });

  it('resets selected node when student or run changes', () => {
    const { rerender } = render(<StudentPanel run={run} student="D01" indicator="I1" onStudent={() => {}} onIndicator={() => {}} onCreateRecommendation={() => {}} />);
    fireEvent.change(screen.getByLabelText('测验节点'), { target: { value: 'N02' } });
    rerender(<StudentPanel run={run} student="D02" indicator="I1" onStudent={() => {}} onIndicator={() => {}} onCreateRecommendation={() => {}} />);
    expect((screen.getByLabelText('测验节点') as HTMLSelectElement).value).toBe('N01');
    fireEvent.change(screen.getByLabelText('测验节点'), { target: { value: 'N02' } });
    rerender(<StudentPanel run={{ ...run, run_id: 'run2' }} student="D02" indicator="I1" onStudent={() => {}} onIndicator={() => {}} onCreateRecommendation={() => {}} />);
    expect((screen.getByLabelText('测验节点') as HTMLSelectElement).value).toBe('N01');
  });

  it('shows original and superseded evidence for the selected node', () => {
    render(<EvidencePanel run={run} student="D01" indicator="I1" />);
    expect(screen.getByText(/R1 · Q001 · 已评分 · 0\/2 · 修订 1 · superseded/)).toBeTruthy();
    expect(screen.getByText(/R2 · Q001 · 已评分 · 1\/2 · 修订 2 · scored/)).toBeTruthy();
    expect(screen.getByText('结构化评分点状态：校验一致')).toBeTruthy();
    expect(screen.getByText('Q001P1：1/2')).toBeTruthy();
    expect(screen.getByText('该修订未进入当前分析版本；逐点评分未知。')).toBeTruthy();
    expect(screen.getByText(/原始 CSV：作答记录.csv · 第 2 行/)).toBeTruthy();
    expect(screen.queryByText(/other student/)).toBeNull();
  });

  it('opens and focuses the exact referenced evidence row', () => {
    render(<EvidencePanel run={run} student="D01" indicator="I1" focusEvidence={{ recordId: 'R2', sourceLine: 3 }} />);
    const target = document.getElementById('evidence-R2-3') as HTMLDetailsElement;
    expect(target.open).toBe(true);
  });

  it('returns from evidence on Escape or the return control', () => {
    const onClose = vi.fn();
    render(<EvidencePanel run={run} student="D01" indicator="I1" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '返回学生分析' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not mark a duplicate record ID from another source row as selected', () => {
    const duplicateIdRun = {
      ...run,
      responses: [...run.responses, { ...run.responses[0], _source_line: 99 }],
    } as AnalysisRun;
    render(<EvidencePanel run={duplicateIdRun} student="D01" indicator="I1" />);
    expect(screen.getByText('该修订未进入当前分析版本；逐点评分未知。')).toBeTruthy();
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
