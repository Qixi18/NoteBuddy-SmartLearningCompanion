import { useEffect, useState } from 'react';
import { learningApi, isReviewStatus } from '../../../api/client';
import type { Draft, Review, ReviewStatus } from '../../../api/types';
import { Panel } from '../../../components/Panel';
type ReviewFields = { status: ReviewStatus; diagnosis: string; recommendation: string; adjustment_condition: string; reason: string };
export function ReviewPanel({ student, indicator, node, nodes, onNode, review, draft, onDraft, onSave }: { student: string; indicator: string; node: string; nodes: string[]; onNode: (node: string) => void; review?: Review; draft: Draft | null; onDraft: (provider: 'rule' | 'deepseek', node: string) => Promise<void>; onSave: (payload: ReviewFields) => Promise<void> }) {
  const [fields, setFields] = useState<ReviewFields>({ status: 'accepted', diagnosis: '', recommendation: '', adjustment_condition: '', reason: '' });
  const [source, setSource] = useState(''); const [history, setHistory] = useState<Review[]>([]); const [failure, setFailure] = useState('');
  const set = (name: keyof ReviewFields, value: string) => setFields(old => ({ ...old, [name]: value }));
  useEffect(() => {
    setFailure('');
    let alive = true;
    learningApi.reviewHistory(`${student}:${indicator}`).then(next => { if (alive) setHistory(next); }).catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [student, indicator, review]);
  useEffect(() => { if (!draft) { setSource(''); return; } setFields(old => ({ ...old, diagnosis: draft.diagnosis, recommendation: draft.recommendation, adjustment_condition: draft.adjustment_condition })); setSource(`草稿来源：${draft.source}；引用记录：${draft.evidence_record_ids.join('、') || '无有效记录'}`); }, [draft]);
  useEffect(() => { if (!review) { setFields({ status: 'accepted', diagnosis: '', recommendation: '', adjustment_condition: '', reason: '' }); setSource(''); return; } setFields({ status: review.status, diagnosis: review.diagnosis, recommendation: review.recommendation, adjustment_condition: review.adjustment_condition || '', reason: review.reason }); setSource(`已载入复核版本 ${review.version}；可继续修改后保存新版本。`); }, [review, student, indicator]);
  const save = async () => { setFailure(''); try { await onSave(fields); } catch (reason) { setFailure(reason instanceof Error ? reason.message : String(reason)); } };
  return <Panel title="诊断与教学建议复核"><p className="muted">AI 输出仅作草稿。核对原始作答和材料后保存复核结论。</p>
    <label>测验节点<select value={node} onChange={event => onNode(event.target.value)}><option value="">自动（仅单节点可判断）</option>{nodes.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
    <div className="actions"><button onClick={() => void onDraft('rule', node)}>生成规则草稿</button><button className="secondary" onClick={() => void onDraft('deepseek', node)}>使用 DeepSeek 生成草稿</button></div><p className="muted">{source}</p>
    {draft?.scope_required && <p className="warn" role="status">该指标在多个节点有记录，请先选择测验节点后重新生成草稿。</p>}
    {draft && <details className="row"><summary>查看规则、证据与适用边界</summary>
      {draft.rule_id && <p>规则：{draft.rule_id} · 证据类型：{draft.evidence_kind || '未分类'}</p>}
      {draft.observed_fact && <p>观察事实：{draft.observed_fact}</p>}
      {draft.inference_limit && <p>适用边界：{draft.inference_limit}</p>}
      {draft.unknown_reason && <p className="warn">未决原因：{draft.unknown_reason}</p>}
      <p>证据记录：{draft.evidence_record_ids.join('、') || '无'}；来源行：{draft.evidence_source_lines?.join('、') || '未提供'}</p>
      {draft.steps?.length ? <ol>{draft.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol> : null}
      {draft.source_locator && <p>已核验来源定位：{draft.source_locator}</p>}
    </details>}
    <label>诊断<textarea value={fields.diagnosis} onChange={event => set('diagnosis', event.target.value)} /></label>
    <label>建议<textarea value={fields.recommendation} onChange={event => set('recommendation', event.target.value)} /></label>
    <label>后续调整条件<textarea value={fields.adjustment_condition} onChange={event => set('adjustment_condition', event.target.value)} /></label>
    <label>复核状态<select value={fields.status} onChange={event => { if (isReviewStatus(event.target.value)) set('status', event.target.value); }}><option value="accepted">接受</option><option value="edited">已修改</option><option value="needs_observation">待观察</option><option value="rejected">驳回</option></select></label>
    <label>复核理由<textarea placeholder="记录接受、修改或驳回的依据" value={fields.reason} onChange={event => set('reason', event.target.value)} /></label>
    {failure && <p className="error" role="alert">{failure}</p>}<button disabled={!draft || draft.scope_required} onClick={() => void save()}>保存复核</button>
    {history.length > 0 && <><h3>复核历史</h3>{history.map(item => <details className="row" key={item.version}><summary>版本 {item.version} · {item.status} · {item.updated_at}</summary><p>诊断：{item.diagnosis}</p><p>建议：{item.recommendation}</p><p>理由：{item.reason}</p>{item.original_draft && <p>原草稿（{item.original_draft.source}）：{item.original_draft.recommendation}</p>}</details>)}</>}
  </Panel>;
}
