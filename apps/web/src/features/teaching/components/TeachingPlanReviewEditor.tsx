import { useMemo, useState, type FormEvent } from 'react';
import { Check, ClipboardCheck, Eye, Pencil, RotateCcw, ShieldCheck } from 'lucide-react';
import { Notice } from '../../../components/PageBits';
import type { ResourceSelection, ResourceSelectionEntry, TeachingPlanV2 } from '../types';
import { HINT_LEVEL_LABELS, isCoveragePlan } from '../types';
import styles from '../pages/StudentTeachingPage.module.css';

const splitLines = (value: string) => value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
const joinLines = (value: string[] | undefined) => (value ?? []).join('\n');

/**
 * V2 方案审核编辑器：默认只读预览，点"编辑方案"才出现可编辑字段。
 * 可改学习目标、步骤、推荐材料、三级提示、观察点与调整条件；
 * 学生/指标/节点/运行、证据指纹、来源签核版本属于后端校验范围，不在前端修改。
 */
export function TeachingPlanReviewEditor({ plan, selection, disabled, canAccept, blocker, onSave, onOtherDecision }: {
  plan: TeachingPlanV2;
  selection?: ResourceSelection | null;
  disabled: boolean;
  canAccept: boolean;
  blocker?: string;
  onSave: (status: 'accepted' | 'edited', plan: TeachingPlanV2, reviewer: string, reason: string) => void;
  onOtherDecision: (status: 'rejected' | 'needs_observation', reviewer: string, reason: string) => void;
}) {
  const coverage = isCoveragePlan(plan);
  const entries = useMemo(() => {
    const map = new Map<string, ResourceSelectionEntry>();
    for (const entry of [...(selection?.practice_items ?? []), ...(selection?.learning_resources ?? [])]) map.set(entry.material_id, entry);
    return map;
  }, [selection]);
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState(plan.goal);
  const [steps, setSteps] = useState(joinLines(plan.steps));
  const [observations, setObservations] = useState(joinLines(plan.observation_points));
  const [conditions, setConditions] = useState(joinLines(plan.adjustment_conditions));
  const [hints, setHints] = useState(plan.hints.map(hint => ({ ...hint })));
  const [materials, setMaterials] = useState<string[]>(plan.material_ids);
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');

  const candidateIds = useMemo(() => {
    const ids = new Set<string>(plan.material_ids);
    for (const entry of [...(selection?.practice_items ?? []), ...(selection?.learning_resources ?? [])]) ids.add(entry.material_id);
    return [...ids];
  }, [plan.material_ids, selection]);

  const reasonFor = (materialId: string): { resource_type: string; reason_codes: string[]; explanation: string } => {
    const existing = plan.resource_reasons.find(item => item.material_id === materialId);
    if (existing) return { resource_type: existing.resource_type, reason_codes: existing.reason_codes, explanation: existing.explanation };
    const entry = entries.get(materialId);
    return {
      resource_type: entry?.resource_type || '材料',
      reason_codes: entry?.reason_codes?.length ? entry.reason_codes : ['teacher_selected'],
      explanation: entry?.reason || '教师在本页选择该材料。',
    };
  };

  const nextPlan: TeachingPlanV2 = {
    ...plan,
    goal: goal.trim(),
    steps: splitLines(steps),
    observation_points: splitLines(observations),
    adjustment_conditions: splitLines(conditions),
    hints,
    material_ids: materials,
    resource_reasons: materials.map(materialId => ({ material_id: materialId, ...reasonFor(materialId) })),
  };
  const changed = JSON.stringify(nextPlan) !== JSON.stringify(plan);
  const hasQuestion = nextPlan.material_ids.some(materialId => reasonFor(materialId).resource_type === '题目');
  const hintsComplete = hints.length === 3 && hints.every(hint => hint.student_prompt.trim());
  const materialsComplete = coverage ? true : nextPlan.material_ids.length > 0 && hasQuestion;
  const formComplete = Boolean(
    nextPlan.goal
    && nextPlan.steps.length
    && nextPlan.observation_points.length
    && nextPlan.adjustment_conditions.length
    && hintsComplete
    && materialsComplete
    && reviewer.trim()
    && reason.trim(),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!formComplete || !canAccept) return;
    onSave(changed ? 'edited' : 'accepted', nextPlan, reviewer.trim(), reason.trim());
  };
  const decide = (status: 'rejected' | 'needs_observation') => {
    if (disabled || !reviewer.trim() || !reason.trim()) return;
    onOtherDecision(status, reviewer.trim(), reason.trim());
  };
  const toggleMaterial = (materialId: string) => {
    setMaterials(current => current.includes(materialId) ? current.filter(id => id !== materialId) : [...current, materialId]);
  };
  const setHint = (index: number, field: 'student_prompt' | 'teacher_note', value: string) => {
    setHints(current => current.map((hint, idx) => idx === index ? { ...hint, [field]: value } : hint));
  };

  return <form className={styles.editor} onSubmit={submit} data-testid="teaching-plan-review-editor">
    <div className={styles.editorHeader}>
      <h3>个性化学习方案 · V2</h3>
      <div className={styles.editorActions}>
        <span className={styles.editorMode}><ShieldCheck size={13}/>教师审核后生效</span>
        <button type="button" onClick={() => setEditing(value => !value)}>
          {editing ? <><Eye size={14}/>返回预览</> : <><Pencil size={14}/>编辑方案</>}
        </button>
      </div>
    </div>

    <details className={styles.reviewDetails}>
      <summary>查看方案范围与证据版本</summary>
    <div className={styles.editorFacts}>
      <div className={styles.editorFact}><span>学生</span><b>{plan.scope.student_id}</b></div>
      <div className={styles.editorFact}><span>观察指标</span><b>{plan.scope.indicator_id}</b></div>
      <div className={styles.editorFact}><span>测验节点</span><b>{plan.scope.node_id}</b></div>
      <div className={styles.editorFact}><span>分析运行</span><b>{plan.scope.run_id.slice(0, 8)}…</b></div>
      <div className={styles.editorFact}><span>证据指纹</span><b>{plan.evidence_fingerprint.slice(0, 16)}…</b></div>
      <div className={styles.editorFact}><span>来源签核版本</span><b>{Object.entries(plan.source_versions).map(([id, version]) => `${id} v${version}`).join('、') || '未记录'}</b></div>
      <div className={styles.editorFact}><span>证据来源</span><b>{coverage ? '当前范围覆盖证据' : `${plan.evidence_refs.filter(ref => ref.kind === 'response').length} 条作答记录`}</b></div>
      <div className={styles.editorFact}><span>模板版本</span><b>{plan.template_version}</b></div>
    </div>
    <p className={styles.readonlyNote}>学生、指标、节点、运行、证据指纹与来源签核版本由后端校验，前端只允许回传，不允许在这里修改。</p>
    </details>

    {editing ? <>
      <label className={styles.editorField}><span>学习目标</span>
        <textarea required rows={2} aria-label="学习目标" value={goal} onChange={event => setGoal(event.target.value)}/>
      </label>
      <label className={styles.editorField}><span>学习步骤（每行一项）</span>
        <textarea required rows={4} aria-label="学习步骤" value={steps} onChange={event => setSteps(event.target.value)}/>
      </label>
      <div className={styles.editorBlock}>
        <span>推荐材料</span>
        <div className={styles.materialPicker}>
          {candidateIds.map(materialId => {
            const entry = entries.get(materialId);
            const checked = materials.includes(materialId);
            return <label key={materialId} className={styles.materialOption}>
              <input type="checkbox" checked={checked} onChange={() => toggleMaterial(materialId)}/>
              <span><b>{materialId}</b> · {entry?.resource_type || reasonFor(materialId).resource_type}{entry?.title ? ` · ${entry.title}` : ''}</span>
            </label>;
          })}
        </div>
        {!materialsComplete && <Notice tone="warning">未使用覆盖证据的方案必须保留至少一道已核验练习题。</Notice>}
      </div>
      <div className={styles.hintEditor}>{hints.map((hint, index) => <fieldset key={hint.level}>
        <legend>{HINT_LEVEL_LABELS[hint.level] ?? hint.level}</legend>
        <label className={styles.editorField}><span>学生提示</span>
          <textarea required rows={2} aria-label="学生提示" value={hint.student_prompt} onChange={event => setHint(index, 'student_prompt', event.target.value)}/>
        </label>
        <label className={styles.editorField}><span>教师观察说明</span>
          <textarea rows={2} aria-label="教师观察说明" value={hint.teacher_note ?? ''} onChange={event => setHint(index, 'teacher_note', event.target.value)}/>
        </label>
      </fieldset>)}</div>
      <div className={styles.editorRow2}>
        <label className={styles.editorField}><span>观察点（每行一项）</span>
          <textarea required rows={3} aria-label="观察点" value={observations} onChange={event => setObservations(event.target.value)}/>
        </label>
        <label className={styles.editorField}><span>调整条件（每行一项）</span>
          <textarea required rows={3} aria-label="调整条件" value={conditions} onChange={event => setConditions(event.target.value)}/>
        </label>
      </div>
    </> : <details className={styles.reviewDetails}>
      <summary>展开完整方案内容，核对目标、步骤和调整条件</summary>
      <div className={styles.editorBlock}><span>学习目标</span><p>{plan.goal}</p></div>
      <div className={styles.editorBlock}><span>学习步骤</span><ol>{plan.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></div>
      <div className={styles.editorBlock}><span>推荐材料与理由</span>
        {plan.resource_reasons.length ? <ul>{plan.resource_reasons.map(item => <li key={item.material_id}>
          <b>{item.material_id}</b> · {item.resource_type}：{item.explanation}
        </li>)}</ul> : <p>此诊断方案依据当前节点覆盖证据，不把未观察材料当作学生已完成的作答。</p>}
      </div>
      <div className={styles.editorBlock}><span>三级提示</span>
        {plan.hints.map(hint => <div key={hint.level}>
          <b>{HINT_LEVEL_LABELS[hint.level] ?? hint.level}：</b>{hint.student_prompt}
          {hint.teacher_note ? <p className={styles.readonlyNote}>教师观察说明：{hint.teacher_note}</p> : null}
        </div>)}
      </div>
      <div className={styles.editorRow2}>
        <div className={styles.editorBlock}><span>观察点</span><ul>{plan.observation_points.map((point, index) => <li key={index}>{point}</li>)}</ul></div>
        <div className={styles.editorBlock}><span>调整条件</span><ul>{plan.adjustment_conditions.map((condition, index) => <li key={index}>{condition}</li>)}</ul></div>
      </div>
    </details>}

    <div className={styles.editorRow2}>
      <label className={styles.editorField}><span>复核教师</span>
        <input required maxLength={200} aria-label="复核教师" value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="教师姓名"/>
      </label>
      <label className={styles.editorField}><span>复核理由</span>
        <input required maxLength={4000} aria-label="复核理由" value={reason} onChange={event => setReason(event.target.value)} placeholder="说明方案与当前证据、来源的对应关系"/>
      </label>
    </div>

    <div className={styles.editorActions}>
      <button className={styles.primaryAction} type="submit" disabled={disabled || !canAccept || !formComplete}>
        <Check size={14}/>{changed ? '保存修改并采纳' : '接受方案'}
      </button>
      <button type="button" disabled={disabled} onClick={() => decide('needs_observation')}>
        <ClipboardCheck size={14}/>继续观察
      </button>
      <button className={styles.rejectAction} type="button" disabled={disabled} onClick={() => decide('rejected')}>
        <RotateCcw size={14}/>拒绝方案
      </button>
    </div>
    {!formComplete && <p className={styles.editorHint}>接受或修改前需要补齐教师、复核理由，以及方案的目标、步骤、材料、三级提示、观察点和调整条件。</p>}
    {!canAccept && blocker && <Notice tone="warning">{blocker}</Notice>}
  </form>;
}
