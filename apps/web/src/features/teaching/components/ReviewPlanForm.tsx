import { useMemo, useState, type FormEvent } from 'react';
import { Check, Pencil, RotateCcw } from 'lucide-react';
import { Notice } from '../../../components/PageBits';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

const labels: Record<string, string> = { direction: '方向提示', structure: '结构提示', local_check: '局部检查' };
const lines = (value: string) => value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
const text = (value: unknown) => Array.isArray(value) ? value.join('\n') : '';

export function ReviewPlanForm({ plan, disabled, onSave, onOtherDecision }: {
  plan: Row;
  disabled: boolean;
  onSave: (status: 'accepted' | 'edited', plan: Row, reviewer: string, reason: string) => void;
  onOtherDecision: (status: 'rejected' | 'needs_observation', reviewer: string, reason: string) => void;
}) {
  const original = useMemo(() => JSON.stringify(plan), [plan]);
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState(String(plan.goal ?? ''));
  const [steps, setSteps] = useState(text(plan.steps));
  const [observations, setObservations] = useState(text(plan.observation_points));
  const [conditions, setConditions] = useState(text(plan.adjustment_conditions));
  const initialHints = Array.isArray(plan.hints) ? plan.hints as Row[] : [];
  const [hints, setHints] = useState(initialHints.map(item => ({ ...item })));
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const current = { ...plan, goal: goal.trim(), steps: lines(steps), observation_points: lines(observations), adjustment_conditions: lines(conditions), hints };
  const changed = JSON.stringify(current) !== original;
  const complete = Boolean(current.goal && current.steps.length && current.observation_points.length && current.adjustment_conditions.length && hints.length === 3 && hints.every(item => String(item.student_prompt ?? '').trim() && String(item.teacher_note ?? '').trim()) && reviewer.trim() && reason.trim());
  const setHint = (index: number, field: string, value: string) => setHints(currentHints => currentHints.map((hint, idx) => idx === index ? { ...hint, [field]: value } : hint));
  const save = (event: FormEvent) => { event.preventDefault(); onSave(changed ? 'edited' : 'accepted', current, reviewer.trim(), reason.trim()); };
  const decide = (status: 'rejected' | 'needs_observation') => onOtherDecision(status, reviewer.trim() || '教师', reason.trim() || '教师核对后作出此决定。');
  return <form className={styles.reviewPlanForm} onSubmit={save}>
    <div className={styles.reviewPlanHeading}><strong>个性化学习方案 · V2</strong><button type="button" onClick={() => setEditing(value => !value)} disabled={disabled}><Pencil size={14}/>{editing ? '返回预览' : '编辑方案'}</button></div>
    <p><b>适用范围：</b>{String((plan.scope as Row | undefined)?.student_id ?? '—')} · {String((plan.scope as Row | undefined)?.indicator_id ?? '—')} · {String((plan.scope as Row | undefined)?.node_id ?? '—')}　<span>目的：{String(plan.purpose ?? '—')} · 模板 {String(plan.template_version ?? '—')}</span></p>
    {editing ? <>
      <label>学习目标<textarea required rows={2} value={goal} onChange={event => setGoal(event.target.value)}/></label>
      <label>活动步骤<textarea required rows={4} value={steps} onChange={event => setSteps(event.target.value)} placeholder="每行一项"/></label>
      <div className={styles.reviewPlanColumns}><label>观察点<textarea required rows={3} value={observations} onChange={event => setObservations(event.target.value)}/></label><label>调整条件<textarea required rows={3} value={conditions} onChange={event => setConditions(event.target.value)}/></label></div>
      <div className={styles.planHintEditor}>{hints.map((hint, index) => <fieldset key={String(hint.level ?? index)}><legend>{labels[String(hint.level)] ?? '分级提示'}</legend><label>学生提示<textarea required rows={2} value={String(hint.student_prompt ?? '')} onChange={event => setHint(index, 'student_prompt', event.target.value)}/></label><label>教师观察说明<textarea rows={2} value={String(hint.teacher_note ?? '')} onChange={event => setHint(index, 'teacher_note', event.target.value)}/></label></fieldset>)}</div>
    </> : <>
      <article className={styles.planPreview}><h4>{goal}</h4><strong>步骤</strong><ol>{lines(steps).map((step, i) => <li key={i}>{step}</li>)}</ol><strong>分级提示</strong>{hints.map((hint, i) => <p key={i}><b>{labels[String(hint.level)]}：</b>{String(hint.student_prompt ?? '')}</p>)}<div className={styles.reviewPlanColumns}><div><strong>观察点</strong><ul>{lines(observations).map((item, i) => <li key={i}>{item}</li>)}</ul></div><div><strong>调整条件</strong><ul>{lines(conditions).map((item, i) => <li key={i}>{item}</li>)}</ul></div></div></article>
      <section className={styles.planResources}><strong>材料与选择理由</strong>{Array.isArray(plan.resource_reasons) && plan.resource_reasons.length ? (plan.resource_reasons as Row[]).map(item => <p key={String(item.material_id)}><b>{String(item.material_id)}</b> · {String(item.resource_type)}：{String(item.explanation)}{Array.isArray(item.reason_codes) && item.reason_codes.length ? `（${item.reason_codes.join('、')}）` : ''}</p>) : <p>此诊断方案依据当前节点覆盖证据，不把未观察材料当作作答。</p>}</section>
    </>}
    <div className={styles.reviewPlanColumns}><label>复核教师<input required maxLength={200} value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="教师姓名"/></label><label>复核理由<input required maxLength={4000} value={reason} onChange={event => setReason(event.target.value)} placeholder="说明方案与证据的对应关系"/></label></div>
    <div className={styles.reviewActions}><button className={styles.acceptButton} type="submit" disabled={disabled || !complete}><Check size={14}/>{changed ? '保存修改并接受' : '接受方案'}</button><button type="button" onClick={() => decide('needs_observation')} disabled={disabled}>继续观察</button><button className={styles.rejectButton} type="button" onClick={() => decide('rejected')} disabled={disabled}><RotateCcw size={14}/>拒绝方案</button></div>
    {!complete && <Notice tone="warning">接受或修改前，请补齐教师、复核理由、三级提示、步骤、观察点和调整条件。</Notice>}
  </form>;
}
