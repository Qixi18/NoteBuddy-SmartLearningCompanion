// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportPanel } from './ImportPanel';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ImportPanel', () => {
  it('imports the selected folder and reports the new run', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"run_id":"run-1","quality":{}}', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    const onImported = vi.fn().mockResolvedValue(undefined);
    const onMessage = vi.fn();
    render(<ImportPanel onImported={onImported} onMessage={onMessage} />);
    fireEvent.change(screen.getByLabelText('CSV 文件夹路径'), { target: { value: 'D:\\data' } });
    fireEvent.click(screen.getByRole('button', { name: '导入并分析' }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith('run-1'));
    expect(onMessage).toHaveBeenCalledWith('正在导入和分析…');
  });

  it('submits the import form from the folder field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"run_id":"run-enter","quality":{}}', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    const onImported = vi.fn().mockResolvedValue(undefined);
    render(<ImportPanel onImported={onImported} onMessage={vi.fn()} />);
    const input = screen.getByLabelText('CSV 文件夹路径');
    fireEvent.change(input, { target: { value: 'D:\\data' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(onImported).toHaveBeenCalledWith('run-enter'));
  });

  it('rejects an empty folder before making a request', () => {
    const onMessage = vi.fn();
    render(<ImportPanel onImported={vi.fn()} onMessage={onMessage} />);
    fireEvent.click(screen.getByRole('button', { name: '导入并分析' }));
    expect(onMessage).toHaveBeenCalledWith('请输入 CSV 文件夹的绝对路径。', true);
  });

  it('keeps the selected path and announces a readable import failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"目录中缺少必需 CSV 文件"}', {
      status: 400, headers: { 'content-type': 'application/json' },
    })));
    const onMessage = vi.fn();
    render(<ImportPanel onImported={vi.fn()} onMessage={onMessage} />);
    const input = screen.getByLabelText('CSV 文件夹路径') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'D:\\input\\run' } });
    fireEvent.click(screen.getByRole('button', { name: '导入并分析' }));
    expect((await screen.findByRole('alert')).textContent).toContain('目录中缺少必需 CSV 文件');
    expect(input.value).toBe('D:\\input\\run');
    expect((screen.getByRole('button', { name: '导入并分析' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
