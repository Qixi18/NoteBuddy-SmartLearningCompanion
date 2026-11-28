import { useState, type FormEvent } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Notice, Panel } from '../../../components/PageBits';
import { responseEvidenceRefs, str } from '../../shared/workbenchTypes';
import type { Bundle, Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function TeacherCaseForm({ runId, studentId, indicatorId, nodeId, review, evidence, currentCase, sourceVerified, pending, onSave }: {
  runId: string; studentId: string; indicatorId: string; nodeId: string; review?: Row; evidence?: Bundle; currentCase?: Row; sourceVerified: boolean; pending: boolean; onSave: (payload: Row) => void;
}) {
  const [needType, setNeedType] = useState(String(currentCase?.need_type ?? '部分得分'));
  const [selectionReason, setSelectionReason] = useState(String(currentCase?.selection_reason ?? ''));
  const [narrative, setNarrative] = useState(String(currentCase?.narrative ?? ''));
  const [limitations, setLimitations] = useState(String(currentCase?.limitations ?? ''));
  const [reviewer, setReviewer] = useState(String(currentCase?.reviewer ?? ''));
  const savedRefs = Array.isArray(review?.evidence_refs) ? review.evidence_refs as Row[] : [];
  const v2ResponseIds = savedRefs.filter(reference => reference.kind === 'response').map(reference => String(reference.record_id ?? '')).filter(Boolean);
  const recordIds = review?.teaching_plan_v2 ? v2ResponseIds : Array.isArray(review?.evidence_record_ids) ? review.evidence_record_ids.map(String) : [];
  const references = review?.teaching_plan_v2 && v2ResponseIds.length === savedRefs.length
    ? savedRefs
    : responseEvidenceRefs(evidence, recordIds);
  const isAccepted = review?.status === 'accepted' || review?.status === 'edited';
  const plan = review?.teaching_plan_v2 && typeof review.teaching_plan_v2 === 'object' ? review.teaching_plan_v2 as Row : review?.structured_plan && typeof review.structured_plan === 'object' ? review.structured_plan as Row : {};
  const isV2 = Number(plan.schema_version) === 2;
  const planComplete = isV2
    ? Boolean(String(plan.goal ?? '').trim() && Array.isArray(plan.steps) && plan.steps.length && Array.isArray(plan.hints) && plan.hints.length === 3 && Array.isArray(plan.observation_points) && plan.observation_points.length && Array.isArray(plan.adjustment_conditions) && plan.adjustment_conditions.length && Array.isArray(plan.evidence_refs) && plan.evidence_refs.length)
    : Boolean(String(plan.activity ?? '').trim() && Array.isArray(plan.steps) && plan.steps.length && Array.isArray(plan.practice) && plan.practice.length && Array.isArray(plan.observation_points) && plan.observation_points.length);
  const reviewRefs = savedRefs;
  const isCoverage = reviewRefs.length === 1 && reviewRefs[0].kind === 'coverage' && recordIds.length === 0;
  const validResponseRefs = recordIds.length > 0 && references.length === new Set(recordIds).size;
  const ready = Boolean(isAccepted && review?.version && planComplete && sourceVerified && (validResponseRefs || isCoverage));
  const caseEvidenceRefs = isCoverage ? reviewRefs : references;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || !review) return;
    onSave({
      student_id: studentId, status: 'confirmed', need_type: needType,
      selection_reason: selectionReason.trim(), narrative: narrative.trim(), limitations: limitations.trim(),
      evidence_record_ids: recordIds, evidence_refs: caseEvidenceRefs,
      review_refs: [{ indicator_id: indicatorId, node_id: nodeId, version: Number(review.version) }], reviewer: reviewer.trim(),
    });
  };
  return <Panel title="教师案例确认" icon={<ClipboardCheck size={18}/> }>
    {currentCase?.status === 'confirmed' && <Notice>当前案例已确认（第 {str(currentCase.version)} 版）。保存表单会追加一版，并按当前复核与证据重新关联。</Notice>}
    {!ready && <Notice tone="warning">正式案例需要当前节点已接受且包含完整方案的教师复核、有效来源核验，以及匹配的作答或覆盖证据。请先完成上方方案复核。</Notice>}
    <form className={styles.caseForm} onSubmit={submit}>
      <label>案例类型<select value={needType} onChange={event => setNeedType(event.target.value)}><option>部分得分</option><option>表现较好</option><option>记录较少</option><option>无记录观察</option><option>自定义</option></select></label>
      <label>选择理由<textarea required rows={2} maxLength={4000} value={selectionReason} onChange={event => setSelectionReason(event.target.value)} placeholder="说明该学生为何能代表此类学习情况"/></label>
      <label>案例叙述<textarea required rows={3} maxLength={10000} value={narrative} onChange={event => setNarrative(event.target.value)} placeholder={isCoverage ? '结合当前覆盖状态和教师确认的诊断安排描述；不把缺记录解释为零分' : '结合当前复核和作答证据描述学习情况'}/></label>
      <label>解释限制<textarea required rows={2} maxLength={4000} value={limitations} onChange={event => setLimitations(event.target.value)} placeholder="说明样本、覆盖或推断上的限制"/></label>
      <div className={styles.caseFormFoot}><label>核验教师<input required maxLength={200} value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="教师姓名"/></label><span>{isCoverage ? '当前范围覆盖证据 · 无有效作答记录' : `${recordIds.length} 条复核作答 · ${references.length} 条有效引用`} · 运行 {runId.slice(0, 8)}</span></div>
      <button className={styles.acceptButton} type="submit" disabled={!ready || pending || !selectionReason.trim() || !narrative.trim() || !limitations.trim() || !reviewer.trim()}>{pending ? '正在保存…' : currentCase?.status === 'confirmed' ? '更新确认案例' : '确认并保存案例'}</button>
    </form>
  </Panel>;
}
