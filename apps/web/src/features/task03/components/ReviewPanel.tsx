import { useEffect, useState } from 'react';
import { learningApi, isReviewStatus } from '../../../api/client';
import type { Draft, Review, ReviewStatus } from '../../../api/types';
import { Panel } from '../../../components/Panel';
type ReviewFields = { status: ReviewStatus; diagnosis: string; recommendation: string; adjustment_condition: string; reason: string };
export function ReviewPanel({ student, indicator, node, nodes, onNode, review, draft, onDraft, onSave, initialFields, onFieldsChange }: { student: string; indicator: string; node: string; nodes: string[]; onNode: (node: string) => void; review?: Review; draft: Draft | null; onDraft: (provider: 'rule' | 'deepseek', node: string) => Promise<void>; onSave: (payload: ReviewFields) => Promise<void>; initialFields?: ReviewFields; onFieldsChange?: (fields: ReviewFields) => void }) {
  const [fields, setFields] = useState<ReviewFields>(initialFields ?? { status: 'accepted', diagnosis: '', recommendation: '', adjustment_condition: '', reason: '' });
  const [source, setSource] = useState(''); const [history, setHistory] = useState<Review[]>([]); const [failure, setFailure] = useState(''); const [drafting, setDrafting] = useState(false); const [saving, setSaving] = useState(false);
  const set = (name: keyof ReviewFields, value: string) => {
    const next = { ...fields, [name]: value };
    setFields(next);
    onFieldsChange?.(next);
  };
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
    if (!review) { setFields({ status: 'accepted', diagnosis: '', recommendation: '', adjustment_condition: '', reason: '' }); setSource(''); return; }
    setFields({ status: review.status, diagnosis: review.diagnosis, recommendation: review.recommendation, adjustment_condition: review.adjustment_condition || '', reason: review.reason });
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
  return <Panel title="诊断与教学建议复核"><p className="muted">规则与 AI 结果均为待复核草稿。核对原始作答和材料后保存复核结论。</p>
    <label>测验节点<select value={node} onChange={event => onNode(event.target.value)}><option value="">自动（仅单节点可判断）</option>{nodes.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
    <div className="actions"><button disabled={drafting || saving} onClick={() => void generate('rule')}>{drafting ? '正在生成草稿…' : '生成规则草稿'}</button><button className="secondary" disabled={drafting || saving} onClick={() => void generate('deepseek')}>{drafting ? '正在生成草稿…' : '使用 DeepSeek 生成草稿'}</button></div><p className="muted">{source}</p>
    {draft?.scope_required && <p className="scope-error" role="alert">范围错误：该指标在多个节点有记录，请明确选择单一测验节点后重新生成。当前草稿不可保存。</p>}
    {draft && !draft.scope_required && <>
      <section className="draft-content" aria-label="只读教学方案草稿">
        <h3>教学对象与目标</h3><p>{draft.objective || '草稿未提供目标。'}</p>
        {draft.observed_fact && <><h3>观察事实</h3><p>{draft.observed_fact}</p></>}
        <h3>诊断与建议（只读草稿）</h3><p>{draft.diagnosis}</p><p>{draft.recommendation}</p>
        {draft.activity && <><h3>学习活动</h3><p>{draft.activity}</p></>}
        {draft.steps?.length ? <><h3>活动步骤（按草稿顺序）</h3><ol>{draft.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></> : null}
        {draft.material_ids.length > 0 && <p>材料编号：{draft.material_ids.join('、')}。材料选择理由字段尚未提供。</p>}
        {draft.observation_point && <p>观察点：{draft.observation_point}</p>}
        {draft.score_points_to_review.length > 0 && <p>待核验评分点：{draft.score_points_to_review.join('、')}</p>}
        {draft.source_locator && <p>来源定位：{draft.source_locator}</p>}
        <p>证据记录：{draft.evidence_record_ids.join('、') || '无有效记录'}；原始来源行：{draft.evidence_source_lines?.join('、') || '未提供'}</p>
        {draft.rule_id && <p>规则：{draft.rule_id} · 证据类型：{draft.evidence_kind || '未分类'}</p>}
        {draft.inference_limit && <p>适用边界：{draft.inference_limit}</p>}
        {draft.unknown_reason && <p className="warn">未决原因：{draft.unknown_reason}</p>}
        <p className="muted">结构化草稿字段只读；后端尚不支持保存对材料、活动步骤、观察点或评分点的单独修改。</p>
      </section>
      <div className="review-fields"><h3>可持久化的教师复核字段</h3>
        <label>诊断<textarea value={fields.diagnosis} onChange={event => set('diagnosis', event.target.value)} /></label>
        <label>建议<textarea value={fields.recommendation} onChange={event => set('recommendation', event.target.value)} /></label>
        <label>后续调整条件<textarea value={fields.adjustment_condition} onChange={event => set('adjustment_condition', event.target.value)} /></label>
        <label>复核状态<select value={fields.status} onChange={event => { if (isReviewStatus(event.target.value)) set('status', event.target.value); }}><option value="accepted">接受</option><option value="edited">已修改</option><option value="needs_observation">待观察</option><option value="rejected">驳回</option></select></label>
        <label>复核理由<textarea placeholder="记录接受、修改或驳回的依据" value={fields.reason} onChange={event => set('reason', event.target.value)} /></label>
        {failure && <p className="error" role="alert">{failure}</p>}<button disabled={saving || drafting} onClick={() => void save()}>{saving ? '正在保存…' : '保存复核'}</button>
      </div>
    </>}
    {history.length > 0 && <><h3>复核历史</h3>{history.map(item => <details className="row" key={item.version}><summary>版本 {item.version} · 节点 {item.node_id ?? item.original_draft?.node_id ?? '范围未记录'} · {item.status} · {item.updated_at}</summary><p>诊断：{item.diagnosis}</p><p>建议：{item.recommendation}</p><p>理由：{item.reason}</p>{item.original_draft && <p>原草稿（{item.original_draft.source}；节点 {item.original_draft.node_id ?? '范围未记录'}）：{item.original_draft.recommendation}</p>}</details>)}</>}
  </Panel>;
}
