// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Draft } from '../../../api/types';
import { ReviewPanel } from './ReviewPanel';
import draftFixture from '../../../../../../contracts/api/draft.json';

afterEach(cleanup);

describe('ReviewPanel', () => {
  it('keeps the review form hidden until a draft exists', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    render(<ReviewPanel student="S1" indicator="I1" node="" draft={null} onDraft={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByLabelText('复核状态')).toBeNull();
    expect(screen.queryByRole('button', { name: '保存复核' })).toBeNull();
    expect((screen.getByRole('button', { name: '生成规则草稿' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('passes the selected node when requesting a draft', () => {
    const onDraft = vi.fn();
    render(<ReviewPanel student="S1" indicator="I1" node="N02" draft={null} onDraft={onDraft} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '生成规则草稿' }));
    expect(onDraft).toHaveBeenCalledWith('rule', 'N02');
  });

  it('prevents duplicate draft generation while a request is pending', async () => {
    let resolveDraft!: () => void;
    const onDraft = vi.fn(() => new Promise<void>(resolve => { resolveDraft = resolve; }));
    render(<ReviewPanel student="S1" indicator="I1" node="N01" draft={null} onDraft={onDraft} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '生成规则草稿' }));
    expect(screen.getAllByRole('button', { name: '正在生成草稿…' }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(onDraft).toHaveBeenCalledTimes(1);
    await act(async () => resolveDraft());
  });

  it('does not allow saving a draft that still requires node scope', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    render(<ReviewPanel student="S1" indicator="I1" node="" draft={{ ...draftFixture, scope_required: true, node_id: null }} onDraft={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toMatch(/多个节点有记录/);
    expect(screen.queryByRole('button', { name: '保存复核' })).toBeNull();
  });

  it('shows rule evidence and inference limits with the editable draft', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    render(<ReviewPanel student="D01" indicator="T01I1" node="N01" draft={draftFixture as Draft} onDraft={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText(/规则：TR-05/)).toBeTruthy();
    expect(screen.getByText('已评分事实：Q001 1/2')).toBeTruthy();
    expect(screen.getByText(/适用边界：结论仅限列出的题目得分/)).toBeTruthy();
    expect(screen.getByText(/原始来源行：3/)).toBeTruthy();
  });

  it('prevents duplicate review saves while one is pending', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(() => new Promise<void>(resolve => { resolveSave = resolve; }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));
    render(<ReviewPanel student="D01" indicator="T01I1" node="N01" draft={draftFixture as Draft} onDraft={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: '保存复核' }));
    expect((screen.getByRole('button', { name: '正在保存…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => resolveSave());
  });

  it('announces a save failure and keeps the teacher edits in the form', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('本地服务暂不可用'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));
    render(<ReviewPanel student="D01" indicator="T01I1" node="N01" draft={draftFixture as Draft} onDraft={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('诊断'), { target: { value: '教师编辑后保留的诊断' } });
    fireEvent.click(screen.getByRole('button', { name: '保存复核' }));

    expect((await screen.findByRole('alert')).textContent).toContain('本地服务暂不可用');
    expect((screen.getByLabelText('诊断') as HTMLTextAreaElement).value).toBe('教师编辑后保留的诊断');
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('labels each historical review with its node, including legacy draft fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      'D01:T01I1': [
        {
          status: 'edited', diagnosis: 'N01 diagnosis', recommendation: 'N01 recommendation',
          adjustment_condition: '', source: 'rule', model: null, prompt_version: null,
          original_draft: { ...draftFixture, node_id: 'N01' }, evidence_record_ids: ['R1'],
          reason: 'reviewed in N01', reviewer: '教师', version: 1, updated_at: '2026-11-17',
        },
        {
          status: 'accepted', node_id: 'N02', diagnosis: 'N02 diagnosis', recommendation: 'N02 recommendation',
          adjustment_condition: '', source: 'rule', model: null, prompt_version: null,
          original_draft: { ...draftFixture, node_id: 'N02' }, evidence_record_ids: ['R2'],
          reason: 'reviewed in N02', reviewer: '教师', version: 2, updated_at: '2026-11-17',
        },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    render(<ReviewPanel student="D01" indicator="T01I1" node="N02" draft={null} onDraft={vi.fn()} onSave={vi.fn()} />);

    expect(await screen.findByText(/版本 1 · 节点 N01/)).toBeTruthy();
    expect(await screen.findByText(/版本 2 · 节点 N02/)).toBeTruthy();
  });
});
