import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, BookOpen, ClipboardCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorBox, Loading, Notice, Panel } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import { api, postJson, useReviews, useSourceVerifications, useTeacherCases, useTeachingAdjustments } from '../api';
import { AIAnalysisPanel } from '../components/AIAnalysisPanel';
import { ReviewPlanForm } from '../components/ReviewPlanForm';
import { StudentAdjustmentWorkflow } from '../components/StudentAdjustmentWorkflow';
import { TeacherCaseForm } from '../components/TeacherCaseForm';
import { EvidenceRefs } from '../../diagnosis/components/EvidenceRefs';
import { EvidenceRows } from '../../diagnosis/components/EvidenceRows';
import { ScopeSelectors } from '../../diagnosis/components/ScopeSelectors';
import { StudentQuickSwitch } from '../../diagnosis/components/StudentQuickSwitch';
import { useWorkbenchScope } from '../../shared/useWorkbenchScope';
import { objectiveLabel, responseEvidenceRefs, str } from '../../shared/workbenchTypes';
import type { Bundle, Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function StudentTeachingPage() {
  const { run, runQuery, scope, search, setIndicator, setStudent } = useWorkbenchScope();
  const [studentSearch, setStudentSearch] = useState('');
  const queryClient = useQueryClient();
  const selectedStudent = scope.studentId || String(run?.students.find(item => String(item['模拟班级编号'] ?? '') === scope.classId)?.['学生编号'] ?? run?.students[0]?.['学生编号'] ?? '');
  const selectedIndicator = scope.indicatorId || String(run?.objectives[0]?.['指标编号'] ?? '');
  const selectedNode = scope.nodeId || String(run?.nodes[0]?.['节点编号'] ?? '');
  const selectedClass = scope.classId || String(run?.students[0]?.['模拟班级编号'] ?? '');
  const evidence = useQuery({
    queryKey: ['evidence-bundle', run?.run_id, selectedNode, selectedStudent, selectedIndicator],
    queryFn: () => api<Bundle>(`/api/evidence-bundle?student=${encodeURIComponent(selectedStudent)}&indicator=${encodeURIComponent(selectedIndicator)}&node=${encodeURIComponent(selectedNode)}`),
    enabled: Boolean(run && selectedStudent && selectedIndicator && selectedNode),
  });
  const draft = useQuery({
    queryKey: ['draft', run?.run_id, selectedStudent, selectedIndicator, selectedNode],
    queryFn: () => api<Row>(`/api/draft?student=${encodeURIComponent(selectedStudent)}&indicator=${encodeURIComponent(selectedIndicator)}&node=${encodeURIComponent(selectedNode)}`),
    enabled: Boolean(run && selectedStudent && selectedIndicator && selectedNode),
  });
  const verifications = useSourceVerifications(run?.run_id ?? '');
  const reviews = useReviews(run?.run_id ?? '');
  const teacherCases = useTeacherCases(run?.run_id ?? '');
  const adjustments = useTeachingAdjustments(run?.run_id ?? '', selectedStudent);
  const review = useMutation({
    mutationFn: (decision: { status: 'accepted' | 'edited' | 'rejected' | 'needs_observation'; teaching_plan_v2?: Row; reviewer?: string; reason?: string }) => api<Row>('/api/review', postJson({
      student_id: selectedStudent, indicator_id: selectedIndicator, status: decision.status,
      diagnosis: str(draft.data?.diagnosis, ''), recommendation: str(draft.data?.recommendation, ''), adjustment_condition: str(draft.data?.adjustment_condition, ''),
      source: draft.data?.source === 'deepseek' ? 'deepseek' : 'rule', model: draft.data?.model ?? null, prompt_version: draft.data?.prompt_version ?? null,
      evidence_record_ids: Array.isArray(draft.data?.evidence_record_ids) ? draft.data.evidence_record_ids : [],
      evidence_refs: [], original_draft: draft.data ?? null, reviewer: decision.reviewer ?? '教师', reason: decision.reason ?? '教师在教学建议页面确认。', teaching_plan_v2: decision.teaching_plan_v2,
    })),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['reviews'] }); },
  });
  const saveTeacherCase = useMutation({
    mutationFn: (payload: Row) => api<Row>('/api/teacher-case', postJson(payload)),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['teacher-cases'] }); },
  });

  if (runQuery.isPending) return <Loading/>;
  if (!run) return <EmptyState title="当前没有分析运行" detail="请先在教学工作台导入课程与学情数据。" action={<Link className={styles.linkButton} to={routes.dashboard}>前往教学工作台 <ArrowRight size={15}/></Link>}/>;

  const objectiveName = (id: string) => objectiveLabel(run.objectives, id);
  const currentNodeReviews = (reviews.data?.[`${selectedStudent}:${selectedIndicator}`] ?? []).filter(row => row.node_id === selectedNode).sort((a, b) => Number(a.version) - Number(b.version));
  const confirmedCaseCount = Object.values(teacherCases.data ?? {}).filter(rows => rows.length && rows.at(-1)?.status === 'confirmed').length;
  const latestNodeReview = currentNodeReviews.at(-1);
  const acceptedReview = latestNodeReview && (latestNodeReview.status === 'accepted' || latestNodeReview.status === 'edited') ? latestNodeReview : undefined;
  const latestSourceVerification = (verifications.data?.[selectedIndicator] ?? []).at(-1);
  const sourceVerificationCurrent = latestSourceVerification?.status === 'verified' && !latestSourceVerification.stale;
  const acceptedSourceVersions = acceptedReview?.source_verification_versions && typeof acceptedReview.source_verification_versions === 'object' ? acceptedReview.source_verification_versions as Row : {};
  const acceptedSourceIsCurrent = sourceVerificationCurrent && Number(acceptedSourceVersions[selectedIndicator]) === Number(latestSourceVerification?.version);
  const draftEvidenceIds = Array.isArray(draft.data?.evidence_record_ids) ? draft.data.evidence_record_ids.map(String) : [];
  const linkedDraftEvidenceCount = responseEvidenceRefs(evidence.data, draftEvidenceIds).length;
  const plan = draft.data?.teaching_plan_preview && typeof draft.data.teaching_plan_preview === 'object' ? draft.data.teaching_plan_preview as Row : undefined;
  const coveragePlan = Boolean(plan && Array.isArray(plan.evidence_refs) && plan.evidence_refs.length && (plan.evidence_refs as Row[]).every(ref => ref.kind === 'coverage'));
  const canAcceptDraft = Boolean(plan && draft.data?.plan_status === 'ready' && (coveragePlan || (isActionableDraft(draft.data) && linkedDraftEvidenceCount === new Set(draftEvidenceIds).size)));

  return <div className={styles.pageStack}>
    <StudentQuickSwitch students={run.students} classId={selectedClass} selectedStudent={selectedStudent} search={studentSearch} onSearch={setStudentSearch} onSelect={setStudent} showCurrent showActions={false}/>
    <ScopeSelectors run={run} selectedStudent={selectedStudent} selectedIndicator={selectedIndicator} objectiveName={objectiveName} onStudent={setStudent} onIndicator={setIndicator}/>
    <Notice>以下规则草稿以当前学生、指标和测验节点为范围。请核对证据后再保存教师复核；外部 AI 生成需单独确认数据传输范围。</Notice>
    {draft.isPending ? <Loading label="正在生成规则建议草稿…"/> : draft.data ? <div className={`${styles.teachingColumns} ${styles.studentTeachingFlow}`} data-testid="student-draft-and-evidence">
      <Panel title="学习建议草稿" icon={<Sparkles size={18}/> }>
        <div className={styles.draftFields}><label>学生与范围<p>{selectedStudent} · {objectiveName(selectedIndicator)} · {selectedNode}</p></label><label>观察事实<p>{str(draft.data.observed_fact, str(draft.data.diagnosis))}</p></label><label>推断边界<p>{str(draft.data.inference_limit, '仅依据当前可核验记录，不补造学习事实。')}</p></label><label>建议行动<p>{str(draft.data.recommendation)}</p></label><label>草稿状态<p>{str(draft.data.plan_status)}{draft.data.teaching_plan_preview_error ? ` · ${String(draft.data.teaching_plan_preview_error)}` : ''}</p></label>
          <div><strong>关联证据</strong><EvidenceRefs ids={Array.isArray(draft.data.evidence_record_ids) ? draft.data.evidence_record_ids.map(String) : []}/></div>
          {Boolean(draft.data.resource_selection) && <section className={styles.planResources}><strong>匹配资源</strong>{(['practice_items', 'learning_resources'] as const).map(group => <div key={group}><b>{group === 'practice_items' ? '节点内练习' : '学习材料'}</b>{(Array.isArray((draft.data.resource_selection as Row)[group]) ? (draft.data.resource_selection as Row)[group] as Row[] : []).map(item => <p key={String(item.material_id)}>{String(item.title || item.material_id)} · {String(item.reason)}{Array.isArray(item.reason_details) ? ` · ${(item.reason_details as Row[]).map(detail => String(detail.description ?? '')).filter(Boolean).join('；')}` : ''}</p>)}</div>)}</section>}
        </div>
        {!isActionableDraft(draft.data) && <Notice tone="warning">当前证据状态不足以支持采纳。可以继续观察或驳回；补齐来源核验与有效作答后再重新生成草稿。</Notice>}
        {draft.data.plan_status === 'requires_scoring' && <Notice tone="warning">存在待评分记录；完成评分后才能生成个性化方案。</Notice>}
        {draft.data.plan_status === 'requires_source_verification' && <Notice tone="warning">请先核验当前指标的课程与教材来源。</Notice>}
        {isActionableDraft(draft.data) && !canAcceptDraft && <Notice>正在核对方案引用的作答来源；证据范围完整后才能采纳。</Notice>}
        {isActionableDraft(draft.data) && !sourceVerificationCurrent && <Notice tone="warning">采纳方案前请在课程主题页完成当前指标的来源核验。</Notice>}
        {review.isSuccess && <Notice>教师复核已保存。</Notice>}{review.isError && <ErrorBox message={(review.error as Error).message}/>}
        {!plan && <div className={styles.reviewActions}><button onClick={() => review.mutate({ status: 'needs_observation', reviewer: '教师', reason: '当前条件不足以形成个性化方案，转入补充观察。' })} disabled={review.isPending}>继续观察</button><button className={styles.rejectButton} onClick={() => review.mutate({ status: 'rejected', reviewer: '教师', reason: '教师核对后拒绝当前规则草稿。' })} disabled={review.isPending}>拒绝方案</button></div>}
        {review.isSuccess && <Notice>复核结果已保存。</Notice>}{review.isError && <ErrorBox message={(review.error as Error).message}/>}
      </Panel>
      <Panel title="证据与资源" icon={<BookOpen size={18}/>}>{evidence.data ? <EvidenceRows bundle={evidence.data}/> : <EmptyState compact title="证据包读取中" detail="建议只使用接口返回的当前范围证据。"/>}<div className={styles.relatedAction}><Link to={{ pathname: routes.studentDiagnosis, search: search }}>返回学生诊断 <ArrowRight size={15}/></Link></div></Panel>
      <div className={styles.studentReviewPlanPanel} data-testid="student-review-plan-panel"><Panel title="教师复核与个性化方案" icon={<ClipboardCheck size={18}/> }>{plan ? <ReviewPlanForm key={`${selectedStudent}:${selectedIndicator}:${selectedNode}:${latestSourceVerification?.version ?? 'no-source'}:${String(plan.template_version ?? '')}`} plan={plan} disabled={review.isPending || !canAcceptDraft || !sourceVerificationCurrent} onSave={(status, teaching_plan_v2, reviewer, reason) => review.mutate({ status, teaching_plan_v2, reviewer, reason })} onOtherDecision={(status, reviewer, reason) => review.mutate({ status, reviewer, reason })}/> : <Notice tone="warning">当前没有可供教师复核的 V2 方案。先补齐节点、评分或来源条件后重新生成。</Notice>}</Panel></div>
    </div> : <ErrorBox message={(draft.error as Error | null)?.message ?? '无法生成建议草稿'}/>}
    <AIAnalysisPanel key={`${run.run_id}:${selectedStudent}:${selectedIndicator}:${selectedNode}`} runId={run.run_id} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode}/>
    {reviews.isPending || adjustments.isPending || teacherCases.isPending ? <Loading label="读取教师复核与案例记录…"/> : reviews.isError ? <ErrorBox message={(reviews.error as Error).message}/> : adjustments.isError ? <ErrorBox message={(adjustments.error as Error).message}/> : teacherCases.isError ? <ErrorBox message={(teacherCases.error as Error).message}/> : <><StudentAdjustmentWorkflow run={run} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode} review={acceptedReview} latestReview={latestNodeReview} evidence={evidence.data} adjustments={(adjustments.data ?? []).filter(row => row.student_id === selectedStudent && row.indicator_id === selectedIndicator)} /><TeacherCaseForm key={`${run.run_id}:${selectedStudent}:${selectedIndicator}:${selectedNode}:${acceptedReview?.version ?? 'pending'}`} runId={run.run_id} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode} review={acceptedReview} evidence={evidence.data} currentCase={teacherCases.data?.[selectedStudent]?.at(-1)} sourceVerified={acceptedSourceIsCurrent} pending={saveTeacherCase.isPending} onSave={payload => saveTeacherCase.mutate(payload)}/>{saveTeacherCase.isError && <ErrorBox message={(saveTeacherCase.error as Error).message}/>}<Panel title="复核历史与案例进度" icon={<ClipboardCheck size={18}/>}><div className={styles.reviewHistoryHeader}><b>{selectedStudent} · {selectedNode}</b><span>当前运行已确认代表案例 {confirmedCaseCount} 个</span></div>{currentNodeReviews.length ? <ol className={styles.reviewHistory}>{currentNodeReviews.map(row => <li key={String(row.version)}><strong>第 {str(row.version)} 版 · {str(row.status)}</strong><span>{str(row.reviewer, '未填写教师')} · {str(row.reason, '未填写复核理由')}</span><small>证据：{Array.isArray(row.evidence_refs) ? (row.evidence_refs as Row[]).map(ref => ref.kind === 'coverage' ? '范围覆盖' : String(ref.record_id)).join('、') : '—'}</small></li>)}</ol> : <Notice>当前节点暂无教师复核历史。</Notice>}</Panel></>}
  </div>;
}

function isActionableDraft(draft: Row | undefined) {
  return draft?.unknown_reason === null
    && Array.isArray(draft.evidence_record_ids)
    && draft.evidence_record_ids.length > 0;
}
