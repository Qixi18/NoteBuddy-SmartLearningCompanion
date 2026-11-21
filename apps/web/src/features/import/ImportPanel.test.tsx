// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportPanel } from './ImportPanel';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const requiredNames = ['课程要求.csv', '题目与材料.csv', '模拟学生.csv', '测验节点.csv', '作答记录.csv', '字段说明.csv'];

function chooseFiles(input: HTMLElement, names = requiredNames) {
  const files = names.map(name => {
    const file = new File([`内容-${name}`], name, { type: 'text/csv' });
    Object.defineProperty(file, 'webkitRelativePath', { value: `模拟数据/${name}` });
    Object.defineProperty(file, 'text', { value: async () => `内容-${name}` });
    return file;
  });
  fireEvent.change(input, { target: { files } });
  return files;
}

describe('ImportPanel', () => {
  it('imports all required CSV files and reports the new run', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"run_id":"run-1","quality":{}}', {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetch);
    const onImported = vi.fn().mockResolvedValue(undefined);
    const onMessage = vi.fn();
    render(<ImportPanel onImported={onImported} onMessage={onMessage} />);
    chooseFiles(screen.getByLabelText('选择 CSV 文件夹'));
    fireEvent.click(screen.getByRole('button', { name: '检查文件并导入' }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith('run-1'));
    expect(onMessage).toHaveBeenCalledWith('正在本机导入和分析…');
    expect(JSON.parse(fetch.mock.calls[0][1].body as string).files).toEqual(
      Object.fromEntries(requiredNames.map(name => [name, `内容-${name}`])),
    );
    expect(fetch.mock.calls).toHaveLength(1);
  });

  it('submits the import form with Enter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"run_id":"run-enter","quality":{}}', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    const onImported = vi.fn().mockResolvedValue(undefined);
    render(<ImportPanel onImported={onImported} onMessage={vi.fn()} />);
    const input = screen.getByLabelText('选择 CSV 文件夹');
    chooseFiles(input);
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(onImported).toHaveBeenCalledWith('run-enter'));
  });

  it('shows import progress and disables resubmission while the request is pending', async () => {
    let resolveResponse!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { resolveResponse = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const onImported = vi.fn().mockResolvedValue(undefined);
    render(<ImportPanel onImported={onImported} onMessage={vi.fn()} />);
    chooseFiles(screen.getByLabelText('选择 CSV 文件夹'));
    fireEvent.click(screen.getByRole('button', { name: '检查文件并导入' }));

    const pending = await screen.findByRole('button', { name: '正在导入…' });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('正在本机导入 CSV');
    expect(screen.getByRole('status').textContent).not.toContain('自动解析');
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => resolveResponse(new Response('{"run_id":"run-pending","quality":{}}', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith('run-pending'));
  });

  it('sends OCR only after confirming the exact previewed file list', async () => {
    const fingerprint = 'a'.repeat(64);
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        provider: 'DeepSeek OCR', purpose: 'rich_layout_recognition', billing_unit: 'successful_page', fingerprint,
        status: 'ready', will_send_count: 1, cached_count: 1,
        files: {
          '课程标准_2022.pdf': { status: 'ready', will_send: true, bytes: 1024, sha256: 'hash-1' },
          '教材.pdf': { status: 'cached', will_send: false, bytes: 512, sha256: 'hash-2' },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'complete', parsed_file_count: 2, file_count: 2 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ImportPanel onImported={vi.fn()} onMessage={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /识别来源 PDF/ }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('课程标准_2022.pdf（1024 字节）'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('成功识别页'));
    expect(fetch.mock.calls[1][0]).toBe('/api/source-ocr');
    expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual({ confirmed: true, preview_fingerprint: fingerprint });
  });

  it('reports missing required files before making a request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const onMessage = vi.fn();
    render(<ImportPanel onImported={vi.fn()} onMessage={onMessage} />);
    chooseFiles(screen.getByLabelText('选择 CSV 文件夹'), requiredNames.slice(0, 2));
    fireEvent.click(screen.getByRole('button', { name: '检查文件并导入' }));
    expect((await screen.findByRole('alert')).textContent).toContain('所选文件夹缺少：');
    expect(fetch).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('所选文件夹缺少：'), true);
  });

  it('ignores extra files and keeps a readable import error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"文件无法读取"}', {
      status: 400, headers: { 'content-type': 'application/json' },
    })));
    const onMessage = vi.fn();
    render(<ImportPanel onImported={vi.fn()} onMessage={onMessage} />);
    const input = screen.getByLabelText('选择 CSV 文件夹');
    chooseFiles(input, [...requiredNames, '说明.txt']);
    fireEvent.click(screen.getByRole('button', { name: '检查文件并导入' }));
    expect((await screen.findByRole('alert')).textContent).toContain('文件无法读取');
    expect(screen.getByText('已选择 模拟数据 · 7 个文件')).not.toBeNull();
    expect((screen.getByRole('button', { name: '检查文件并导入' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
