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
  const recordIds = Array.isArray(review?.evidence_record_ids) ? review.evidence_record_ids.map(String) : [];
  const references = responseEvidenceRefs(evidence, recordIds);
  const isAccepted = review?.status === 'accepted' || review?.status === 'edited';
  const plan = review?.structured_plan && typeof review.structured_plan === 'object' ? review.structured_plan as Row : {};
  const planComplete = Boolean(String(plan.activity ?? '').trim() && Array.isArray(plan.steps) && plan.steps.length && Array.isArray(plan.practice) && plan.practice.length && Array.isArray(plan.observation_points) && plan.observation_points.length);
  const ready = Boolean(isAccepted && review?.version && planComplete && sourceVerified && recordIds.length && references.length === new Set(recordIds).size);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || !review) return;
    onSave({
      student_id: studentId, status: 'confirmed', need_type: needType,
      selection_reason: selectionReason.trim(), narrative: narrative.trim(), limitations: limitations.trim(),
      evidence_record_ids: recordIds, evidence_refs: references,
      review_refs: [{ indicator_id: indicatorId, node_id: nodeId, version: Number(review.version) }], reviewer: reviewer.trim(),
    });
  };
  return <Panel title="教师案例确认" icon={<ClipboardCheck size={18}/> }>
    {currentCase?.status === 'confirmed' && <Notice>当前案例已确认（第 {str(currentCase.version)} 版）。保存表单会追加一版，并按当前复核与证据重新关联。</Notice>}
    {!ready && <Notice tone="warning">正式案例需要当前节点已接受且包含完整结构化方案的教师复核、可追溯作答证据和有效来源核验。请先完成上方方案复核。</Notice>}
    <form className={styles.caseForm} onSubmit={submit}>
      <label>案例类型<select value={needType} onChange={event => setNeedType(event.target.value)}><option>部分得分</option><option>表现较好</option><option>记录较少</option><option>无记录观察</option><option>自定义</option></select></label>
      <label>选择理由<textarea required rows={2} maxLength={4000} value={selectionReason} onChange={event => setSelectionReason(event.target.value)} placeholder="说明该学生为何能代表此类学习情况"/></label>
      <label>案例叙述<textarea required rows={3} maxLength={10000} value={narrative} onChange={event => setNarrative(event.target.value)} placeholder="结合当前复核和作答证据描述学习情况"/></label>
      <label>解释限制<textarea required rows={2} maxLength={4000} value={limitations} onChange={event => setLimitations(event.target.value)} placeholder="说明样本、覆盖或推断上的限制"/></label>
      <div className={styles.caseFormFoot}><label>核验教师<input required maxLength={200} value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="教师姓名"/></label><span>{recordIds.length} 条复核作答 · {references.length} 条有效引用 · 运行 {runId.slice(0, 8)}</span></div>
      <button className={styles.acceptButton} type="submit" disabled={!ready || pending || !selectionReason.trim() || !narrative.trim() || !limitations.trim() || !reviewer.trim()}>{pending ? '正在保存…' : currentCase?.status === 'confirmed' ? '更新确认案例' : '确认并保存案例'}</button>
    </form>
  </Panel>;
}
