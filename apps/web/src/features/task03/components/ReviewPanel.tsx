import { useEffect, useState } from 'react';
import { learningApi, isReviewStatus } from '../../../api/client';
import type { AnalysisRun, Draft, EvidenceReference, Review, ReviewStatus, SourceVerification, StructuredPlan, TeachingPlanV2 } from '../../../api/types';
import { Panel } from '../../../components/Panel';
import { TeachingPlanEditor } from './TeachingPlanEditor';
import { dispositionLabel } from '../../task02/qualityLabels';

type ReviewFields = { status: ReviewStatus; diagnosis: string; recommendation: string; adjustment_condition: string; reason: string; reviewer: string; structured_plan: StructuredPlan | null; teaching_plan_v2: TeachingPlanV2 | null; evidence_refs?: EvidenceReference[] };
const emptyFields: ReviewFields = { status: 'accepted', diagnosis: '', recommendation: '', adjustment_condition: '', reason: '', reviewer: '', structured_plan: null, teaching_plan_v2: null };
const statusLabels: Record<ReviewStatus, string> = { accepted: '接受', edited: '已修改', needs_observation: '待观察', rejected: '驳回' };
const selectionReasonLabels: Record<string, string> = {
  verified_indicator_match: '已核验并匹配当前指标',
  target_issue_match: '对应当前观察到的问题',
  purpose_match: '用途与当前教学目标相符',
  unseen_for_transfer: '当前节点未作答，适合迁移观察',
  observed_item_reflection_only: '当前节点已作答，仅建议复盘',
  stable_id_tiebreak: '同优先级按材料编号稳定排序',
  node_scope_required: '需要先选择单一测验节点',
  no_verified_candidate: '当前没有符合范围且来源已核验的材料',
};
const hintLabels: Record<TeachingPlanV2['hints'][number]['level'], string> = {
  direction: '方向提示', structure: '结构提示', local_check: '局部检查提示',
};

function ResourceSelectionPanel({ draft }: { draft: Draft }) {
  const selection = draft.resource_selection;
  if (!selection) return null;
  const purposeLabel = selection.purpose === 'remediation' ? '补救巩固' : selection.purpose === 'transfer' ? '迁移观察' : '诊断核对';
  const reasonText = (codes: string[]) => codes.map(code => selectionReasonLabels[code] ?? code).join('；');
  return <section className="resource-selection" aria-label="范围内材料建议">
    <div className="resource-selection-heading"><div><h3>范围内材料建议</h3><p>目标：{purposeLabel} · 按来源签核、节点范围和教学用途筛选</p></div><span className={`status-badge status-${selection.status}`}>{selection.status === 'ready' ? '有可用候选' : '暂不推荐'}</span></div>
    {selection.status === 'blocked' && <p className="review-alert" role="status">{reasonText(selection.reason_codes) || '当前没有可安全推荐的材料。'} 请先完成来源核验或检查节点范围。</p>}
    {selection.practice_items.length > 0 && <div><h4>练习题</h4><ul>{selection.practice_items.map(item => <li key={item.material_id}><strong>{item.material_id}</strong>{item.title && <> · {item.title}</>}<small>{reasonText(item.reason_codes)}</small></li>)}</ul></div>}
    {selection.learning_resources.length > 0 && <div><h4>教材与学习卡</h4><ul>{selection.learning_resources.map(item => <li key={item.material_id}><strong>{item.material_id}</strong> · {item.resource_type}{item.purpose && <> · {item.purpose}</>}<small>{reasonText(item.reason_codes)}</small></li>)}</ul></div>}
    {selection.excluded.length > 0 && <details><summary>查看未采用材料（{selection.excluded.length}）</summary><ul>{selection.excluded.map(item => <li key={`${item.material_id}:${item.reason}`}><strong>{item.material_id}</strong> · {item.reason}</li>)}</ul></details>}
  </section>;
}

export function isStructuredPlanCurrentlyVerified(review: Review, indicator: string, verification: SourceVerification | null): boolean {
  const plan = review.structured_plan;
  return Boolean(
    plan
    && verification?.status === 'verified'
    && review.source_verification_versions?.[indicator] === verification.version
    && plan.material_ids.every(id => verification.material_ids.includes(id)),
  );
}

export function isTeachingPlanV2SourceCurrentlyVerified(plan: TeachingPlanV2, indicator: string, verification: SourceVerification | null): boolean {
  if (!verification || verification.status !== 'verified' || verification.stale || plan.scope.indicator_id !== indicator || plan.source_versions[indicator] !== verification.version) return false;
  return plan.material_ids.every(id => {
    const reason = plan.resource_reasons.find(item => item.material_id === id);
    if (reason?.resource_type === '题目') return verification.material_ids.includes(id);
    return (verification.resource_links ?? []).some(link => link.material_id === id && link.status === 'verified' && link.indicator_ids.includes(indicator) && link.allowed_node_ids.includes(plan.scope.node_id));
  });
}

function EvidenceContext({ run, student, indicator, node, draft }: { run?: AnalysisRun; student: string; indicator: string; node: string; draft: Draft }) {
  if (!run) return <aside className="review-context"><h3>本次依据 · {student} · {indicator} · {node}</h3>{draft.observed_fact && <div className="context-item"><span>观察事实</span><p>{draft.observed_fact}</p></div>}{draft.inference_limit && <div className="context-limit"><strong>适用边界：{draft.inference_limit}</strong></div>}<div className="review-tech-details"><p>规则：{draft.rule_id || '未提供'} · 证据类型：{draft.evidence_kind || '未分类'}</p><p>引用记录：{draft.evidence_record_ids.join('、') || '无有效记录'} · 原始来源行：{draft.evidence_source_lines?.join('、') || '未提供'}</p></div><p>当前无法读取作答明细。</p></aside>;
  const itemIds = new Set(run.items.filter(item => item['指标编号'] === indicator).map(item => item['材料编号']));
  const records = (run.raw_responses ?? run.responses).filter(row => row['学生编号'] === student && row['节点编号'] === node && itemIds.has(row['材料编号']));
  const observation = run.observations.find(value => value.student_id === student && value.indicator_id === indicator && value.node_id === node);
  const verification = run.source_index.find(value => value.indicator_id === indicator);
  const draftedEvidence = new Set(draft.evidence_record_ids);
  return <aside className="review-context" aria-label="复核依据与限制">
    <h3>证据范围 · {student} · {indicator} · {node}</h3>
    <div className="context-metrics"><span><strong>{observation?.scored_count ?? 0}</strong> 条有效评分</span><span><strong>{records.length}</strong> 条原始记录</span></div>
    <div className="context-item"><span>观察目标</span><p>{draft.objective || run.objectives.find(item => item['指标编号'] === indicator)?.['观察指标'] || '当前范围未提供目标。'}</p></div>
    {draft.observed_fact && <div className="context-item"><span>观察事实</span><p>{draft.observed_fact}</p></div>}
    <div className="context-item"><span>来源状态</span><p>{verification?.verification === 'verified' ? '指标来源已核验' : '指标来源待核验；不能作为已确认教学材料。'}</p></div>
    {records.length ? <div className="context-records"><span>原始作答记录</span>{records.map((record, index) => {
      const selected = run.responses.some(row => row['记录编号'] === record['记录编号'] && row._source_line === record._source_line);
      const disposition = run.quality.record_dispositions?.find(row => row.record_id === record['记录编号'] && row.source_line === record._source_line)?.disposition ?? (selected ? 'scored' : 'unknown');
      const finding = run.quality.findings.find(row => row.record_id === record['记录编号'] && row.source_line === record._source_line);
      const item = run.items.find(value => value['材料编号'] === record['材料编号']);
      return <details className="review-record" key={`${record['记录编号']}:${record._source_line}`}>
        <summary><strong>{record['记录编号']} · {record['材料编号']}</strong><span className={`status-badge status-${disposition}`}>{dispositionLabel(disposition)}</span><small>{record['得分'] || '—'}/{record['满分'] || '—'}</small></summary>
        <div><p>{item?.['题干或内容'] || '未提供题干'}</p><p>学生作答：{record['学生最终作答'] || '未作答'}</p>{record['解答过程'] && <p>解题过程：{record['解答过程']}</p>}<small>事件 {record['作答事件编号']} · 修订 {record['修订版本']} · CSV 第 {record._source_line} 行{draftedEvidence.has(record['记录编号']) ? ' · 草稿引用' : ''}</small>{finding && <p className="review-alert">{finding.detail}</p>}</div>
      </details>;
    })}</div> : <p className="review-alert">当前范围没有作答记录，不能据此判断学生未掌握。</p>}
    {draft.inference_limit && <div className="context-limit"><strong>适用边界：{draft.inference_limit}</strong></div>}
    {draft.unknown_reason && <div className="review-alert">暂不形成学习结论：{draft.unknown_reason}</div>}
    {draft.score_points_to_review.length > 0 && <div className="context-item"><span>待核验评分点</span><p>{draft.score_points_to_review.join('、')}</p></div>}
    <div className="review-tech-details"><p>规则：{draft.rule_id || '未提供'} · 证据类型：{draft.evidence_kind || '未分类'}</p><p>引用记录：{draft.evidence_record_ids.join('、') || '无有效记录'} · 原始来源行：{draft.evidence_source_lines?.join('、') || '未提供'}</p>{draft.source_locator && <p>来源定位：{draft.source_locator}</p>}</div>
  </aside>;
}

export function ReviewPanel({ run, student, indicator, node, review, draft, onDraft, onSave, initialFields, onFieldsChange }: { run?: AnalysisRun; student: string; indicator: string; node: string; review?: Review; draft: Draft | null; onDraft: (provider: 'rule' | 'deepseek', node: string) => Promise<void>; onSave: (payload: ReviewFields) => Promise<void>; initialFields?: ReviewFields; onFieldsChange?: (fields: ReviewFields) => void }) {
  const [fields, setFields] = useState<ReviewFields>(initialFields ?? emptyFields);
  const [verification, setVerification] = useState<SourceVerification | null>(null);
  const [source, setSource] = useState('');
  const [history, setHistory] = useState<Review[]>([]);
  const [coverageRef, setCoverageRef] = useState<EvidenceReference | null>(null);
  const [includeCoverage, setIncludeCoverage] = useState(false);
  const [failure, setFailure] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (name: keyof ReviewFields, value: string) => {
    const next = { ...fields, [name]: value };
    setFields(next);
    onFieldsChange?.(next);
  };
  const setPlan = (plan: StructuredPlan | null) => { const next = { ...fields, structured_plan: plan }; setFields(next); onFieldsChange?.(next); };

  useEffect(() => {
    if (!run) return;
    let alive = true;
    setVerification(null);
    learningApi.sourceVerifications().then(map => { if (alive) setVerification(map[indicator]?.at(-1) ?? null); }).catch(() => { if (alive) setVerification(null); });
    return () => { alive = false; };
  }, [run?.run_id, indicator]);

  useEffect(() => {
    setCoverageRef(null);
    setIncludeCoverage(false);
    if (!run || !node) return;
    let alive = true;
    learningApi.evidenceBundle(student, indicator, node).then(bundle => {
      if (!alive || bundle.coverage.record_count !== 0) return;
      const next: EvidenceReference = {
        kind: 'coverage',
        evidence_id: bundle.coverage.evidence_id,
        scope: bundle.scope,
      };
      setCoverageRef(next);
      setIncludeCoverage(review?.evidence_refs?.some(ref => ref.evidence_id === next.evidence_id) ?? false);
    }).catch(() => { if (alive) setCoverageRef(null); });
    return () => { alive = false; };
  }, [run?.run_id, student, indicator, node, review?.version]);

  useEffect(() => {
    setFailure('');
    let alive = true;
    learningApi.reviewHistory(`${student}:${indicator}`).then(next => { if (alive) setHistory(next); }).catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [student, indicator, review]);

  useEffect(() => {
    if (!draft) { setSource(''); return; }
    if (!initialFields) {
      const planMatchesEvidence = Boolean(fields.teaching_plan_v2 && draft.teaching_plan_preview?.evidence_fingerprint === fields.teaching_plan_v2.evidence_fingerprint);
      const next = {
        ...fields,
        diagnosis: draft.diagnosis,
        recommendation: draft.recommendation,
        adjustment_condition: draft.adjustment_condition,
        teaching_plan_v2: planMatchesEvidence ? fields.teaching_plan_v2 : null,
        structured_plan: planMatchesEvidence ? fields.structured_plan : null,
      };
      setFields(next);
      onFieldsChange?.(next);
    }
    setSource(`草稿来源：${draft.source === 'rule' ? '规则生成' : '模型辅助生成'} · 引用记录 ${draft.evidence_record_ids.join('、') || '无有效记录'}`);
  // Draft identity changes only when the selected workbench scope changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    if (initialFields) { setFields(initialFields); return; }
    if (!review) { setFields(emptyFields); setSource(''); return; }
    setFields({ status: review.status, diagnosis: review.diagnosis, recommendation: review.recommendation, adjustment_condition: review.adjustment_condition || '', reason: review.reason, reviewer: review.reviewer, structured_plan: review.teaching_plan_v2 ? null : review.structured_plan ?? null, teaching_plan_v2: review.teaching_plan_v2 ?? null, evidence_refs: review.evidence_refs ?? [] });
    setSource(`已载入复核版本 ${review.version}；可继续修改后保存新版本。`);
  }, [initialFields, review, student, indicator]);

  const generate = async (provider: 'rule' | 'deepseek') => {
    if (drafting) return;
    setDrafting(true);
    try { await onDraft(provider, node); } finally { setDrafting(false); }
  };
  const save = async () => {
    if (saving || !draft) return;
    setSaving(true); setFailure('');
    const evidence_refs = [
      ...(fields.evidence_refs ?? []).filter(ref => ref.kind !== 'coverage'),
      ...(includeCoverage && coverageRef ? [coverageRef] : []),
    ];
    try { await onSave({ ...fields, evidence_refs }); } catch (reason) { setFailure(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  const activityDiffers = draft?.activity?.trim() && draft.activity.trim() !== draft.recommendation.trim();
  const hasTeachingDetails = Boolean(activityDiffers || draft?.steps?.length || draft?.material_ids.length || draft?.observation_point?.trim());

  return <Panel title="生成与复核" className="review-panel">
    <div className="review-tool-intro"><p>选择规则或模型生成待复核草稿。系统提供依据，教师确认后才形成复核结论。</p><span className="draft-status">{review ? `已有复核版本 ${review.version}` : draft ? '待教师复核' : '尚未生成草稿'}</span></div>
    <div className="review-generate-row"><div className="actions"><button disabled={drafting || saving || !node} onClick={() => void generate('rule')}>{drafting ? '正在生成草稿…' : '生成规则草稿'}</button><button className="secondary" disabled={drafting || saving || !node} onClick={() => void generate('deepseek')}>{drafting ? '正在生成草稿…' : '使用模型生成草稿'}</button></div>{source && <p className="review-source-note">{source}</p>}</div>
    {!node && <div className="review-empty"><strong>先选择一个测验节点</strong><p>建议只根据单一节点的可追溯记录生成；未选择时不会推断学习状态。</p></div>}
    {draft?.scope_required && <p className="scope-error" role="alert">范围错误：该指标在多个节点有记录，请明确选择单一测验节点后重新生成。当前草稿不可保存。</p>}
    {draft && !draft.scope_required && <div className="review-workspace">
      <EvidenceContext run={run} student={student} indicator={indicator} node={node} draft={draft} />
      <section className="review-editor" aria-label="教师复核草稿">
        {coverageRef && <section className="context-limit" aria-label="无记录覆盖证据"><strong>当前范围有 {coverageRef.scope.node_id} 节点覆盖证据，作答记录为 0 条。</strong><p>覆盖证据只能说明系统在该学生、指标和节点内没有作答记录；不代表缺席、未作答或零分。</p><label className="check-row"><input type="checkbox" checked={includeCoverage} onChange={event => setIncludeCoverage(event.target.checked)} />将此覆盖记录作为本次教师复核的证据引用</label></section>}
        <div className="draft-banner"><span>系统草稿</span><strong>{draft.source === 'rule' ? '规则生成' : '模型辅助生成'}</strong><small>未确认 · 请核对左侧证据和来源边界</small></div>
        <div className="draft-target"><span>教学对象与目标</span><p>{draft.objective || '草稿未提供目标。'}</p></div>
        <ResourceSelectionPanel draft={draft} />
        {hasTeachingDetails && <details className="proposed-activity"><summary>查看教学安排建议</summary>{activityDiffers && <p>{draft.activity}</p>}{draft.steps?.length ? <ol>{draft.steps.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol> : null}{draft.material_ids.length > 0 && <p>材料编号：{draft.material_ids.join('、')}</p>}{draft.observation_point && <p>观察点：{draft.observation_point}</p>}</details>}

        <section className="review-fields">
          <h3>教师复核内容</h3>
          <div className="review-edit-grid">
            <label>诊断<textarea value={fields.diagnosis} onChange={event => set('diagnosis', event.target.value)} /></label>
            <label>建议<textarea value={fields.recommendation} onChange={event => set('recommendation', event.target.value)} /></label>
            <label className="field-wide">后续调整条件<textarea value={fields.adjustment_condition} onChange={event => set('adjustment_condition', event.target.value)} /></label>
            <label>复核状态<select value={fields.status} onChange={event => { if (isReviewStatus(event.target.value)) set('status', event.target.value); }}><option value="accepted">接受</option><option value="edited">已修改</option><option value="needs_observation">待观察</option><option value="rejected">驳回</option></select></label>
            <label>复核人<input value={fields.reviewer} onChange={event => set('reviewer', event.target.value)} placeholder="填写实际执行复核的教师" /></label>
            <label className="field-wide">复核理由<textarea placeholder="说明接受、修改或驳回的依据" value={fields.reason} onChange={event => set('reason', event.target.value)} /></label>
          </div>
        </section>

        <details className="review-structured"><summary>编辑完整教学方案</summary><p className="muted">勾选后，材料、活动、练习和观察点随本次复核版本保存。只有来源已签核的材料可加入方案。</p>
          <label className="check-row"><input type="checkbox" disabled={Boolean(fields.teaching_plan_v2)} checked={fields.structured_plan !== null} onChange={event => setPlan(event.target.checked ? { material_ids: [], activity: draft.activity || '', steps: draft.steps || [], practice: [], observation_points: draft.observation_point ? [draft.observation_point] : [] } : null)} />保存旧版结构化方案</label>
          {fields.structured_plan && <><p>可选已核验材料：{verification?.status === 'verified' ? verification.material_ids.join('、') : '当前指标尚无有效签核'}</p>
            <fieldset><legend>材料选择</legend>{(verification?.status === 'verified' ? verification.material_ids : []).map(id => <label className="check-row" key={id}><input type="checkbox" checked={fields.structured_plan?.material_ids.includes(id) ?? false} onChange={event => setPlan({ ...fields.structured_plan!, material_ids: event.target.checked ? [...fields.structured_plan!.material_ids, id] : fields.structured_plan!.material_ids.filter(value => value !== id) })} />{id} · {run?.items.find(item => item['材料编号'] === id)?.['题干或内容'] || '已核验材料'}</label>)}</fieldset>
            <label>学习活动<textarea value={fields.structured_plan.activity} onChange={event => setPlan({ ...fields.structured_plan!, activity: event.target.value })} /></label>
            <label>活动步骤（每行一步）<textarea value={fields.structured_plan.steps.join('\n')} onChange={event => setPlan({ ...fields.structured_plan!, steps: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) })} /></label>
            <label>练习（每行一项）<textarea value={fields.structured_plan.practice.join('\n')} onChange={event => setPlan({ ...fields.structured_plan!, practice: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) })} /></label>
            <label>观察点（每行一项）<textarea value={fields.structured_plan.observation_points.join('\n')} onChange={event => setPlan({ ...fields.structured_plan!, observation_points: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) })} /></label>
          </>}
        </details>
        <TeachingPlanEditor
          preview={draft.teaching_plan_preview}
          previewError={draft.teaching_plan_preview_error}
          plan={fields.teaching_plan_v2}
          onChange={plan => {
            const next = { ...fields, teaching_plan_v2: plan, structured_plan: plan ? null : fields.structured_plan };
            setFields(next);
            onFieldsChange?.(next);
          }}
        />
        {failure && <p className="error" role="alert">{failure}</p>}
        <div className="review-save-bar"><p>{fields.teaching_plan_v2 ? '将保存教师复核和带来源版本、证据引用的 v2 教学方案。' : fields.structured_plan ? '将保存教师复核及旧版完整方案。' : '将保存教师复核字段和草稿引用。'}</p><button disabled={saving || drafting} onClick={() => void save()}>{saving ? '正在保存…' : '保存复核'}</button></div>
      </section>
    </div>}
    {history.length > 0 && <details className="review-history"><summary>查看复核历史（{history.length}）</summary>{history.map(item => <details className="row" key={`${item.version}:${item.updated_at}`}><summary>版本 {item.version} · 节点 {item.node_id ?? item.original_draft?.node_id ?? '范围未记录'} · {statusLabels[item.status]} · {item.updated_at}</summary><p>诊断：{item.diagnosis}</p><p>建议：{item.recommendation}</p><p>理由：{item.reason}</p>{item.teaching_plan_v2 && <section className="review-history-plan"><h4>v2 分层教学方案</h4><p>目标：{item.teaching_plan_v2.goal}</p><p>材料：{item.teaching_plan_v2.material_ids.join('、')} · 模板 {item.teaching_plan_v2.template_version}</p>{isTeachingPlanV2SourceCurrentlyVerified(item.teaching_plan_v2, indicator, verification) ? <p role="status">来源签核版本当前匹配；导出时会再次核验作答证据指纹。</p> : <p className="review-alert">来源签核已变化、撤销或无法核验；方案保留为历史版本，导出时不会作为有效方案。</p>}<ol>{item.teaching_plan_v2.steps.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol><h5>分层提示（教师复核版）</h5>{item.teaching_plan_v2.hints.map(hint => <div key={hint.level}><strong>{hintLabels[hint.level]}</strong><p>学生提示：{hint.student_prompt}</p><p>教师说明：{hint.teacher_note}</p></div>)}<p>观察：{item.teaching_plan_v2.observation_points.join('；')}</p><p>调整：{item.teaching_plan_v2.adjustment_conditions.join('；')}</p><small>证据：{item.teaching_plan_v2.evidence_refs.map(ref => `${ref.record_id} · 第 ${ref.source_line} 行`).join('、')}</small></section>}{item.structured_plan && <section className="review-history-plan"><h4>已保存的完整教学方案</h4><p>活动：{item.structured_plan.activity}</p><p>材料：{item.structured_plan.material_ids.join('、') || '无'}{Object.entries(item.source_verification_versions ?? {}).map(([sourceIndicator, version]) => ` · 来源签核版本 ${version}（${sourceIndicator}）`)}</p>{isStructuredPlanCurrentlyVerified(item, indicator, verification) ? <p role="status">本方案来源签核仍有效（版本 {verification?.version}）</p> : <p className="review-alert">来源签核已变化、撤销或无法核验；该方案仅作历史记录，导出时不会作为有效方案。</p>}{item.structured_plan.steps.length > 0 && <><strong>活动步骤</strong><ol>{item.structured_plan.steps.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol></>}{item.structured_plan.practice.length > 0 && <><strong>练习</strong><ul>{item.structured_plan.practice.map((practice, index) => <li key={`${index}:${practice}`}>{practice}</li>)}</ul></>}{item.structured_plan.observation_points.length > 0 && <><strong>观察点</strong><ul>{item.structured_plan.observation_points.map((point, index) => <li key={`${index}:${point}`}>{point}</li>)}</ul></>}</section>}<small>复核人：{item.reviewer || '未填写'} · 来源：{item.source === 'rule' ? '规则生成' : '模型辅助生成'} · 引用记录 {item.evidence_record_ids.join('、') || '无'}</small></details>)}</details>}
  </Panel>;
}
