import type { TeachingPlanV2 } from '../../../api/types';
import { Panel } from '../../../components/Panel';

const hintLabels: Record<TeachingPlanV2['hints'][number]['level'], string> = {
  direction: '方向提示',
  structure: '结构提示',
  local_check: '局部检查提示',
};

const lines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);

export function TeachingPlanEditor({ preview, previewError, plan, onChange }: {
  preview: TeachingPlanV2 | null | undefined;
  previewError?: string | null;
  plan: TeachingPlanV2 | null;
  onChange: (plan: TeachingPlanV2 | null) => void;
}) {
  if (!plan && !preview) return previewError
    ? <p className="review-alert" role="status">暂不能生成结构化方案：{previewError}</p>
    : null;

  const adoptPreview = () => { if (preview) onChange(structuredClone(preview)); };
  const update = (changes: Partial<TeachingPlanV2>) => { if (plan) onChange({ ...plan, ...changes }); };
  const updateHint = (index: number, changes: Partial<TeachingPlanV2['hints'][number]>) => {
    if (!plan) return;
    onChange({ ...plan, hints: plan.hints.map((hint, i) => i === index ? { ...hint, ...changes } : hint) });
  };
  const editing = plan ?? preview;
  if (!editing) return null;

  return <Panel title="结构化教学方案" className="teaching-plan-editor">
    {!plan
      ? <><p className="muted">系统只生成带来源版本和作答证据的待复核草案。请教师逐项核对后采用并编辑。</p><button type="button" onClick={adoptPreview}>载入分层方案草稿</button></>
      : <>
        <div className="teaching-plan-toolbar"><span>方案 v{plan.schema_version} · 模板 {plan.template_version} · 来源签核 {Object.entries(plan.source_versions).map(([id, version]) => `${id} v${version}`).join('、')}</span><button className="secondary" type="button" onClick={() => onChange(null)}>移除此方案</button></div>
        <label>本次目标<textarea value={plan.goal} onChange={event => update({ goal: event.target.value })} /></label>
        <section className="teaching-plan-materials"><h3>已筛选材料与选择理由</h3><ul>{plan.resource_reasons.map(item => <li key={item.material_id}><strong>{item.material_id}</strong> · {item.resource_type} · {item.explanation}</li>)}</ul></section>
        <label>教学步骤（每行一步）<textarea value={plan.steps.join('\n')} onChange={event => update({ steps: lines(event.target.value) })} /></label>
        <fieldset className="teaching-plan-hints"><legend>渐进提示</legend>{plan.hints.map((hint, index) => <section key={hint.level}><h4>{hintLabels[hint.level]}</h4><label>学生可见<textarea value={hint.student_prompt} onChange={event => updateHint(index, { student_prompt: event.target.value })} /></label><label>教师使用说明（不会进入学生提示投影）<textarea value={hint.teacher_note} onChange={event => updateHint(index, { teacher_note: event.target.value })} /></label></section>)}</fieldset>
        <label>观察点（每行一项）<textarea value={plan.observation_points.join('\n')} onChange={event => update({ observation_points: lines(event.target.value) })} /></label>
        <label>后续调整条件（每行一项）<textarea value={plan.adjustment_conditions.join('\n')} onChange={event => update({ adjustment_conditions: lines(event.target.value) })} /></label>
        <p className="muted">证据记录：{plan.evidence_refs.map(ref => `${ref.record_id}（第 ${ref.source_line} 行）`).join('、')}。当前作答或来源改变后，保存和导出会重新校验并阻止过期方案。</p>
      </>}
  </Panel>;
}
