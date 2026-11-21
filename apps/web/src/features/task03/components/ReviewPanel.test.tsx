// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisRun, Draft, Review, SourceVerification, TeachingPlanV2 } from '../../../api/types';
import { isStructuredPlanCurrentlyVerified, ReviewPanel } from './ReviewPanel';
import draftFixtureJson from '../../../../../../contracts/api/draft.json';

afterEach(cleanup);

const draftFixture = draftFixtureJson as Draft;

describe('ReviewPanel', () => {
  it('matches the current source signature using the same version and material rules as export', () => {
    const review: Review = {
      status: 'accepted', node_id: 'N01', version: 1, original_draft: null,
      reviewer: '教师', updated_at: '2026-11-17', diagnosis: '', recommendation: '',
      adjustment_condition: '', reason: '', source: 'rule', evidence_record_ids: [],
      model: null, prompt_version: null,
      structured_plan: { material_ids: ['L01'], activity: '活动', steps: [], practice: [], observation_points: [] },
      source_verification_versions: { T01I1: 3 },
    };
    const current = { status: 'verified', version: 3, material_ids: ['L01', 'L02'] } as SourceVerification;
    const changedVersion = { ...current, version: 4 };
    const removedMaterial = { ...current, material_ids: ['L02'] };
    const revoked = { ...current, status: 'rejected' } as SourceVerification;

    expect(isStructuredPlanCurrentlyVerified(review, 'T01I1', current)).toBe(true);
    expect(isStructuredPlanCurrentlyVerified(review, 'T01I1', changedVersion)).toBe(false);
    expect(isStructuredPlanCurrentlyVerified(review, 'T01I1', removedMaterial)).toBe(false);
    expect(isStructuredPlanCurrentlyVerified(review, 'T01I1', revoked)).toBe(false);
    expect(isStructuredPlanCurrentlyVerified(review, 'T01I1', null)).toBe(false);
  });

  it('keeps the review form hidden until a draft exists', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    render(<ReviewPanel student="S1" indicator="I1" node="" draft={null} onDraft={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByLabelText('复核状态')).toBeNull();
    expect(screen.queryByRole('button', { name: '保存复核' })).toBeNull();
    expect((screen.getByRole('button', { name: '生成规则草稿' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a saved accepted plan as a read-only review and distinguishes its status', () => {
    const review = {
      status: 'accepted', node_id: 'N01', version: 3, original_draft: null, reviewer: '教师甲', updated_at: '2026-11-20',
      diagnosis: '分数意义理解不稳', recommendation: '先用数轴表示', adjustment_condition: '若仍混淆则补充练习', reason: '对应本次作答',
      source: 'rule', evidence_record_ids: [], model: null, prompt_version: null, structured_plan: null,
    } as unknown as Review;
    render(<ReviewPanel student="S1" indicator="I1" node="N01" review={review} draft={null} onDraft={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole('heading', { name: '已复核建议' })).toBeTruthy();
    expect(screen.getByText('分数意义理解不稳')).toBeTruthy();
    expect(screen.getByText('先用数轴表示')).toBeTruthy();
    expect(screen.getByText(/当前页面以已保存版本为只读内容/)).toBeTruthy();
    expect(screen.queryByLabelText('建议')).toBeNull();
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

  it('defaults inconclusive drafts to observation instead of acceptance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    const inconclusiveDraft = { ...draftFixture, unknown_reason: 'evidence_conflict' } as Draft;
    render(<ReviewPanel student="D01" indicator="T01I1" node="N01" draft={inconclusiveDraft} onDraft={vi.fn()} onSave={vi.fn()} />);
    const status = await screen.findByLabelText('复核状态') as HTMLSelectElement;
    expect(status.value).toBe('needs_observation');
  });

  it('lets a teacher attach no-scored-evidence coverage to a review', async () => {
    const run = {
      run_id: 'RUN-1', items: [], responses: [], raw_responses: [], observations: [], source_index: [],
      objectives: [], nodes: [], quality: { record_dispositions: [], findings: [] },
    } as unknown as AnalysisRun;
    const bundle = {
      scope: { run_id: 'RUN-1', student_id: 'D01', indicator_id: 'T01I1', node_id: 'N01' },
      coverage: { evidence_id: 'coverage:current-hash', record_count: 1, scored_record_count: 0, record_disposition_counts: { pending: 1 } },
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/evidence-bundle') ? bundle : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const onSave = vi.fn().mockResolvedValue(undefined);
    const draft = { ...draftFixture, node_id: 'N01', evidence_record_ids: [], observed_record_ids: [], evidence_source_lines: [] } as Draft;
    render(<ReviewPanel run={run} student="D01" indicator="T01I1" node="N01" draft={draft} onDraft={vi.fn()} onSave={onSave} />);
    const coverageCheckbox = await screen.findByLabelText(/将此覆盖记录作为本次教师复核的证据引用/);
    fireEvent.click(coverageCheckbox);
    fireEvent.click(screen.getByRole('button', { name: '保存复核' }));
    await act(async () => {});
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      evidence_refs: [{
        kind: 'coverage', evidence_id: 'coverage:current-hash',
        scope: bundle.scope,
      }],
    }));
  });

  it('shows actionable steps and observation even when activity repeats the recommendation', () => {
    const draft = {
      ...draftFixture,
      activity: draftFixture.recommendation,
      steps: ['核对原始作答与评分点', '安排节点内另一题观察'],
      material_ids: ['L01'],
      observation_point: '记录学生能否独立说明步骤',
    } as Draft;
    render(<ReviewPanel student="D01" indicator="T01I1" node="N01" draft={draft} onDraft={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByText('核对原始作答与评分点')).toBeTruthy();
    expect(screen.getByText('L01', { exact: false })).toBeTruthy();
    expect(screen.getByText(/观察点：记录学生能否独立说明步骤/)).toBeTruthy();
  });

  it('shows node-scoped practice separately from verified learning resources and explains exclusions', () => {
    const draft = {
      ...draftFixture,
      resource_selection: {
        status: 'ready', purpose: 'transfer', candidate_node_item_count: 2,
        practice_items: [{ material_id: 'Q002', resource_type: '题目', title: '迁移题', purpose: '', reason_codes: ['unseen_for_transfer'], reason: 'unseen_for_transfer' }],
        learning_resources: [{ material_id: 'LC01', resource_type: '学习卡', title: '', purpose: '迁移练习', reason_codes: ['purpose_match'], reason: 'purpose_match' }],
        excluded: [{ material_id: 'Q003', reason_codes: ['outside_node_scope'], reason: '题目不在当前节点范围内。' }],
        reason_codes: [],
      },
    } as Draft;
    render(<ReviewPanel student="D01" indicator="T01I1" node="N01" draft={draft} onDraft={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '范围内材料建议' })).toBeTruthy();
    expect(screen.getByText(/迁移题/)).toBeTruthy();
    expect(screen.getByText('LC01', { exact: false })).toBeTruthy();
    expect(screen.getByText(/当前节点未作答，适合迁移观察/)).toBeTruthy();
    fireEvent.click(screen.getByText(/查看未采用材料/));
    expect(screen.getByText(/题目不在当前节点范围内/)).toBeTruthy();
  });

  it('explains when source verification blocks all material recommendations', () => {
    const draft = {
      ...draftFixture,
      resource_selection: {
        status: 'blocked', purpose: 'diagnostic', practice_items: [], learning_resources: [],
        excluded: [], reason_codes: ['no_verified_candidate'],
      },
    } as Draft;
    render(<ReviewPanel student="D01" indicator="T01I1" node="N01" draft={draft} onDraft={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByText('暂不推荐')).toBeTruthy();
    expect(screen.getByText(/当前没有符合范围且来源已核验的材料/)).toBeTruthy();
  });

  it('adopts and edits a versioned plan, then saves it separately from the legacy plan', async () => {
    const plan: TeachingPlanV2 = {
      schema_version: 2,
      scope: { run_id: 'RUN-1', student_id: 'D01', indicator_id: 'T01I1', node_id: 'N01' },
      goal: '针对指标使用Q001核对步骤。', purpose: 'remediation', material_ids: ['Q001'],
      resource_reasons: [{ material_id: 'Q001', resource_type: '题目', reason_codes: ['verified_indicator_match'], explanation: '节点内已核验' }],
      steps: ['查看证据R2', '独立完成练习'],
      hints: [
        { level: 'direction', student_prompt: '先回想方法', teacher_note: '不直接给结果' },
        { level: 'structure', student_prompt: '拆分步骤', teacher_note: '观察能否分解' },
        { level: 'local_check', student_prompt: '核对局部步骤', teacher_note: '按错误位置反馈' },
      ],
      observation_points: ['记录独立完成情况'], adjustment_conditions: ['需要提示时安排回看'],
      evidence_refs: [{ evidence_id: 'ev-r2', record_id: 'R2', material_id: 'Q001', source_line: 3 }],
      source_versions: { T01I1: 1 }, evidence_fingerprint: 'fingerprint-1',
      template_version: 'teaching-plan-2026.11.1', teacher_review_required: true,
    };
    const draft = { ...draftFixture, teaching_plan_preview: plan } as Draft;
    const onSave = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));
    render(<ReviewPanel student="D01" indicator="T01I1" node="N01" draft={draft} onDraft={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: '载入分层方案草稿' }));
    fireEvent.change(screen.getAllByLabelText('学生可见')[0], { target: { value: '用自己的话回忆方法' } });
    expect(screen.getAllByText(/教师使用说明（不会进入学生提示投影）/)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '保存复核' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      structured_plan: null,
      teaching_plan_v2: expect.objectContaining({
        hints: expect.arrayContaining([expect.objectContaining({ level: 'direction', student_prompt: '用自己的话回忆方法' })]),
      }),
    }));
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
    const reviews: Record<string, Review[]> = {
      'D01:T01I1': [
        {
          status: 'edited', diagnosis: 'N01 diagnosis', recommendation: 'N01 recommendation',
          adjustment_condition: '', source: 'rule', model: null, prompt_version: null, node_id: 'N01',
          original_draft: { ...draftFixture, node_id: 'N01' }, evidence_record_ids: ['R1'],
          structured_plan: {
            material_ids: ['L01'], activity: '用数轴解释变式',
            steps: ['呈现数轴', '让学生说明位置'], practice: ['完成一题变式'],
            observation_points: ['记录学生是否能说明方向'],
          },
          source_verification_versions: { T01I1: 3 },
          reason: 'reviewed in N01', reviewer: '教师', version: 1, updated_at: '2026-11-17',
        },
        {
          status: 'accepted', node_id: 'N02', diagnosis: 'N02 diagnosis', recommendation: 'N02 recommendation',
          adjustment_condition: '', source: 'rule', model: null, prompt_version: null,
          original_draft: { ...draftFixture, node_id: 'N02' }, evidence_record_ids: ['R2'],
          reason: 'reviewed in N02', reviewer: '教师', version: 2, updated_at: '2026-11-17',
        },
      ],
    };
    const verification = {
      run_id: 'RUN-1', indicator_id: 'T01I1', status: 'verified',
      material_ids: ['L01'], version: 3,
    };
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response(
      JSON.stringify(String(input).includes('source-verifications') ? { T01I1: [verification] } : reviews),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))));
    render(<ReviewPanel run={{ run_id: 'RUN-1' } as AnalysisRun} student="D01" indicator="T01I1" node="N02" draft={null} onDraft={vi.fn()} onSave={vi.fn()} />);

    expect(await screen.findByText(/版本 1 · 节点 N01/)).toBeTruthy();
    expect(await screen.findByText(/版本 2 · 节点 N02/)).toBeTruthy();
    fireEvent.click(screen.getByText(/查看复核历史/));
    fireEvent.click(screen.getByText(/版本 1 · 节点 N01/));
    expect(screen.getByText(/活动：用数轴解释变式/)).toBeTruthy();
    expect(screen.getByText('完成一题变式')).toBeTruthy();
    expect(screen.getByText('记录学生是否能说明方向')).toBeTruthy();
    expect(screen.getByText(/材料：L01 · 来源签核版本 3/)).toBeTruthy();
    expect(await screen.findByText('本方案来源签核仍有效（版本 3）')).toBeTruthy();
  });

  it('warns when a saved plan no longer matches the current source signoff', async () => {
    const review: Review = {
      status: 'accepted', node_id: 'N01', diagnosis: '', recommendation: '',
      adjustment_condition: '', reason: '', source: 'rule', evidence_record_ids: ['R1'],
      structured_plan: { material_ids: ['L01'], activity: '复习活动', steps: [], practice: [], observation_points: [] },
      source_verification_versions: { T01I1: 3 }, model: null, prompt_version: null,
      original_draft: null, reviewer: '教师', version: 1, updated_at: '2026-11-17',
    };
    const current = { run_id: 'RUN-1', indicator_id: 'T01I1', status: 'verified', material_ids: ['L01'], version: 4 };
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response(
      JSON.stringify(String(input).includes('source-verifications')
        ? { T01I1: [current] }
        : { 'D01:T01I1': [review] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))));
    render(<ReviewPanel run={{ run_id: 'RUN-1' } as AnalysisRun} student="D01" indicator="T01I1" node="N01" draft={null} onDraft={vi.fn()} onSave={vi.fn()} />);

    fireEvent.click(await screen.findByText(/查看复核历史/));
    fireEvent.click(screen.getByText(/版本 1 · 节点 N01/));
    expect(await screen.findByText(/来源签核已变化、撤销或无法核验/)).toBeTruthy();
    expect(screen.getByText(/该方案仅作历史记录，导出时不会作为有效方案/)).toBeTruthy();
  });
});
