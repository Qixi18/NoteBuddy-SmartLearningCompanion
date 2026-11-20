// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowNav } from './WorkflowNav';

describe('WorkflowNav', () => {
  it('shows the five workflow destinations and marks only the current page', () => {
    const onNavigate = vi.fn();
    render(<WorkflowNav path="/performance" onNavigate={onNavigate} />);

    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('link', { name: '已有表现' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: '学习建议' }).getAttribute('aria-current')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: '案例与交付' }));
    expect(onNavigate).toHaveBeenCalledWith('/cases');
  });
});
