// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisRun } from '../../../api/types';
import { TeacherCaseEditor } from './TeacherCaseEditor';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('TeacherCaseEditor evidence references', () => {
  it('sends exact current-scope response references with the selected record IDs', async () => {
    const scope = { run_id: 'run-1', student_id: 'D01', indicator_id: 'I1', node_id: 'N1' };
    const bundle = {
      scope,
      responses: [{
        kind: 'response', evidence_id: 'evidence-R1', record_id: 'R1', source_line: 7,
        student_id: 'D01', indicator_id: 'I1', node_id: 'N1', material_id: 'Q1',
        state: '已评分', disposition: 'scored', raw_response: '学生作答', solution_steps: '',
      }],
      items: [], rubric_definitions: [],
      coverage: { expected_material_ids: ['Q1'], observed_material_ids: ['Q1'], unobserved_material_ids: [], record_count: 1, scored_record_count: 1, unknown_reason: null, evidence_id: 'coverage-1' },
      source_versions: {}, source_context: { status: 'pending', stale: false, rubric_mappings: [] },
      issues: [], fingerprint: 'fingerprint-1',
    };
    const saved = vi.fn();
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/evidence-bundle')) return new Response(JSON.stringify(bundle), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url === '/api/teacher-cases') return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      if (url === '/api/teacher-case' && init?.method === 'POST') return new Response(JSON.stringify({ ...JSON.parse(String(init.body)), run_id: 'run-1', version: 1, reviewed_at: '2026-11-21' }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetch);
    const run = {
      run_id: 'run-1',
      students: [{ '学生编号': 'D01', '模拟班级编号': 'C1' }],
      objectives: [{ '指标编号': 'I1', '观察指标': '学习目标' }],
      nodes: [{ '节点编号': 'N1' }],
      responses: [{ '学生编号': 'D01', '记录编号': 'R1', '材料编号': 'Q1', '节点编号': 'N1', '_source_line': 7 }],
    } as unknown as AnalysisRun;

    render(<TeacherCaseEditor run={run} reviews={{}} onSaved={saved} />);
    fireEvent.click(await screen.findByText('开始案例签核'));
    fireEvent.change(screen.getByLabelText('案例叙述'), { target: { value: '教师记录的范围内案例' } });
    fireEvent.change(screen.getByLabelText('样本限制与不能推断的结论'), { target: { value: '仅限当前节点' } });
    fireEvent.change(screen.getByLabelText('确认教师'), { target: { value: '教师甲' } });
    fireEvent.click(screen.getByLabelText(/R1 · 节点 N1/));
    fireEvent.click(screen.getByRole('button', { name: '保存案例草稿' }));

    await waitFor(() => expect(saved).toHaveBeenCalled());
    const request = fetch.mock.calls.find(([input, init]) => String(input) === '/api/teacher-case' && init?.method === 'POST');
    const payload = JSON.parse(String(request?.[1]?.body));
    expect(payload.evidence_record_ids).toEqual(['R1']);
    expect(payload.evidence_refs).toEqual([{ kind: 'response', evidence_id: 'evidence-R1', record_id: 'R1', source_line: 7, scope }]);
  });
});
