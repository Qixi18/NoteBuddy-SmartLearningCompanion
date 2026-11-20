// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIAnalysisPanel } from './AIAnalysisPanel';

const { preview, generate } = vi.hoisted(() => ({ preview: vi.fn(), generate: vi.fn() }));
vi.mock('../../api/client', () => ({ learningApi: { aiAnalysisPreview: preview, generateAIAnalysis: generate, sourceUrl: (name: string) => `/api/source?file=${name}` } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const base = {
  run_id: 'run-1', task: 'task03' as const, scope_key: 'node:N1', scope: {}, source_fingerprint: 'fp',
  stale: false, provider: 'local-compatible', model: 'test-model',
  model_configured: true,
  input_summary: { packet_count: 1, record_count: 1, evidence_count: 1, objective_count: 0 },
};
const result = {
  analysis_id: 'a1', run_id: 'run-1', task: 'task03' as const, scope_key: 'node:N1', scope: {}, source_fingerprint: 'fp',
  model: 'test-model', prompt_version: '1', schema_version: '1', generation: 1, status: 'complete' as const,
  findings: [{ finding_id: 'finding1', category: '表现', claim: '能识别规律', interpretation: '当前记录显示规律识别正确。', support_level: 'supported' as const, limitations: '仅有一条记录。', next_step: '增加一道迁移题。', evidence_refs: [{ kind: 'response', record_id: 'R1', student_id: 'D01', indicator_id: 'I1', node_id: 'N1', source_line: 8, excerpt: '规律是递增' }] }],
  coverage: { packet_total: 1, packet_succeeded: 1, packet_failed: 0, raw_records_total: 1, raw_records_included: 1 }, created_at: '2026-11-20T00:00:00Z', updated_at: '2026-11-20T00:00:00Z', stale: false,
};

describe('AIAnalysisPanel', () => {
  it('requires transmission confirmation, then displays evidence-linked analysis directly', async () => {
    preview.mockResolvedValue({ ...base, analysis: null });
    generate.mockResolvedValue(result);
    render(<AIAnalysisPanel task="task03" runId="run-1" node="N1" student="D01" indicator="I1" />);
    expect(await screen.findByText('作答记录')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '生成 AI 分析' }));
    expect(generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认发送并生成' }));
    expect(await screen.findByText('能识别规律')).not.toBeNull();
    expect(screen.getByText('仅有一条记录。')).not.toBeNull();
    expect(screen.getByRole('button', { name: '查看原始记录 ↗' })).not.toBeNull();
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ transmission_confirmed: true, node_id: 'N1', student_id: 'D01' }));
    expect(screen.queryByText(/教师审核|等待复核|批准后/)).toBeNull();
  });

  it('shows a stale marker and permits refresh without gating display behind review', async () => {
    preview.mockResolvedValue({ ...base, stale: true, analysis: { ...result, status: 'partial', coverage: { packet_total: 2, packet_succeeded: 1, packet_failed: 1, failed_packet_ids: ['p2'], raw_records_total: 2, raw_records_included: 2 } } });
    generate.mockResolvedValue({ ...result, generation: 2 });
    render(<AIAnalysisPanel task="task03" runId="run-1" node="N1" student="D01" indicator="I1" />);
    expect(await screen.findByText(/旧分析已标记为过期/)).not.toBeNull();
    expect(screen.getByText(/证据包：1\/2 成功，1 失败/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '更新过期分析' }));
    fireEvent.click(screen.getByRole('button', { name: '确认发送并生成' }));
    expect(await screen.findByText(/版本 2/)).not.toBeNull();
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ action: 'refresh' }));
  });

  it('shows a recoverable preview error', async () => {
    preview.mockRejectedValue(new Error('读取失败'));
    render(<AIAnalysisPanel task="task01" runId="run-1" />);
    expect((await screen.findByRole('alert')).textContent).toContain('读取失败');
  });

  it('explains missing model configuration and does not offer a generation action', async () => {
    preview.mockResolvedValue({ ...base, model_configured: false, analysis: null });
    render(<AIAnalysisPanel task="task01" runId="run-1" />);
    expect(await screen.findByText(/后端尚未配置模型 API Key/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: '生成 AI 分析' })).toBeNull();
  });
});
