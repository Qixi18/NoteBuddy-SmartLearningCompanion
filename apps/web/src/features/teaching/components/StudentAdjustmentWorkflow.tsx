import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { EmptyState, ErrorBox, Loading, Notice, Panel } from '../../../components/PageBits';
import type { RunData } from '../../../types/api';
import { api, patchJson, postJson } from '../api';
import { responseEvidenceRefs, str } from '../../shared/workbenchTypes';
import type { Bundle, Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function StudentAdjustmentWorkflow({ run, studentId, indicatorId, nodeId, review, latestReview, evidence, adjustments }: {
  run: RunData;
  studentId: string;
  indicatorId: string;
  nodeId: string;
  review?: Row;
  latestReview?: Row;
  evidence?: Bundle;
  adjustments: Row[];
}) {
  const matchingReviewEvidence = review && evidence
    ? evidence.responses.filter(row => (review.evidence_record_ids as string[] | undefined)?.includes(String(row.record_id)))
    : [];
  return <Panel title="教学实施与调整记录" icon={<ClipboardCheck size={18}/> }>
    <Notice>计划和实施记录按学生、观察指标与测验节点保存。后续效果必须引用后续节点的实际作答记录；没有作答时请等待补充证据。</Notice>
    {review && matchingReviewEvidence.length ? <AdjustmentPlanForm run={run} studentId={studentId} indicatorId={indicatorId} nodeId={nodeId} review={review} evidence={evidence!} matchingEvidence={matchingReviewEvidence}/> : latestReview?.status === 'accepted' || latestReview?.status === 'edited'
      ? <Notice tone="warning">已找到当前节点的教师复核，但证据包中没有匹配的作答来源，暂不能创建可追溯的教学调整计划。</Notice>
      : <EmptyState title="需要先接受当前节点的建议" detail={latestReview ? `当前最新复核状态为「${str(latestReview.status)}」。仅接受或修改后的建议可建立教学调整记录。` : '确认一份有可追溯作答依据的学生建议后，可在这里登记教学活动与后续观察。'}/>}
    <div className={styles.adjustmentList}>{adjustments.length ? adjustments.map(row => <AdjustmentProgressEditor key={`${String(row.adjustment_id)}-${String(row.updated_at)}`} run={run} record={row}/>) : <EmptyState title="暂无教学调整记录" detail="已接受当前学生建议后，可创建教学计划并持续记录实施结果。"/>}</div>
  </Panel>;
}
function splitLines(value: string) { return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean); }
function localDateTimeValue() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}
function AdjustmentPlanForm({ run, studentId, indicatorId, nodeId, review, evidence, matchingEvidence }: {
  run: RunData;
  studentId: string;
  indicatorId: string;
  nodeId: string;
  review: Row;
  evidence: Bundle;
  matchingEvidence: Row[];
}) {
  const [activity, setActivity] = useState('');
  const [practice, setPractice] = useState('');
  const [observations, setObservations] = useState('');
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
      origin_evidence_refs: responseEvidenceRefs(evidence, matchingEvidence.map(row => String(row.record_id))),
      planned_activity: activity.trim(),
      planned_practice: splitLines(practice),
      observation_points: splitLines(observations),
      teacher: teacher.trim(),
      planned_at: plannedAt,
    })),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['teaching-adjustments'] }); },
  });
  return <form className={styles.adjustmentForm} onSubmit={event => { event.preventDefault(); create.mutate(); }}>
    <div className={styles.adjustmentFormHeader}><strong>建立教學調整計畫</strong><span>來源：第 {str(review.version)} 版教師復核 · {matchingEvidence.length} 條引用作答</span></div>
    <label>計畫活動<input required maxLength={4000} value={activity} onChange={event => setActivity(event.target.value)} placeholder="描述准备开展的具体教学活动"/></label>
    <div className={styles.adjustmentFormGrid}><label>练习安排<textarea required value={practice} onChange={event => setPractice(event.target.value)} rows={3} placeholder="每行一项练习安排"/></label><label>观察要点<textarea required value={observations} onChange={event => setObservations(event.target.value)} rows={3} placeholder="每行一项后续观察要点"/></label></div>
    <div className={styles.adjustmentFormGrid}><label>教师<input required maxLength={200} value={teacher} onChange={event => setTeacher(event.target.value)} /></label><label>计划时间<input required type="datetime-local" value={plannedAt} onChange={event => setPlannedAt(event.target.value)}/></label></div>
    <button className={styles.adjustmentSubmit} type="submit" disabled={create.isPending || !splitLines(practice).length || !splitLines(observations).length}>{create.isPending ? '正在保存…' : '保存教学调整计划'}</button>
    {create.isSuccess && <Notice>教学调整计划已保存，并关联了起始复核与作答来源。</Notice>}{create.isError && <ErrorBox message={(create.error as Error).message}/>}
  </form>;
}
function AdjustmentProgressEditor({ run, record }: { run: RunData; record: Row }) {
  const [followupNode, setFollowupNode] = useState(String(record.followup_node_id ?? run.nodes.at(-1)?.['节点编号'] ?? ''));
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
  const rows = followupBundle.data?.responses ?? [];
  return <details className={styles.adjustmentRecord}>
    <summary><b>调整计划 · {str(record.planned_activity, '未填写活动')}</b><span>第 {str(record.review_version)} 版复核</span><span>{record.concluded_at ? `已更新 ${String(record.updated_at ?? '')}` : '待记录实施与效果'}</span></summary>
    <div className={styles.adjustmentRecordBody}>
      <p><strong>练习安排：</strong>{Array.isArray(record.planned_practice) ? record.planned_practice.join('；') : '—'}</p>
      <p><strong>观察要点：</strong>{Array.isArray(record.observation_points) ? record.observation_points.join('；') : '—'}</p>
      <div className={styles.adjustmentFormGrid}><label>实施记录<textarea required value={implementation} onChange={event => setImplementation(event.target.value)} rows={3} placeholder="记录实际开展的教学活动"/></label><label>效果观察<textarea required value={outcome} onChange={event => setOutcome(event.target.value)} rows={3} placeholder="记录学生表现和观察到的变化；只写有证据的内容"/></label></div>
      <div className={styles.adjustmentFormGrid}><label>实施状态<select value={implementationStatus} onChange={event => setImplementationStatus(event.target.value)}><option value="not_completed">尚未完成</option><option value="partial">部分完成</option><option value="completed">已完成</option></select></label><label>后续测验节点<select value={followupNode} onChange={event => { setFollowupNode(event.target.value); setSelectedEvidence([]); }}>{run.nodes.map((node, index) => <option key={String(node['节点编号'] ?? index)} value={String(node['节点编号'] ?? '')}>{String(node['节点编号'] ?? '未知节点')} · {String(node['节点名称'] ?? node['模拟测验日期'] ?? '')}</option>)}</select></label></div>
      <fieldset className={styles.followupEvidence}><legend>后续作答证据（必选，{selectedEvidence.length} 条）</legend>{followupBundle.isPending ? <Loading label="读取后续节点作答…"/> : rows.length ? rows.map((row, index) => <label key={String(row.evidence_id ?? index)}><input type="checkbox" checked={selectedEvidence.includes(String(row.record_id))} onChange={event => setSelectedEvidence(current => event.target.checked ? [...new Set([...current, String(row.record_id)])] : current.filter(id => id !== row.record_id))}/><span><b>{str(row.record_id)}</b> · {str(row.material_id)} · {str(row.disposition, '状态未知')}</span></label>) : <small>该学生在此节点没有作答记录；不能填写基于空证据的效果结论。</small>}</fieldset>
      <div className={styles.adjustmentFormGrid}><label>比较口径<select value={comparability} onChange={event => setComparability(event.target.value)}><option value="comparable">可以比较</option><option value="not_comparable">不可比较</option><option value="undetermined">尚不能确定</option></select></label><label>比较说明<input required maxLength={4000} value={comparabilityReason} onChange={event => setComparabilityReason(event.target.value)} placeholder="说明采用的共同题目或不可比原因"/></label></div>
      <label className={styles.adjustmentWideField}>教师结论<textarea required value={conclusion} onChange={event => setConclusion(event.target.value)} rows={3} placeholder="结合所选后续作答证据记录结论与下一步"/></label>
      <div className={styles.adjustmentFormGrid}><label>记录教师<input required maxLength={200} value={reviewer} onChange={event => setReviewer(event.target.value)}/></label><div className={styles.followupSource}><small>后续范围：{str(record.student_id)} · {str(record.indicator_id)} · {followupNode}</small><small>只允许引用此学生、指标和节点的原始作答记录。</small></div></div>
      <button className={styles.adjustmentSubmit} type="button" disabled={update.isPending || !implementation.trim() || !outcome.trim() || !selectedEvidence.length || !comparabilityReason.trim() || !conclusion.trim() || !reviewer.trim()} onClick={() => update.mutate()}>{update.isPending ? '正在保存…' : '保存实施与后续结论'}</button>
      {update.isSuccess && <Notice>实施情况和后续证据已保存，先前版本保留在调整记录历史中。</Notice>}{update.isError && <ErrorBox message={(update.error as Error).message}/>}
    </div>
  </details>;
}
