import { useState, type FormEvent } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Notice } from '../../../components/PageBits';
import { responseEvidenceRefs, str } from '../../shared/workbenchTypes';
import type { Bundle, Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';
import pageStyles from '../pages/StudentTeachingPage.module.css';

const CASE_TYPE_OPTIONS = ['待教师选择', '部分得分', '表现较好', '记录较少', '无记录观察', '自定义'];

export function TeacherCaseForm({ runId, studentId, indicatorId, nodeId, review, evidence, currentCase, sourceVerified, pending, onSave }: {
  runId: string; studentId: string; indicatorId: string; nodeId: string; review?: Row; evidence?: Bundle; currentCase?: Row; sourceVerified: boolean; pending: boolean; onSave: (payload: Row) => void;
}) {
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
  const isCoverage = savedRefs.length === 1 && savedRefs[0].kind === 'coverage' && recordIds.length === 0;
  const validResponseRefs = recordIds.length > 0 && references.length === new Set(recordIds).size;
  const [needType, setNeedType] = useState(String(currentCase?.need_type ?? (isCoverage ? '无记录观察' : '待教师选择')));
  const [selectionReason, setSelectionReason] = useState(String(currentCase?.selection_reason ?? ''));
  const [narrative, setNarrative] = useState(String(currentCase?.narrative ?? ''));
  const [limitations, setLimitations] = useState(String(currentCase?.limitations ?? ''));
  const [reviewer, setReviewer] = useState(String(currentCase?.reviewer ?? ''));
  const typeChosen = Boolean(needType) && needType !== '待教师选择';
  const ready = Boolean(isAccepted && review?.version && planComplete && sourceVerified && typeChosen && (validResponseRefs || isCoverage));
  const caseEvidenceRefs = isCoverage ? savedRefs : references;
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
  return <details className={pageStyles.collapsedSection} data-testid="teacher-case-form">
    <summary className={pageStyles.collapsedSummary}><ClipboardCheck size={18}/>代表性案例归档<small>仅保存范围与证据都通过校验的正式案例</small></summary>
    <div className={pageStyles.collapsedBody}>
    {currentCase?.status === 'confirmed' && <Notice>当前案例已确认（第 {str(currentCase.version)} 版）。保存表单会追加一版，并按当前复核与证据重新关联。</Notice>}
    {review && <p className={pageStyles.caseReference}>归档引用：第 {str(review.version)} 版教师复核 · {isCoverage ? '当前范围覆盖证据' : `${recordIds.length} 条复核作答`} · 指标 {indicatorId} · 节点 {nodeId}</p>}
    {!ready && <Notice tone="warning">
      {!typeChosen ? '请根据真实证据选择案例类型；系统不会默认把学生归为「部分得分」。'
        : '正式案例需要当前节点已接受且包含完整方案的教师复核、有效来源核验，以及匹配的作答或覆盖证据。请先完成上方方案复核。'}
    </Notice>}
    <form className={styles.caseForm} onSubmit={submit}>
      <label>案例类型<select aria-label="案例类型" value={needType} onChange={event => setNeedType(event.target.value)}>{CASE_TYPE_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></label>
      <label>选择理由<textarea required rows={2} maxLength={4000} aria-label="选择理由" value={selectionReason} onChange={event => setSelectionReason(event.target.value)} placeholder="说明该学生为何能代表此类学习情况"/></label>
      <label>案例叙述<textarea required rows={3} maxLength={10000} aria-label="案例叙述" value={narrative} onChange={event => setNarrative(event.target.value)} placeholder={isCoverage ? '结合当前覆盖状态和教师确认的诊断安排描述；不把缺记录解释为零分' : '结合当前复核和作答证据描述学习情况'}/></label>
      <label>解释限制<textarea required rows={2} maxLength={4000} aria-label="解释限制" value={limitations} onChange={event => setLimitations(event.target.value)} placeholder="说明样本、覆盖或推断上的限制"/></label>
      <div className={styles.caseFormFoot}><label>核验教师<input required maxLength={200} aria-label="核验教师" value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="教师姓名"/></label><span>{isCoverage ? '当前范围覆盖证据 · 无有效作答记录' : `${recordIds.length} 条复核作答 · ${references.length} 条有效引用`} · 运行 {runId.slice(0, 8)}</span></div>
      <button className={styles.acceptButton} type="submit" disabled={!ready || pending || !selectionReason.trim() || !narrative.trim() || !limitations.trim() || !reviewer.trim()}>{pending ? '正在保存…' : currentCase?.status === 'confirmed' ? '更新确认案例' : '确认并保存案例'}</button>
    </form>
    </div>
  </details>;
}
