import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, BookOpen, CircleHelp, ClipboardCheck, Sparkles } from 'lucide-react';
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
    mutationFn: (decision: { status: 'accepted' | 'rejected' | 'needs_observation'; structured_plan?: Row; reviewer?: string; reason?: string }) => api<Row>('/api/review', postJson({
      student_id: selectedStudent, indicator_id: selectedIndicator, status: decision.status,
      diagnosis: str(draft.data?.diagnosis, ''), recommendation: str(draft.data?.recommendation, ''), adjustment_condition: str(draft.data?.adjustment_condition, ''),
      source: draft.data?.source === 'deepseek' ? 'deepseek' : 'rule', model: draft.data?.model ?? null, prompt_version: draft.data?.prompt_version ?? null,
      evidence_record_ids: Array.isArray(draft.data?.evidence_record_ids) ? draft.data.evidence_record_ids : [],
      evidence_refs: responseEvidenceRefs(evidence.data, Array.isArray(draft.data?.evidence_record_ids) ? draft.data.evidence_record_ids.map(String) : []), original_draft: draft.data ?? null, reviewer: decision.reviewer ?? '教师', reason: decision.reason ?? '教师在教学建议页面确认。', structured_plan: decision.structured_plan,
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
  const latestNodeReview = currentNodeReviews.at(-1);
  const acceptedReview = latestNodeReview && (latestNodeReview.status === 'accepted' || latestNodeReview.status === 'edited') ? latestNodeReview : undefined;
  const latestSourceVerification = (verifications.data?.[selectedIndicator] ?? []).at(-1);
  const currentVerifiedMaterials = verifiedMaterials(verifications.data?.[selectedIndicator] ?? []);
  const sourceVerificationCurrent = latestSourceVerification?.status === 'verified' && !latestSourceVerification.stale;
  const acceptedSourceVersions = acceptedReview?.source_verification_versions && typeof acceptedReview.source_verification_versions === 'object' ? acceptedReview.source_verification_versions as Row : {};
  const acceptedSourceIsCurrent = sourceVerificationCurrent && Number(acceptedSourceVersions[selectedIndicator]) === Number(latestSourceVerification?.version);
  const draftEvidenceIds = Array.isArray(draft.data?.evidence_record_ids) ? draft.data.evidence_record_ids.map(String) : [];
  const linkedDraftEvidenceCount = responseEvidenceRefs(evidence.data, draftEvidenceIds).length;
  const canAcceptDraft = isActionableDraft(draft.data) && linkedDraftEvidenceCount === new Set(draftEvidenceIds).size;

  return <div className={styles.pageStack}>
    <StudentQuickSwitch students={run.students} classId={selectedClass} selectedStudent={selectedStudent} search={studentSearch} onSearch={setStudentSearch} onSelect={setStudent} showCurrent showActions={false}/>
    <ScopeSelectors run={run} selectedStudent={selectedStudent} selectedIndicator={selectedIndicator} objectiveName={objectiveName} onStudent={setStudent} onIndicator={setIndicator}/>
    <Notice>以下规则草稿以当前学生、指标和测验节点为范围。请核对证据后再保存教师复核；外部 AI 生成需单独确认数据传输范围。</Notice>
    {draft.isPending ? <Loading label="正在生成规则建议草稿…"/> : draft.data ? <div className={`${styles.teachingColumns} ${styles.studentTeachingFlow}`} data-testid="student-draft-and-evidence">
      <Panel title="学习建议草稿" icon={<Sparkles size={18}/> }>
        <div className={styles.draftFields}><label>诊断依据<p>{str(draft.data.diagnosis)}</p></label><label>建议行动<p>{str(draft.data.recommendation)}</p></label><label>调整条件<p>{str(draft.data.adjustment_condition)}</p></label><label>观察点<p>{str(draft.data.observation_point)}</p></label>
          <div><strong>关联证据</strong><EvidenceRefs ids={Array.isArray(draft.data.evidence_record_ids) ? draft.data.evidence_record_ids.map(String) : []}/></div>
        </div>
        {!isActionableDraft(draft.data) && <Notice tone="warning">当前证据状态不足以支持采纳。可以继续观察或驳回；补齐来源核验与有效作答后再重新生成草稿。</Notice>}
        {isActionableDraft(draft.data) && !canAcceptDraft && <Notice>正在核对所引用作答的来源行；证据范围完整后才能采纳。</Notice>}
        {isActionableDraft(draft.data) && !sourceVerificationCurrent && <Notice tone="warning">采纳方案前请在课程主题页完成当前指标的来源核验。</Notice>}
        {review.isSuccess && <Notice>复核结果已保存。</Notice>}{review.isError && <ErrorBox message={(review.error as Error).message}/>}
        <div className={styles.reviewActions}><button onClick={() => review.mutate({ status: 'needs_observation' })} disabled={review.isPending}><CircleHelp size={15}/>继续观察</button><button className={styles.rejectButton} onClick={() => review.mutate({ status: 'rejected' })} disabled={review.isPending}>拒绝草稿</button></div>
      </Panel>
      <Panel title="证据与资源" icon={<BookOpen size={18}/>}>{evidence.data ? <EvidenceRows bundle={evidence.data}/> : <EmptyState compact title="证据包读取中" detail="建议只使用接口返回的当前范围证据。"/>}<div className={styles.relatedAction}><Link to={{ pathname: routes.studentDiagnosis, search: search }}>返回学生诊断 <ArrowRight size={15}/></Link></div></Panel>
      <div className={styles.studentReviewPlanPanel} data-testid="student-review-plan-panel"><Panel title="教师复核与结构化教学方案" icon={<ClipboardCheck size={18}/> }><ReviewPlanForm key={`${selectedStudent}:${selectedIndicator}:${selectedNode}:${latestSourceVerification?.version ?? 'no-source'}`} materials={currentVerifiedMaterials} defaultActivity={str(draft.data.recommendation, '')} defaultObservation={str(draft.data.observation_point, '')} disabled={review.isPending || !canAcceptDraft || !sourceVerificationCurrent} onAccept={(plan, reviewer, reason) => review.mutate({ status: 'accepted', structured_plan: plan, reviewer, reason })}/></Panel></div>
    </div> : <ErrorBox message={(draft.error as Error | null)?.message ?? '无法生成建议草稿'}/>}
    <AIAnalysisPanel key={`${run.run_id}:${selectedStudent}:${selectedIndicator}:${selectedNode}`} runId={run.run_id} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode}/>
    {reviews.isPending || adjustments.isPending || teacherCases.isPending ? <Loading label="读取教师复核与案例记录…"/> : reviews.isError ? <ErrorBox message={(reviews.error as Error).message}/> : adjustments.isError ? <ErrorBox message={(adjustments.error as Error).message}/> : teacherCases.isError ? <ErrorBox message={(teacherCases.error as Error).message}/> : <><StudentAdjustmentWorkflow run={run} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode} review={acceptedReview} latestReview={latestNodeReview} evidence={evidence.data} adjustments={(adjustments.data ?? []).filter(row => row.student_id === selectedStudent && row.indicator_id === selectedIndicator)} /><TeacherCaseForm key={`${run.run_id}:${selectedStudent}:${selectedIndicator}:${selectedNode}:${acceptedReview?.version ?? 'pending'}`} runId={run.run_id} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode} review={acceptedReview} evidence={evidence.data} currentCase={teacherCases.data?.[selectedStudent]?.at(-1)} sourceVerified={acceptedSourceIsCurrent} pending={saveTeacherCase.isPending} onSave={payload => saveTeacherCase.mutate(payload)}/>{saveTeacherCase.isError && <ErrorBox message={(saveTeacherCase.error as Error).message}/>}</>}
  </div>;
}

function isActionableDraft(draft: Row | undefined) {
  return draft?.unknown_reason === null
    && Array.isArray(draft.evidence_record_ids)
    && draft.evidence_record_ids.length > 0;
}

function verifiedMaterials(history: Row[]) {
  const latest = history.at(-1);
  return latest?.status === 'verified' && !latest.stale && Array.isArray(latest.material_ids) ? latest.material_ids.map(String) : [];
}
