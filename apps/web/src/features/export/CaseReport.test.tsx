// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { learningApi } from '../../api/client';
import type { AnalysisRun, CaseReports } from '../../api/types';
import { CaseReport } from './CaseReport';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('CaseReport source validity', () => {
  it('distinguishes the reviewed source snapshot from the current changed signoff', async () => {
    const reviews: CaseReports['cases'][number]['reviews'] = [{
      indicator_id: 'I1', node_id: 'N1', version: 3, status: 'edited', diagnosis: '需观察',
      recommendation: '安排练习', reason: '根据记录', reviewer: '教师甲', structured_plan: null,
      teaching_plan_v2: null, source_verification_versions: { I1: 1 }, source_status: 'verified',
      source_validity: 'changed', current_source_status: 'verified', current_source_version: 2,
    }];
    const caseReports: CaseReports = {
      run_id: 'run-1', status: 'incomplete',
      cases: ['D01', 'D02', 'D03'].map((studentId, index) => ({
        run_id: 'run-1', student_id: studentId, class_id: 'C1', status: index === 0 ? 'confirmed' : 'incomplete',
        case_version: 1, reviewer: '教师甲', reviewed_at: '', narrative: '案例', limitations: '范围有限',
        evidence: [], reviews: index === 0 ? reviews : [], adjustments: [],
      })),
      comparison: ['D01', 'D02', 'D03'].map(student_id => ({
        student_id, class_id: 'C1', status: student_id === 'D01' ? 'confirmed' as const : 'incomplete' as const,
        review_count: 1, evidence_count: 0, adjustment_count: 0,
      })),
      limitations: [],
    };
    vi.spyOn(learningApi, 'caseReports').mockResolvedValue(caseReports);
    const run = { run_id: 'run-1', students: ['D01', 'D02', 'D03'].map(id => ({ '学生编号': id, '模拟班级编号': 'C1' })) } as AnalysisRun;

    render(<CaseReport run={run} ids={['D01', 'D02', 'D03']} onSelect={vi.fn()} />);

    expect(await screen.findByText(/所引来源已变化：复核引用 v1，当前 v2（verified）/)).toBeTruthy();
    expect(screen.getByText('来源有效性：')).toBeTruthy();
  });
});
