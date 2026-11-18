// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./hooks/useWorkbench', () => ({
  useWorkbench: () => ({
    run: null, loading: false, error: false, message: '', reviews: {}, suggestions: [],
    student: '', indicator: '', node: '', draft: null,
    setStudent: vi.fn(), setIndicator: vi.fn(), setNode: vi.fn(), refresh: vi.fn(async () => true),
    announce: vi.fn(), makeDraft: vi.fn(), saveReview: vi.fn(), exportCases: vi.fn(),
  }),
}));

vi.mock('../features/import/ImportPanel', () => ({ ImportPanel: () => null }));
vi.mock('../pages/WorkbenchPages', async () => {
  const { routeFor } = await import('./navigation');
  return { WorkbenchPage: ({ path }: { path: Parameters<typeof routeFor>[0] }) => <h2>{routeFor(path).title}</h2> };
});

afterEach(cleanup);
beforeEach(() => window.history.replaceState(null, '', '/'));

describe('App navigation', () => {
  it('updates the page and selected navigation on hash changes and browser history', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: '全局概览', level: 2 });

    fireEvent.click(screen.getByRole('link', { name: '学科知识' }));
    await screen.findByRole('heading', { name: '学习要求与来源', level: 2 });
    expect(screen.getByRole('link', { name: '学习要求与来源' }).getAttribute('aria-current')).toBe('page');

    window.history.back();
    await waitFor(() => expect(screen.getByRole('heading', { name: '全局概览', level: 2 })).not.toBeNull());
    window.history.forward();
    await waitFor(() => expect(screen.getByRole('heading', { name: '学习要求与来源', level: 2 })).not.toBeNull());
  });
});
