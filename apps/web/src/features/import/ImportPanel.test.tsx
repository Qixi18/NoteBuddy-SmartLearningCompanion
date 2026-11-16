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

  it('rejects an empty folder before making a request', () => {
    const onMessage = vi.fn();
    render(<ImportPanel onImported={vi.fn()} onMessage={onMessage} />);
    fireEvent.click(screen.getByRole('button', { name: '导入并分析' }));
    expect(onMessage).toHaveBeenCalledWith('请输入 CSV 文件夹的绝对路径。', true);
  });
});
