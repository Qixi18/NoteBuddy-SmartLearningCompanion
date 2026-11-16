// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewPanel } from './ReviewPanel';

afterEach(cleanup);

describe('ReviewPanel', () => {
  it('accepts review status changes and keeps saving disabled without a draft', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    render(<ReviewPanel student="S1" indicator="I1" draft={null} onDraft={vi.fn()} onSave={vi.fn()} />);
    const select = screen.getByLabelText('复核状态');
    fireEvent.change(select, { target: { value: 'needs_observation' } });
    expect((select as HTMLSelectElement).value).toBe('needs_observation');
    expect((screen.getByRole('button', { name: '保存复核' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
