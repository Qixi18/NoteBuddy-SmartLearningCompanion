// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { learningApi } from '../../../api/client';
import { InsightPanel } from './InsightPanel';

describe('InsightPanel', () => {
  it('shows the claim, limits and cited evidence action', async () => {
    const onOpenEvidence = vi.fn();
    vi.spyOn(learningApi, 'studentInsights').mockResolvedValue({
      scope: { run_id: 'run-1', student_id: 'D01', indicator_id: 'T01I1', node_id: 'N01' },
      bundle_fingerprint: 'bundle-1',
      claims: [{
        claim_id: 'claim-1', kind: 'fact', text: '记录 R1 中 Q001P1 得 0/1 分。',
        evidence_refs: [{ evidence_id: 'response:r1', record_id: 'R1', source_line: 20, material_id: 'Q001', description: 'Q001P1' }],
        limitations: ['这是单题事实，不代表整个指标掌握程度。'], review_status: 'not_reviewed',
      }],
    });

    render(<InsightPanel student="D01" indicator="T01I1" node="N01" onOpenEvidence={onOpenEvidence} />);

    fireEvent.click(await screen.findByRole('button', { name: '在作答证据中定位引用' }));
    expect(screen.getByText('观察事实')).toBeTruthy();
    expect(screen.getByText(/这是单题事实/)).toBeTruthy();
    expect(screen.getByText(/R1 · Q001 · CSV第20行/)).toBeTruthy();
    expect(onOpenEvidence).toHaveBeenCalledWith('R1', 20);
  });
});
