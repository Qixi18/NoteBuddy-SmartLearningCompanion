// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportPanel } from './ExportPanel';

const students = ['D01', 'D02', 'D03'].map(id => ({ '学生编号': id, '模拟班级编号': 'C01' }));

afterEach(cleanup);

describe('ExportPanel', () => {
  it('requires three distinct explicit student selections', () => {
    const onExport = vi.fn();
    render(<ExportPanel students={students} suggestions={[]} onExport={onExport} />);
    const button = screen.getByRole('button', { name: '下载成果包' });
    const selects = screen.getAllByRole('combobox');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(selects[0], { target: { value: 'D01' } });
    fireEvent.change(selects[1], { target: { value: 'D01' } });
    fireEvent.change(selects[2], { target: { value: 'D03' } });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(selects[1], { target: { value: 'D02' } });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onExport).toHaveBeenCalledWith(['D01', 'D02', 'D03']);
  });

  it('rejects selections that are not present in the current run', () => {
    const { rerender } = render(<ExportPanel students={students} suggestions={[]} onExport={vi.fn()} />);
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'D01' } });
    fireEvent.change(selects[1], { target: { value: 'D02' } });
    fireEvent.change(selects[2], { target: { value: 'D03' } });
    rerender(<ExportPanel students={students.slice(0, 2)} suggestions={[]} onExport={vi.fn()} />);
    expect((screen.getByRole('button', { name: '下载成果包' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('previews the package contents and explains that narrative work remains manual', () => {
    render(<ExportPanel students={students} suggestions={[]} onExport={vi.fn()} />);
    expect(screen.getByText('查看成果包内容与字段口径')).not.toBeNull();
    expect(screen.getByText(/student_cases\.json/)).not.toBeNull();
    expect(screen.getByText(/案例叙述仍需人工补充/)).not.toBeNull();
  });
});
