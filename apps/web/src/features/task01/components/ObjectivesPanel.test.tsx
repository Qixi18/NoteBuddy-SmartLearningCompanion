// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { learningApi } from '../../../api/client';
import type { AnalysisRun } from '../../../api/types';
import { ObjectivesPanel } from './ObjectivesPanel';

describe('ObjectivesPanel source checks', () => {
  beforeEach(() => {
    vi.spyOn(learningApi, 'sourceVerifications').mockResolvedValue({});
    vi.spyOn(learningApi, 'materialCatalog').mockResolvedValue({ run_id: 'run-1', indicators: [] });
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('shows topic-level source notes separately from unconfirmed indicator relations', async () => {
    const run = {
      objectives: [{
        '指标编号': 'T01I1',
        '观察指标': '理解代数式',
        '主题编号': 'T01',
        '主题目标': '理解代数式',
      }],
      items: [],
      source_index: [{
        indicator_id: 'T01I1',
        topic_id: 'T01',
        source_check: {
          curriculum_check: '课标主题页码已登记',
          textbook_check: '主题教材切片已登记',
          textbook_slices: [],
        },
        verification: 'pending',
      }],
    } as unknown as AnalysisRun;

    render(<ObjectivesPanel run={run} />);

    expect(screen.getByText(/课标主题页码已登记/)).toBeTruthy();
    expect(screen.getByText(/主题教材切片已登记/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText(/指标关系状态：关系待确认/).length).toBeGreaterThan(0);
    });
  });

  it('shows signoff state even while the independent material catalog is still pending', async () => {
    vi.spyOn(learningApi, 'materialCatalog').mockImplementation(() => new Promise(() => {}));
    const run = {
      run_id: 'run-1', objectives: [{ '指标编号': 'I1', '主题编号': 'T1', '观察指标': '指标一' }],
      items: [], source_index: [{ indicator_id: 'I1', verification: 'pending' }],
    } as unknown as AnalysisRun;
    render(<ObjectivesPanel run={run} />);
    await waitFor(() => expect(screen.getByText(/指标关系状态：关系待确认/)).toBeTruthy());
    expect(screen.queryByText(/正在读取签核记录/)).toBeNull();
  });

  it('changes indicator details without treating another indicator source as verified', async () => {
    const run = {
      objectives: [
        { '指标编号': 'I1', '主题编号': 'T1', '观察指标': '指标一' },
        { '指标编号': 'I2', '主题编号': 'T1', '观察指标': '指标二' },
      ],
      items: [{ '指标编号': 'I2', '材料编号': 'Q2', '题干或内容': '第二题' }],
      source_index: [{ indicator_id: 'I2', verification: 'pending' }],
    } as unknown as AnalysisRun;
    render(<ObjectivesPanel run={run} />);
    fireEvent.click(screen.getByRole('button', { name: /I2.*指标二/ }));
    expect(screen.getAllByRole('heading', { name: 'I2 · 指标二' }).length).toBeGreaterThan(0);
    expect(screen.getByText('第二题')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText(/指标关系状态：关系待确认/).length).toBeGreaterThan(0);
    });
  });

  it('uses the shared selected indicator and reports a selection change to its owner', () => {
    const run = {
      objectives: [
        { '指标编号': 'I1', '主题编号': 'T1', '观察指标': '指标一' },
        { '指标编号': 'I2', '主题编号': 'T1', '观察指标': '指标二' },
      ], items: [], source_index: [],
    } as unknown as AnalysisRun;
    const onIndicatorChange = vi.fn();
    const { rerender } = render(<ObjectivesPanel run={run} indicatorId="I2" onIndicatorChange={onIndicatorChange} />);

    expect(screen.getAllByRole('heading', { name: 'I2 · 指标二' }).length).toBeGreaterThan(0);
    const directory = screen.getByRole('heading', { name: '主题与指标目录' }).closest('.card');
    expect(directory).not.toBeNull();
    fireEvent.click(within(directory as HTMLElement).getByRole('button', { name: /I1.*指标一/ }));
    expect(onIndicatorChange).toHaveBeenCalledWith('I1');
    expect(screen.getByRole('heading', { name: 'I2 · 指标二' })).toBeTruthy();
    rerender(<ObjectivesPanel run={run} indicatorId="I1" onIndicatorChange={onIndicatorChange} />);
    expect(screen.getAllByRole('heading', { name: 'I1 · 指标一' }).length).toBeGreaterThan(0);
  });

  it('shows the latest human signoff instead of the immutable run snapshot status', async () => {
    const save = vi.spyOn(learningApi, 'saveSourceVerification').mockResolvedValue({
      run_id: 'run-1',
      indicator_id: 'T01I1',
      status: 'verified',
      curriculum_locator: '课标第 62 页',
      textbook_locator: '教材第 68 页',
      material_ids: ['Q001'],
      knowledge_links: [],
      rubric_mappings: [{ issue_id: 'combine_like_terms', label: '同类项识别有误', rubric_point_ids: ['Q001P1'], material_ids: ['Q001'], evidence: '评分点定义', reviewer: '数学教师甲', status: 'verified' }],
      resource_links: [{ material_id: 'TB01', purpose: '再次讲解', indicator_ids: ['T01I1'], allowed_node_ids: ['N01'], source_locator: '教材第 68 页', evidence: '例题对应', status: 'verified', resource_type: '教材', content_hash: 'a'.repeat(64) }],
      source_fingerprints: { TB01: 'a'.repeat(64) },
      reviewer: '数学教师甲',
      reason: '已核对原页',
      version: 2,
      reviewed_at: '2026-11-20T00:00:00+00:00',
    });
    vi.spyOn(learningApi, 'sourceVerifications').mockResolvedValue({
      T01I1: [{
        run_id: 'run-1',
        indicator_id: 'T01I1',
        status: 'verified',
        curriculum_locator: '课标第 62 页',
        textbook_locator: '教材第 68 页',
        material_ids: ['Q001'],
        knowledge_links: [],
        rubric_mappings: [{ issue_id: 'combine_like_terms', label: '同类项识别有误', rubric_point_ids: ['Q001P1'], material_ids: ['Q001'], evidence: '评分点定义', reviewer: '数学教师甲', status: 'verified' }],
        resource_links: [{ material_id: 'TB01', purpose: '再次讲解', indicator_ids: ['T01I1'], allowed_node_ids: ['N01'], source_locator: '教材第 68 页', evidence: '例题对应', status: 'verified', resource_type: '教材', content_hash: 'a'.repeat(64) }],
        source_fingerprints: { TB01: 'a'.repeat(64) },
        reviewer: '数学教师甲',
        reason: '已核对原页',
        version: 1,
        reviewed_at: '2026-11-19T00:00:00+00:00',
      }],
    });
    const run = {
      run_id: 'run-1',
      objectives: [{ '指标编号': 'T01I1', '观察指标': '理解代数式', '主题编号': 'T01' }],
      items: [{ '指标编号': 'T01I1', '材料编号': 'Q001', '题干或内容': '一道已核验题目' }],
      source_index: [{ indicator_id: 'T01I1', verification: 'pending' }],
    } as unknown as AnalysisRun;

    render(<ObjectivesPanel run={run} />);

    await waitFor(() => {
      // 目录条目与核验进度行都可能包含"T01I1 · 已核验"，此处限定目录区域。
      const directory = document.querySelector('.topic-group') as HTMLElement;
      expect(within(directory).getByRole('button', { name: /T01I1.*已核验/ })).toBeTruthy();
      expect(screen.getByText('指标关系状态：已核验。主题说明仅供定位；以指标级核验记录判断材料关系。')).toBeTruthy();
      expect(screen.getByText(/评分点问题 同类项识别有误 · Q001P1 · Q001 · verified/)).toBeTruthy();
      expect(screen.getByText(/教材 TB01 · 再次讲解 · verified/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText('更新关系确认'));
    const editor = screen.getByText(/评分点问题 同类项识别有误/).closest('section');
    fireEvent.click(within(editor!).getByRole('button', { name: '确认指标与来源关系' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      indicator_id: 'T01I1',
      expected_version: 1,
      rubric_mappings: [{ issue_id: 'combine_like_terms', label: '同类项识别有误', rubric_point_ids: ['Q001P1'], material_ids: ['Q001'], evidence: '评分点定义', reviewer: '数学教师甲', status: 'verified' }],
      resource_links: [{ material_id: 'TB01', purpose: '再次讲解', indicator_ids: ['T01I1'], allowed_node_ids: ['N01'], source_locator: '教材第 68 页', evidence: '例题对应', status: 'verified' }],
    })));
  });

  it('labels a changed source fingerprint as requiring renewed review', async () => {
    vi.spyOn(learningApi, 'sourceVerifications').mockResolvedValue({
      T01I1: [{
        run_id: 'run-1', indicator_id: 'T01I1', status: 'verified',
        curriculum_locator: '课标第 62 页', textbook_locator: '教材第 68 页',
        material_ids: [], knowledge_links: [], reviewer: '数学教师甲', reason: '已核验',
        version: 1, reviewed_at: '2026-11-19T00:00:00+00:00', stale: true,
      }],
    });
    const run = {
      run_id: 'run-1',
      objectives: [{ '指标编号': 'T01I1', '观察指标': '理解代数式', '主题编号': 'T01' }],
      items: [],
      source_index: [{ indicator_id: 'T01I1', verification: 'verified' }],
    } as unknown as AnalysisRun;

    render(<ObjectivesPanel run={run} />);

    await waitFor(() => {
      const directory = document.querySelector('.topic-group') as HTMLElement;
      expect(within(directory).getByRole('button', { name: /T01I1.*来源已变化，需重新核验/ })).toBeTruthy();
      expect(screen.getByText(/指标关系状态：来源已变化，需重新核验/)).toBeTruthy();
    });
  });

  it('shows page counts, fingerprints, review state and direct PDF page links', async () => {
    vi.spyOn(learningApi, 'materialCatalog').mockResolvedValue({
      run_id: 'run-1',
      indicators: [{
        indicator_id: 'T01I1', topic_id: 'T01', source_status: 'pending', source_stale: false,
        curriculum_locator: '', textbook_locator: '',
        documents: [{
          name: '课程标准_2022.pdf', available: true, sha256: 'a'.repeat(64), bytes: 20,
          page_count: 70, text_page_count: 0, text_pages: [], expected_file_page: 62,
          body_page: 55, source_kind: 'curriculum', status: 'page_text_unavailable',
          url: '/api/source?file=课程标准_2022.pdf',
        }],
        materials: [{
          material_id: 'TB01', resource_type: '教材', topic_id: 'T01', title: '教材例题',
          source: '', source_locator: '教材第 68 页', purpose: '复习概念', verified: true,
        }],
      }],
    });
    const run = {
      run_id: 'run-1',
      objectives: [{ '指标编号': 'T01I1', '观察指标': '理解代数式', '主题编号': 'T01' }],
      items: [], source_index: [{ indicator_id: 'T01I1', verification: 'pending' }],
    } as unknown as AnalysisRun;

    render(<ObjectivesPanel run={run} />);

    expect(await screen.findByText(/SHA-256：a{12}/)).toBeTruthy();
    expect(screen.getByText(/OCR未提取到该页文本/)).toBeTruthy();
    expect(screen.getByText(/TB01/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '打开第 62 页' }).getAttribute('href')).toContain('#page=62');
  });

  it('keeps long linked question lists compact until the teacher asks to view all', () => {
    const run = {
      run_id: 'run-1',
      objectives: [{ '指标编号': 'T01I1', '观察指标': '理解代数式', '主题编号': 'T01' }],
      items: Array.from({ length: 41 }, (_, index) => ({
        '指标编号': 'T01I1', '材料编号': `Q${String(index + 1).padStart(3, '0')}`, '题干或内容': `题目内容 ${index + 1}`,
      })),
      source_index: [],
    } as unknown as AnalysisRun;

    render(<ObjectivesPanel run={run} />);

    const detail = screen.getByRole('heading', { name: '关联题目 · 41 道' }).closest('section');
    expect(detail).not.toBeNull();
    expect(within(detail as HTMLElement).getByText('题目内容 1')).toBeTruthy();
    expect(within(detail as HTMLElement).getByText('题目内容 5')).toBeTruthy();
    expect(within(detail as HTMLElement).queryByText('题目内容 6')).toBeNull();

    fireEvent.click(within(detail as HTMLElement).getByRole('button', { name: '查看全部关联题目（41）' }));
    expect(within(detail as HTMLElement).getByText('题目内容 41')).toBeTruthy();
    expect(within(detail as HTMLElement).getByRole('button', { name: '收起关联题目' })).toBeTruthy();
  });
});
