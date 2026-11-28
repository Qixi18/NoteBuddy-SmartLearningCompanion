import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { EmptyState, ErrorBox, Loading, Notice, Panel } from '../../../components/PageBits';
import type { RunData } from '../../../types/api';
import { api, patchJson, postJson } from '../api';
import { responseEvidenceRefs, str } from '../../shared/workbenchTypes';
import type { Bundle, Row } from '../../shared/workbenchTypes';
import { compareNodeChronology, compareNodeDates, orderedNodeRows } from '../../shared/scopeUtils';
import styles from '../../shared/WorkbenchPages.module.css';

export function StudentAdjustmentWorkflow({ run, studentId, indicatorId, nodeId, review, latestReview, evidence, adjustments, onGoToReview, goToReviewLabel = '前往教师审核' }: {
  run: RunData;
  studentId: string;
  indicatorId: string;
  nodeId: string;
  review?: Row;
  latestReview?: Row;
  evidence?: Bundle;
  adjustments: Row[];
  onGoToReview?: () => void;
  goToReviewLabel?: string;
}) {
  const matchingReviewEvidence = review && evidence
    ? evidence.responses.filter(row => (review.evidence_record_ids as string[] | undefined)?.includes(String(row.record_id)))
    : [];
  const planV2 = review?.teaching_plan_v2 && typeof review.teaching_plan_v2 === 'object' ? review.teaching_plan_v2 as Row : undefined;
  const reviewRefs = Array.isArray(review?.evidence_refs) ? review.evidence_refs as Row[] : [];
  const coverageOrigin = Boolean(planV2 && reviewRefs.length === 1 && reviewRefs[0].kind === 'coverage');
  const reviewAdjustments = review
    ? adjustments.filter(row => Number(row.review_version) === Number(review.version) && String(row.origin_node_id ?? '') === nodeId)
    : [];
  const evidenceReady = Boolean(review && (matchingReviewEvidence.length || coverageOrigin));
  const showCreateForm = Boolean(review && evidenceReady && !reviewAdjustments.length);
  const [planCreated, setPlanCreated] = useState(false);
  useEffect(() => {
    setPlanCreated(false);
  }, [review?.version, studentId, indicatorId, nodeId]);
  return <Panel title="教学实施与调整记录" icon={<ClipboardCheck size={18}/> }>
    <Notice>计划和实施记录按学生、观察指标与测验节点保存。后续效果必须引用后续节点的实际作答记录；没有作答时请等待补充证据。</Notice>
    {review && !evidenceReady ? <Notice tone="warning">已找到当前有效且被教师采纳的方案，但证据包中没有匹配的作答来源，暂不能创建可追溯的教学调整计划。</Notice> : null}
    {review && evidenceReady && showCreateForm ? <AdjustmentPlanForm run={run} studentId={studentId} indicatorId={indicatorId} nodeId={nodeId} review={review} evidence={evidence} matchingEvidence={matchingReviewEvidence} onCreated={() => setPlanCreated(true)}/> : null}
    {planCreated && <Notice>教学调整计划已保存，并关联了起始复核与作答来源。</Notice>}
    {!review ? <section className={styles.adjustmentState} data-tone="amber" aria-label="教学实施状态">
      <span className={styles.statePill} data-tone="amber">尚未建立教学实施计划</span>
      <p>需要先完成当前方案的教师审核。审核通过后，可以创建教学实施计划，并记录实际执行情况。</p>
      {latestReview ? <small>当前最新复核状态为「{str(latestReview.status)}」；只有当前有效的采纳或修改方案才能建立实施计划。</small>
        : <small>当前节点还没有教师复核记录。</small>}
      {onGoToReview && <button type="button" className={styles.stateActionLink} onClick={onGoToReview}>{goToReviewLabel} <ArrowRight size={14}/></button>}
    </section> : null}
    <div className={styles.adjustmentList}>{adjustments.length ? adjustments.map(row => <AdjustmentProgressEditor key={String(row.adjustment_id)} run={run} record={row}/>) : review && showCreateForm ? null : review ? <EmptyState compact title="尚未登记实施情况" detail="完成上方计划后，可在这里记录实施时间、实际活动与后续复测证据。"/> : null}</div>
  </Panel>;
}
function splitLines(value: string) { return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean); }
function localDateTimeValue() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}
function AdjustmentPlanForm({ run, studentId, indicatorId, nodeId, review, evidence, matchingEvidence, onCreated }: {
  run: RunData;
  studentId: string;
  indicatorId: string;
  nodeId: string;
  review: Row;
  evidence?: Bundle;
  matchingEvidence: Row[];
  onCreated?: () => void;
}) {
  const plan = review.teaching_plan_v2 && typeof review.teaching_plan_v2 === 'object' ? review.teaching_plan_v2 as Row : undefined;
  const [activity, setActivity] = useState(String(plan?.goal ?? ''));
  const [practice, setPractice] = useState(Array.isArray(plan?.steps) ? (plan.steps as string[]).join('\n') : '');
  const [observations, setObservations] = useState(Array.isArray(plan?.observation_points) ? (plan.observation_points as string[]).join('\n') : '');
  const [teacher, setTeacher] = useState('教师');
  const [plannedAt, setPlannedAt] = useState(localDateTimeValue);
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => api<Row>('/api/teaching-adjustments', postJson({
      student_id: studentId,
      indicator_id: indicatorId,
      origin_run_id: run.run_id,
      origin_node_id: nodeId,
      review_version: review.version,
      origin_evidence_refs: plan ? [] : responseEvidenceRefs(evidence, matchingEvidence.map(row => String(row.record_id))),
      ...(plan ? {} : { planned_activity: activity.trim(), planned_practice: splitLines(practice), observation_points: splitLines(observations) }),
      teacher: teacher.trim(),
      planned_at: plannedAt,
    })),
    onSuccess: async () => {
      onCreated?.();
      await queryClient.invalidateQueries({ queryKey: ['teaching-adjustments'] });
    },
  });
  return <form className={styles.adjustmentForm} onSubmit={event => { event.preventDefault(); create.mutate(); }}>
    <div className={styles.adjustmentFormHeader}><strong>建立教学调整计划</strong><span>来源：第 {str(review.version)} 版教师复核 · {plan ? '继承完整 V2 方案快照' : `${matchingEvidence.length} 条引用作答`}</span></div>
    {plan ? <article className={styles.planPreview}><h4>{activity}</h4><strong>方案步骤</strong><ol>{splitLines(practice).map((item, index) => <li key={index}>{item}</li>)}</ol><strong>观察点</strong><p>{splitLines(observations).join('；')}</p><small>范围指纹：{str(plan.evidence_fingerprint)} · 来源版本：{JSON.stringify(plan.source_versions ?? {})}</small></article> : <><label>计划活动<input required maxLength={4000} value={activity} onChange={event => setActivity(event.target.value)} placeholder="描述准备开展的具体教学活动"/></label><div className={styles.adjustmentFormGrid}><label>练习安排<textarea required value={practice} onChange={event => setPractice(event.target.value)} rows={3}/></label><label>观察要点<textarea required value={observations} onChange={event => setObservations(event.target.value)} rows={3}/></label></div></>}
    <div className={styles.adjustmentFormGrid}><label>教师<input required maxLength={200} value={teacher} onChange={event => setTeacher(event.target.value)} /></label><label>计划时间<input required type="datetime-local" value={plannedAt} onChange={event => setPlannedAt(event.target.value)}/></label></div>
    <button className={styles.adjustmentSubmit} type="submit" disabled={create.isPending || !splitLines(practice).length || !splitLines(observations).length}>{create.isPending ? '正在保存…' : '保存教学调整计划'}</button>
    {create.isSuccess && <Notice>教学调整计划已保存，并关联了起始复核与作答来源。</Notice>}{create.isError && <ErrorBox message={(create.error as Error).message}/>}
  </form>;
}
function AdjustmentProgressEditor({ run, record }: { run: RunData; record: Row }) {
  const orderedNodes = orderedNodeRows(run.nodes);
  const originNode = String(record.origin_node_id ?? '');
  const isEligibleNode = (nodeId: string) => {
    const originInCurrentRun = String(record.origin_run_id ?? '') === run.run_id;
    const target = run.nodes.find(node => String(node['节点编号'] ?? '') === nodeId);
    const comparison = originInCurrentRun
      ? compareNodeChronology(run.nodes, originNode, nodeId)
      : compareNodeDates(String(record.origin_node_date ?? ''), String(target?.['模拟测验日期'] ?? ''));
    return comparison === -1;
  };
  const firstEligibleNode = orderedNodes.find(node => isEligibleNode(String(node['节点编号'] ?? '')));
  const hasOtherIneligibleNodes = orderedNodes.some(node =>
    String(node['节点编号'] ?? '') !== originNode && !isEligibleNode(String(node['节点编号'] ?? '')),
  );
  const initialFollowupNode = String(record.followup_node_id ?? firstEligibleNode?.['节点编号'] ?? originNode);
  const [followupNode, setFollowupNode] = useState(initialFollowupNode);
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>(Array.isArray(record.followup_evidence_record_ids) ? record.followup_evidence_record_ids.map(String) : []);
  const [implementation, setImplementation] = useState(String(record.implementation ?? ''));
  const [implementationStatus, setImplementationStatus] = useState(String(record.implementation_status ?? 'not_completed'));
  const [outcome, setOutcome] = useState(String(record.outcome_observations ?? ''));
  const [comparability, setComparability] = useState(String(record.comparability ?? 'undetermined'));
  const [comparabilityReason, setComparabilityReason] = useState(String(record.comparability_reason ?? ''));
  const [conclusion, setConclusion] = useState(String(record.teacher_conclusion ?? ''));
  const [reviewer, setReviewer] = useState(String(record.reviewer ?? '教师'));
  const queryClient = useQueryClient();
  const followupBundle = useQuery({
    queryKey: ['adjustment-followup-evidence', run.run_id, record.adjustment_id, followupNode],
    queryFn: () => api<Bundle>(`/api/evidence-bundle?student=${encodeURIComponent(String(record.student_id))}&indicator=${encodeURIComponent(String(record.indicator_id))}&node=${encodeURIComponent(followupNode)}`),
    enabled: Boolean(followupNode && run.run_id),
  });
  const update = useMutation({
    mutationFn: () => api<Row>(`/api/teaching-adjustments/${encodeURIComponent(String(record.adjustment_id))}`, patchJson({
        update_type: 'outcome',
        implementation: implementation.trim(),
        implementation_status: implementationStatus,
        outcome_observations: outcome.trim(),
        followup_run_id: run.run_id,
        followup_node_id: followupNode,
        followup_evidence_record_ids: selectedEvidence,
        followup_evidence_refs: responseEvidenceRefs(followupBundle.data, selectedEvidence),
        comparability,
        comparability_reason: comparabilityReason.trim(),
        teacher_conclusion: conclusion.trim(),
        reviewer: reviewer.trim(),
        concluded_at: new Date().toISOString(),
      })),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['teaching-adjustments'] }); },
  });
  const saveImplementation = useMutation({
    mutationFn: () => api<Row>(`/api/teaching-adjustments/${encodeURIComponent(String(record.adjustment_id))}`, patchJson({
      update_type: 'implementation',
      implementation: implementation.trim(),
      implementation_status: implementationStatus,
    })),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['teaching-adjustments'] }); },
  });
  const rows = followupBundle.data?.responses ?? [];
  const validEvidenceIds = new Set(rows.filter(row => row.disposition === 'scored').map(row => String(row.record_id)));
  const selectionContainsInvalidEvidence = selectedEvidence.some(id => !validEvidenceIds.has(id));
  return <details className={styles.adjustmentRecord}>
    <summary><b>调整计划 · {str(record.planned_activity, '未填写活动')}</b><span>第 {str(record.review_version)} 版复核</span><span>{record.concluded_at ? `已完成效果复核 · ${String(record.updated_at ?? '')}` : record.implementation ? '已记录实施 · 等待效果复核' : '待记录实施与效果'}</span></summary>
    <div className={styles.adjustmentRecordBody}>
      <p><strong>练习安排：</strong>{Array.isArray(record.planned_practice) ? record.planned_practice.join('；') : '—'}</p>
      <p><strong>观察要点：</strong>{Array.isArray(record.observation_points) ? record.observation_points.join('；') : '—'}</p>
      <section className={styles.adjustmentSection}>
        <h4>1. 实施记录 <small>教学活动已开展但后续测验未进行时，可先单独保存这里</small></h4>
        <div className={styles.adjustmentFormGrid}><label>实施记录<textarea required value={implementation} onChange={event => setImplementation(event.target.value)} rows={3} placeholder="记录实际开展的教学活动"/></label><label>实施状态<select value={implementationStatus} onChange={event => setImplementationStatus(event.target.value)}><option value="not_completed">尚未完成</option><option value="partial">部分完成</option><option value="completed">已完成</option></select></label></div>
        <button className={styles.adjustmentSubmit} type="button" disabled={saveImplementation.isPending || !implementation.trim()} onClick={() => saveImplementation.mutate()}>{saveImplementation.isPending ? '正在保存…' : '保存实施情况'}</button>
        {saveImplementation.isSuccess && <Notice>实施情况已保存；后续测验完成后，再在下方补充效果复核。</Notice>}
        {saveImplementation.isError && <ErrorBox message={(saveImplementation.error as Error).message}/>}
      </section>

      <section className={styles.adjustmentSection}>
        <h4>2. 效果复核 <small>没有后续有效评分时不能生成效果结论</small></h4>
        <div className={styles.adjustmentFormGrid}><label>效果观察<textarea required value={outcome} onChange={event => setOutcome(event.target.value)} rows={3} placeholder="记录学生表现和观察到的变化；只写有证据的内容"/></label><label>后续测验节点<select value={followupNode} onChange={event => { setFollowupNode(event.target.value); setSelectedEvidence([]); }}>{orderedNodes.map((node, index) => {
          const id = String(node['节点编号'] ?? index);
          const originInCurrentRun = String(record.origin_run_id ?? '') === run.run_id;
          const comparison = originInCurrentRun
            ? compareNodeChronology(run.nodes, originNode, id)
            : compareNodeDates(String(record.origin_node_date ?? ''), String(node['模拟测验日期'] ?? ''));
          const eligible = comparison === -1;
          const orderLabel = comparison === null ? ' · 日期待确认' : comparison === 0 ? ' · 起始节点不可复测' : comparison === 1 ? ' · 早于起始测验' : '';
          return <option key={id} value={id} disabled={!eligible}>{id} · {String(node['节点名称'] ?? node['模拟测验日期'] ?? '')}{orderLabel}</option>;
        })}</select></label></div>
        {(hasOtherIneligibleNodes || !firstEligibleNode) && <Notice tone="warning">只有日期明确且晚于起始测验的节点才能作为后续复测；起始节点本身、同日节点和日期不明的节点不能复用为干预结果。</Notice>}
        <fieldset className={styles.followupEvidence}><legend>后续有效评分证据（必选，{selectedEvidence.length} 条）</legend>{followupBundle.isPending ? <Loading label="读取后续节点作答…"/> : rows.length ? rows.map((row, index) => {
          const recordId = String(row.record_id);
          const selected = selectedEvidence.includes(recordId);
          const valid = row.disposition === 'scored';
          return <label key={String(row.evidence_id ?? index)}><input type="checkbox" checked={selected} disabled={!valid && !selected} onChange={event => setSelectedEvidence(current => event.target.checked ? valid ? [...new Set([...current, recordId])] : current : current.filter(id => id !== recordId))}/><span><b>{str(row.record_id)}</b> · {str(row.material_id)} · {str(row.disposition, '状态未知')}{!valid && ' · 不可作为后续有效评分证据'}</span></label>;
        }) : <small>该学生在此节点没有作答记录；不能填写基于空证据的效果结论。</small>}</fieldset>
        <div className={styles.adjustmentFormGrid}><label>比较口径<select value={comparability} onChange={event => setComparability(event.target.value)}><option value="comparable">可以比较</option><option value="not_comparable">不可比较</option><option value="undetermined">尚不能确定</option></select></label><label>比较说明<input required maxLength={4000} value={comparabilityReason} onChange={event => setComparabilityReason(event.target.value)} placeholder="说明采用的共同题目或不可比原因"/></label></div>
        <label className={styles.adjustmentWideField}>教师结论<textarea required value={conclusion} onChange={event => setConclusion(event.target.value)} rows={3} placeholder="结合所选后续作答证据记录结论与下一步"/></label>
        <div className={styles.adjustmentFormGrid}><label>记录教师<input required maxLength={200} value={reviewer} onChange={event => setReviewer(event.target.value)}/></label><div className={styles.followupSource}><small>后续范围：{str(record.student_id)} · {str(record.indicator_id)} · {followupNode}</small><small>只允许引用此学生、指标和节点的原始作答记录。</small></div></div>
        <button className={styles.adjustmentSubmit} type="button" disabled={update.isPending || !isEligibleNode(followupNode) || !implementation.trim() || !outcome.trim() || !selectedEvidence.length || selectionContainsInvalidEvidence || !comparabilityReason.trim() || !conclusion.trim() || !reviewer.trim()} onClick={() => update.mutate()}>{update.isPending ? '正在保存…' : '保存效果复核'}</button>
        {update.isSuccess && <Notice>效果复核已保存，先前版本保留在调整记录历史中。</Notice>}{update.isError && <ErrorBox message={(update.error as Error).message}/>}
      </section>
    </div>
  </details>;
}
