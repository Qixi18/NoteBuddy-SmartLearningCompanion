import { useEffect, useState } from 'react';
import { learningApi, isReviewStatus } from '../../../api/client';
import type { AnalysisRun, Draft, Review, ReviewStatus, SourceVerification, StructuredPlan } from '../../../api/types';
import { Panel } from '../../../components/Panel';
type ReviewFields = { status: ReviewStatus; diagnosis: string; recommendation: string; adjustment_condition: string; reason: string; reviewer: string; structured_plan: StructuredPlan | null };
const emptyFields: ReviewFields = { status: 'accepted', diagnosis: '', recommendation: '', adjustment_condition: '', reason: '', reviewer: '', structured_plan: null };
export function ReviewPanel({ run, student, indicator, node, review, draft, onDraft, onSave, initialFields, onFieldsChange }: { run?: AnalysisRun; student: string; indicator: string; node: string; review?: Review; draft: Draft | null; onDraft: (provider: 'rule' | 'deepseek', node: string) => Promise<void>; onSave: (payload: ReviewFields) => Promise<void>; initialFields?: ReviewFields; onFieldsChange?: (fields: ReviewFields) => void }) {
  const [fields, setFields] = useState<ReviewFields>(initialFields ?? emptyFields);
  const [verification, setVerification] = useState<SourceVerification | null>(null);
  const [source, setSource] = useState(''); const [history, setHistory] = useState<Review[]>([]); const [failure, setFailure] = useState(''); const [drafting, setDrafting] = useState(false); const [saving, setSaving] = useState(false);
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
    setFailure('');
    let alive = true;
    learningApi.reviewHistory(`${student}:${indicator}`).then(next => { if (alive) setHistory(next); }).catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [student, indicator, review]);
  useEffect(() => {
    if (!draft) { setSource(''); return; }
    if (!initialFields) {
      const next = { ...fields, diagnosis: draft.diagnosis, recommendation: draft.recommendation, adjustment_condition: draft.adjustment_condition };
      setFields(next);
      onFieldsChange?.(next);
    }
    setSource(`草稿来源：${draft.source}；引用记录：${draft.evidence_record_ids.join('、') || '无有效记录'}`);
  // Draft identity changes only when the selected workbench scope changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  useEffect(() => {
    if (initialFields) { setFields(initialFields); return; }
    if (!review) { setFields(emptyFields); setSource(''); return; }
    setFields({ status: review.status, diagnosis: review.diagnosis, recommendation: review.recommendation, adjustment_condition: review.adjustment_condition || '', reason: review.reason, reviewer: review.reviewer, structured_plan: review.structured_plan ?? null });
    setSource(`已载入复核版本 ${review.version}；可继续修改后保存新版本。`);
  }, [initialFields, review, student, indicator]);
  const generate = async (provider: 'rule' | 'deepseek') => {
    if (drafting) return;
    setDrafting(true);
    try { await onDraft(provider, node); } finally { setDrafting(false); }
  };
  const save = async () => {
    if (saving) return;
    setSaving(true); setFailure('');
    try { await onSave(fields); } catch (reason) { setFailure(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  const activityDiffersFromRecommendation = draft?.activity?.trim() && draft.activity.trim() !== draft.recommendation.trim();
  return <Panel title="诊断与教学建议复核"><p className="muted">规则与 AI 结果均为待复核草稿。核对原始作答和材料后保存复核结论。</p>
    {!node && <p className="warn">请先在上方选择单一测验节点。</p>}
    <div className="actions"><button disabled={drafting || saving || !node} onClick={() => void generate('rule')}>{drafting ? '正在生成草稿…' : '生成规则草稿'}</button><button className="secondary" disabled={drafting || saving || !node} onClick={() => void generate('deepseek')}>{drafting ? '正在生成草稿…' : '使用模型生成草稿'}</button></div><p className="muted">{source}</p>
    {draft?.scope_required && <p className="scope-error" role="alert">范围错误：该指标在多个节点有记录，请明确选择单一测验节点后重新生成。当前草稿不可保存。</p>}
    {draft && !draft.scope_required && <>
      <section className="draft-content" aria-label="只读教学方案草稿">
        <div className="draft-section"><h3>教学对象与目标</h3><p>{draft.objective || '草稿未提供目标。'}</p></div>
        {draft.observed_fact && <div className="draft-section"><h3>观察事实</h3><p>{draft.observed_fact}</p></div>}
        <div className="draft-section draft-recommendation"><h3>诊断与建议 <span>只读草稿</span></h3><p>{draft.diagnosis}</p><p>{draft.recommendation}</p></div>
        {(activityDiffersFromRecommendation || draft.steps?.length || draft.material_ids.length || draft.observation_point) && <div className="draft-section"><h3>教学安排</h3>
          {activityDiffersFromRecommendation && <p>{draft.activity}</p>}
          {draft.steps?.length ? <><h4>活动步骤</h4><ol>{draft.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></> : null}
          {draft.material_ids.length > 0 && <p>材料编号：{draft.material_ids.join('、')}。材料选择理由字段尚未提供。</p>}
          {draft.observation_point && <p>观察点：{draft.observation_point}</p>}
        </div>}
        <details className="draft-evidence"><summary>证据来源与适用边界</summary>
          <p>证据记录：{draft.evidence_record_ids.join('、') || '无有效记录'}；原始来源行：{draft.evidence_source_lines?.join('、') || '未提供'}</p>
          {draft.score_points_to_review.length > 0 && <p>待核验评分点：{draft.score_points_to_review.join('、')}</p>}
          {draft.source_locator && <p>来源定位：{draft.source_locator}</p>}
          {draft.rule_id && <p>规则：{draft.rule_id} · 证据类型：{draft.evidence_kind || '未分类'}</p>}
          {draft.inference_limit && <p>适用边界：{draft.inference_limit}</p>}
          {draft.unknown_reason && <p className="warn">未决原因：{draft.unknown_reason}</p>}
        </details>
        <p className="muted">草稿保持只读；需要调整材料、步骤、练习或观察点时，在下方完整方案中编辑并随复核版本保存。</p>
      </section>
      <div className="review-fields"><h3>可持久化的教师复核字段</h3>
        <label>诊断<textarea value={fields.diagnosis} onChange={event => set('diagnosis', event.target.value)} /></label>
        <label>建议<textarea value={fields.recommendation} onChange={event => set('recommendation', event.target.value)} /></label>
        <label>后续调整条件<textarea value={fields.adjustment_condition} onChange={event => set('adjustment_condition', event.target.value)} /></label>
        <label>复核状态<select value={fields.status} onChange={event => { if (isReviewStatus(event.target.value)) set('status', event.target.value); }}><option value="accepted">接受</option><option value="edited">已修改</option><option value="needs_observation">待观察</option><option value="rejected">驳回</option></select></label>
        <label>复核理由<textarea placeholder="记录接受、修改或驳回的依据" value={fields.reason} onChange={event => set('reason', event.target.value)} /></label>
        <label>复核人<input value={fields.reviewer} onChange={event => set('reviewer', event.target.value)} placeholder="填写实际执行复核的教师" /></label>
        <section className="source-detail"><h3>完整结构化方案</h3><p className="muted">勾选后，材料、活动、练习和观察点随本次复核版本保存。材料必须先在学科知识页面完成指标来源签核。</p><label className="check-row"><input type="checkbox" checked={fields.structured_plan !== null} onChange={event => setPlan(event.target.checked ? { material_ids: [], activity: draft.activity || '', steps: draft.steps || [], practice: [], observation_points: draft.observation_point ? [draft.observation_point] : [] } : null)} />保存完整方案</label>
          {fields.structured_plan && <><p>可选已核验材料：{verification?.status === 'verified' ? verification.material_ids.join('、') : '当前指标尚无有效签核'}</p>
            <fieldset><legend>材料选择</legend>{(verification?.status === 'verified' ? verification.material_ids : []).map(id => <label className="check-row" key={id}><input type="checkbox" checked={fields.structured_plan?.material_ids.includes(id) ?? false} onChange={event => setPlan({ ...fields.structured_plan!, material_ids: event.target.checked ? [...fields.structured_plan!.material_ids, id] : fields.structured_plan!.material_ids.filter(value => value !== id) })} />{id} · {run?.items.find(item => item['材料编号'] === id)?.['题干或内容'] || '已核验材料'}</label>)}</fieldset>
            <label>学习活动<textarea value={fields.structured_plan.activity} onChange={event => setPlan({ ...fields.structured_plan!, activity: event.target.value })} /></label>
            <label>活动步骤（每行一步）<textarea value={fields.structured_plan.steps.join('\n')} onChange={event => setPlan({ ...fields.structured_plan!, steps: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) })} /></label>
            <label>练习（每行一项）<textarea value={fields.structured_plan.practice.join('\n')} onChange={event => setPlan({ ...fields.structured_plan!, practice: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) })} /></label>
            <label>观察点（每行一项）<textarea value={fields.structured_plan.observation_points.join('\n')} onChange={event => setPlan({ ...fields.structured_plan!, observation_points: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) })} /></label>
          </>}
        </section>
        {failure && <p className="error" role="alert">{failure}</p>}<button disabled={saving || drafting} onClick={() => void save()}>{saving ? '正在保存…' : '保存复核'}</button>
      </div>
    </>}
    {history.length > 0 && <><h3>复核历史</h3>{history.map(item => <details className="row" key={item.version}><summary>版本 {item.version} · 节点 {item.node_id ?? item.original_draft?.node_id ?? '范围未记录'} · {item.status} · {item.updated_at}</summary><p>诊断：{item.diagnosis}</p><p>建议：{item.recommendation}</p><p>理由：{item.reason}</p>{item.structured_plan && <p>完整方案：材料 {item.structured_plan.material_ids.join('、')}；活动 {item.structured_plan.activity}；步骤 {item.structured_plan.steps.join('、')}；练习 {item.structured_plan.practice.join('、')}；观察点 {item.structured_plan.observation_points.join('、')}。</p>}{item.original_draft && <p>原草稿（{item.original_draft.source}；节点 {item.original_draft.node_id ?? '范围未记录'}）：{item.original_draft.recommendation}</p>}</details>)}</>}
  </Panel>;
}
