// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportPanel } from './ExportPanel';
import { learningApi } from '../../api/client';
import type { ReleasePreflight } from '../../api/types';

const students = ['D01', 'D02', 'D03'].map(id => ({ '学生编号': id, '模拟班级编号': 'C01' }));
const scope = { students, runId: 'run-1', node: 'N02', onNavigate: vi.fn(), onExport: vi.fn() };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ExportPanel', () => {
  it('downloads a draft only for three distinct students from the report scope', () => {
    vi.spyOn(learningApi, 'releaseChecks').mockImplementation(() => new Promise(() => {}));
    const { rerender } = render(<ExportPanel {...scope} ids={['D01', 'D01', 'D03']} />);
    const button = screen.getByRole('button', { name: '下载草稿成果包' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    rerender(<ExportPanel {...scope} ids={['D01', 'D02', 'D04']} />);
    expect(button.disabled).toBe(true);
    rerender(<ExportPanel {...scope} ids={['D01', 'D02', 'D03']} />);
    expect(button.disabled).toBe(false);
    expect(screen.getByText('D01、D02、D03')).not.toBeNull();
    expect(screen.getByText('N02')).not.toBeNull();
    fireEvent.click(button);
    expect(scope.onExport).toHaveBeenCalledWith(['D01', 'D02', 'D03']);
  });

  it('uses the report node for preflight and offers a relevant action for source blocks', async () => {
    const ids = ['D01', 'D02', 'D03'];
    const release = vi.spyOn(learningApi, 'releaseChecks').mockResolvedValue({
      run_id: 'run-1', case_ids: ids, node_id: 'N02', release_status: 'blocked', fingerprint: 'fp-1',
      checks: [{ id: 'source_signoffs', label: '教学材料来源签核仍有效', status: 'blocked', category: 'machine', detail: '待核验' }],
    });
    render(<ExportPanel {...scope} ids={ids} />);
    const button = await screen.findByRole('button', { name: '前往来源核验' });
    expect(release).toHaveBeenCalledWith(ids, 'N02', '', false);
    fireEvent.click(button);
    expect(scope.onNavigate).toHaveBeenCalledWith('/requirements?returnToCheck=1&checkId=source_signoffs');
    expect((screen.getByRole('button', { name: '下载正式提交包' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('requires a fresh matching preflight when the signer changes', async () => {
    const ids = ['D01', 'D02', 'D03'];
    const response: ReleasePreflight = {
      run_id: 'run-1', case_ids: ids, node_id: 'N02', release_status: 'ready_with_open_checks', fingerprint: 'fp-1', checks: [],
    };
    const release = vi.spyOn(learningApi, 'releaseChecks').mockResolvedValue(response);
    render(<ExportPanel {...scope} ids={ids} />);
    const panel = within(screen.getByRole('region', { name: '正式提交发布预检' }));
    const signer = panel.getByRole('textbox', { name: '内容负责人姓名' });
    const signoff = panel.getByRole('checkbox') as HTMLInputElement;
    const button = panel.getByRole('button', { name: '下载正式提交包' }) as HTMLButtonElement;
    fireEvent.change(signer, { target: { value: '教师甲' } });
    fireEvent.click(signoff);
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(release).toHaveBeenLastCalledWith(ids, 'N02', '教师甲', true);

    fireEvent.change(signer, { target: { value: '教师乙' } });
    expect(signoff.checked).toBe(false);
    expect(button.disabled).toBe(true);
    await waitFor(() => expect(release).toHaveBeenLastCalledWith(ids, 'N02', '', false));
  });

  it('previews the package contents and explains that narrative work remains manual', () => {
    render(<ExportPanel {...scope} ids={['', '', '']} />);
    expect(screen.getByText('查看成果包内容与字段口径')).not.toBeNull();
    expect(screen.getByText(/student_cases\.json/)).not.toBeNull();
    expect(screen.getByText(/案例叙述仍需人工补充/)).not.toBeNull();
  });

  it('takes report actions to the visible report view instead of focusing hidden controls', () => {
    render(<ExportPanel {...scope} ids={['D01', 'D02', 'D03']} />);
    fireEvent.click(screen.getByRole('button', { name: '选择报告学生' }));
    expect(scope.onNavigate).toHaveBeenCalledWith('/cases?view=report');
    fireEvent.click(screen.getByRole('button', { name: '选择班级报告节点' }));
    expect(scope.onNavigate).toHaveBeenLastCalledWith('/cases?view=report');
  });
});
