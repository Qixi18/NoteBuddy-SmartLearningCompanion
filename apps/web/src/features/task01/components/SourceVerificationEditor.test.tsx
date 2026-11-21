// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { learningApi } from '../../../api/client';
import type { AnalysisRun } from '../../../api/types';
import { SourceVerificationEditor } from './SourceVerificationEditor';

const run = {
  run_id: 'run-1',
  objectives: [{ '指标编号': 'I1', '观察指标': '指标一' }, { '指标编号': 'I2', '观察指标': '指标二' }],
  items: [
    { '指标编号': 'I1', '材料编号': 'Q1', '题干或内容': '题目一', '材料类型': '题目', '评分点': 'Q1P1: 概念理解' },
    { '指标编号': 'I1', '材料编号': 'R1', '题干或内容': '学习卡', '材料类型': '学习卡' },
  ],
  nodes: [{ '节点编号': 'N1' }, { '节点编号': 'N2' }],
} as unknown as AnalysisRun;

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('SourceVerificationEditor structured rows', () => {
  it('edits knowledge and resource relationships with real indicator, material, and node choices', async () => {
    vi.spyOn(learningApi, 'sourceVerifications').mockResolvedValue({});
    vi.spyOn(learningApi, 'saveSourceVerification').mockResolvedValue({
      run_id: 'run-1', indicator_id: 'I1', status: 'pending', curriculum_locator: '', textbook_locator: '',
      material_ids: [], knowledge_links: [], reviewer: '', reason: '', version: 1, reviewed_at: '',
    });
    render(<SourceVerificationEditor run={run} indicatorId="I1" />);
    fireEvent.click(screen.getByText('开始确认'));

    fireEvent.click(screen.getByRole('button', { name: '添加知识联系' }));
    fireEvent.click(screen.getByRole('button', { name: '添加资源映射' }));

    expect(screen.getAllByLabelText('关联指标')).toHaveLength(2);
    expect(screen.getByLabelText('资源材料')).toBeTruthy();
    expect(screen.getByLabelText('允许节点')).toBeTruthy();
    expect(screen.queryByLabelText('评分点编号（逗号分隔）')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '添加评分点问题' }));
    const rubricRow = screen.getByRole('group', { name: '评分点问题映射' });
    const materialSelect = within(rubricRow).getByLabelText('评分点关联材料') as HTMLSelectElement;
    materialSelect.options[0].selected = true;
    fireEvent.change(materialSelect);
    expect((screen.getByLabelText('评分点编号') as HTMLSelectElement).options).toHaveLength(1);
    expect(screen.queryByLabelText(/必要知识联系.*每行/)).toBeNull();
    expect((screen.getAllByLabelText('关联指标')[0] as HTMLSelectElement).options).toHaveLength(3);
  });

  it('keeps row input and requires comparison before saving after a version conflict', async () => {
    vi.spyOn(learningApi, 'sourceVerifications').mockResolvedValueOnce({}).mockResolvedValueOnce({ I1: [{
      run_id: 'run-1', indicator_id: 'I1', status: 'verified', curriculum_locator: '第 10 页', textbook_locator: '',
      material_ids: [], knowledge_links: [], reviewer: '教师甲', reason: '已核对', version: 1, reviewed_at: '',
    }] });
    const save = vi.spyOn(learningApi, 'saveSourceVerification').mockRejectedValue(new Error('来源签核已被其他编辑更新，请刷新记录后再保存'));
    render(<SourceVerificationEditor run={run} indicatorId="I1" />);
    fireEvent.click(screen.getByText('开始确认'));
    fireEvent.change(screen.getByLabelText('课标来源定位'), { target: { value: '本地修订第 12 页' } });
    fireEvent.click(screen.getByRole('button', { name: '添加知识联系' }));
    fireEvent.change(screen.getAllByLabelText('关联指标')[0], { target: { value: 'I2' } });
    fireEvent.change(screen.getByLabelText('关系'), { target: { value: '前置知识' } });
    fireEvent.change(screen.getByLabelText('核验依据'), { target: { value: '已核对课标' } });
    fireEvent.click(screen.getByRole('button', { name: '保存未确认修改' }));

    expect(await screen.findByText('来源已更新，请比较后重新保存。')).toBeTruthy();
    expect((screen.getByLabelText('核验依据') as HTMLInputElement).value).toBe('已核对课标');
    expect(save).toHaveBeenCalledTimes(1);
    const comparison = screen.getByRole('region', { name: '来源签核版本对比' });
    expect(comparison.textContent).toContain('第 10 页');
    expect(comparison.textContent).toContain('本地修订第 12 页');
    fireEvent.click(screen.getByRole('button', { name: '我已对比，保留本地修改并继续' }));
    expect(screen.getByRole('status').textContent).toContain('已确认本地修改与最新版本的差异');
  });

  it('requires a successful latest-version read before allowing conflict resolution', async () => {
    vi.spyOn(learningApi, 'sourceVerifications')
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('暂时不可用'))
      .mockResolvedValueOnce({ I1: [{
        run_id: 'run-1', indicator_id: 'I1', status: 'pending', curriculum_locator: '第 12 页', textbook_locator: '',
        material_ids: [], knowledge_links: [], reviewer: '教师乙', reason: '', version: 2, reviewed_at: '',
      }] });
    vi.spyOn(learningApi, 'saveSourceVerification').mockRejectedValue(new Error('来源签核已被其他编辑更新，请刷新记录后再保存'));
    render(<SourceVerificationEditor run={run} indicatorId="I1" />);
    fireEvent.click(screen.getByText('开始确认'));
    fireEvent.click(screen.getByRole('button', { name: '保存未确认修改' }));

    expect(await screen.findByRole('button', { name: '重试读取最新版本' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '我已对比，保留本地修改并继续' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重试读取最新版本' }));
    expect(await screen.findByText('第 12 页')).toBeTruthy();
    expect(screen.getByRole('button', { name: '我已对比，保留本地修改并继续' })).toBeTruthy();
  });
});
