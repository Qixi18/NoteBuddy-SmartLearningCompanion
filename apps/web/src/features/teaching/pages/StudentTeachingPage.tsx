import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorBox, Loading, Notice, Panel } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import {
  api, postJson, useDraft, useEvidenceBundle, useReviews, useSourceVerifications,
  useStudentInsights, useTeacherCases, useTeachingAdjustments,
} from '../api';
import { AIAnalysisPanel } from '../components/AIAnalysisPanel';
import { LearningEvidencePanel } from '../components/LearningEvidencePanel';
import { PersonalizedLearningPath } from '../components/PersonalizedLearningPath';
import { RepresentativeCaseStatus } from '../components/RepresentativeCaseStatus';
import { ReviewHistoryPanel } from '../components/ReviewHistoryPanel';
import { StudentAdjustmentWorkflow } from '../components/StudentAdjustmentWorkflow';
import { StudentLearningSummary } from '../components/StudentLearningSummary';
import { TeacherCaseForm } from '../components/TeacherCaseForm';
import { TeachingPlanReviewEditor } from '../components/TeachingPlanReviewEditor';
import { ScopeSelectors } from '../../diagnosis/components/ScopeSelectors';
import { StudentQuickSwitch } from '../../diagnosis/components/StudentQuickSwitch';
import { useWorkbenchScope } from '../../shared/useWorkbenchScope';
import { objectiveLabel, str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import type { Bundle } from '../../shared/workbenchTypes';
import type { Draft, PlanStatus, StudentInsights, TeachingPlanV2 } from '../types';
import { asTeachingPlan, isCoveragePlan, planResponseRecordIds } from '../types';
import styles from './StudentTeachingPage.module.css';
import shared from '../../shared/WorkbenchPages.module.css';

/**
 * 学生个性化学习建议的页面编排层。
 * 这里只负责取数、范围与审核动作，展示细节交给各业务组件。
 */
export function StudentTeachingPage() {
  const { run, runQuery, scope, search, setIndicator, setStudent } = useWorkbenchScope();
  const [studentSearch, setStudentSearch] = useState('');
  const queryClient = useQueryClient();
  const selectedStudent = scope.studentId || String(run?.students.find(item => String(item['模拟班级编号'] ?? '') === scope.classId)?.['学生编号'] ?? run?.students[0]?.['学生编号'] ?? '');
  const selectedIndicator = scope.indicatorId || String(run?.objectives[0]?.['指标编号'] ?? '');
  const selectedNode = scope.nodeId || String(run?.nodes[0]?.['节点编号'] ?? '');
  const selectedClass = scope.classId || String(run?.students[0]?.['模拟班级编号'] ?? '');
  const runId = run?.run_id ?? '';
  const enabled = Boolean(run && selectedStudent && selectedIndicator && selectedNode);

  const evidence = useEvidenceBundle(runId, selectedNode, selectedStudent, selectedIndicator, enabled);
  const draftQuery = useDraft(runId, selectedNode, selectedStudent, selectedIndicator, enabled);
  const insights = useStudentInsights(runId, selectedNode, selectedStudent, selectedIndicator, enabled);
  const verifications = useSourceVerifications(runId);
  const reviews = useReviews(runId);
  const teacherCases = useTeacherCases(runId);
  const adjustments = useTeachingAdjustments(runId, selectedStudent);

  const review = useMutation({
    mutationFn: (decision: { status: 'accepted' | 'edited' | 'rejected' | 'needs_observation'; plan?: TeachingPlanV2; reviewer: string; reason: string }) => api<Row>('/api/review', postJson({
      student_id: selectedStudent,
      indicator_id: selectedIndicator,
      status: decision.status,
      diagnosis: str(draftQuery.data?.diagnosis, ''),
      recommendation: str(draftQuery.data?.recommendation, ''),
      adjustment_condition: str(draftQuery.data?.adjustment_condition, ''),
      source: draftQuery.data?.source === 'deepseek' ? 'deepseek' : 'rule',
      model: draftQuery.data?.model ?? null,
      prompt_version: draftQuery.data?.prompt_version ?? null,
      evidence_record_ids: decision.plan ? planResponseRecordIds(decision.plan) : (Array.isArray(draftQuery.data?.evidence_record_ids) ? draftQuery.data.evidence_record_ids : []),
      evidence_refs: [],
      original_draft: draftQuery.data ?? null,
      reviewer: decision.reviewer,
      reason: decision.reason,
      structured_plan: null,
      teaching_plan_v2: decision.plan,
    })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
  const saveTeacherCase = useMutation({
    mutationFn: (payload: Row) => api<Row>('/api/teacher-case', postJson(payload)),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['teacher-cases'] }); },
  });

  if (runQuery.isPending) return <Loading/>;
  if (!run) return <EmptyState title="当前没有分析运行" detail="请先在教学工作台导入课程与学情数据。" action={<Link className={shared.linkButton} to={routes.dashboard}>前往教学工作台 <ArrowRight size={15}/></Link>}/>;

  const draft = draftQuery.data as unknown as Draft | undefined;
  const bundle = evidence.data as unknown as Bundle | undefined;
  const plan = asTeachingPlan(draft?.teaching_plan_preview);
  const selection = draft?.resource_selection ?? null;
  const planStatus: PlanStatus = draft?.plan_status ?? 'blocked';
  const objectiveRow = run.objectives.find(row => String(row['指标编号'] ?? '') === selectedIndicator);
  const objectiveName = (id: string) => objectiveLabel(run.objectives, id);
  const currentNodeReviews = (reviews.data?.[`${selectedStudent}:${selectedIndicator}`] ?? [])
    .filter(row => row.node_id === selectedNode)
    .sort((a, b) => Number(a.version) - Number(b.version));
  const latestNodeReview = currentNodeReviews.at(-1);
  const acceptedReview = latestNodeReview && (latestNodeReview.status === 'accepted' || latestNodeReview.status === 'edited') ? latestNodeReview : undefined;
  const latestSourceVerification = (verifications.data?.[selectedIndicator] ?? []).at(-1);
  const sourceVerificationCurrent = latestSourceVerification?.status === 'verified' && !latestSourceVerification.stale;
  const acceptedSourceVersions = acceptedReview?.source_verification_versions && typeof acceptedReview.source_verification_versions === 'object' ? acceptedReview.source_verification_versions as Row : {};
  const acceptedSourceIsCurrent = sourceVerificationCurrent && Number(acceptedSourceVersions[selectedIndicator]) === Number(latestSourceVerification?.version);
  const draftRecordIds = new Set(Array.isArray(draft?.evidence_record_ids) ? draft!.evidence_record_ids.map(String) : []);
  const coveragePlan = isCoveragePlan(plan);
  const planSourceCurrent = Boolean(plan && latestSourceVerification && plan.source_versions?.[selectedIndicator] === Number(latestSourceVerification.version));
  const responseRefsInDraft = Boolean(plan && plan.evidence_refs.filter(ref => ref.kind === 'response').every(ref => draftRecordIds.has(ref.record_id)));
  const canAccept = Boolean(plan && planStatus === 'ready' && sourceVerificationCurrent && planSourceCurrent && (coveragePlan || responseRefsInDraft));
  const acceptBlocker = !plan ? ''
    : planStatus !== 'ready' ? `当前方案状态为「${planStatus}」，补齐前置条件后重新生成。`
      : !sourceVerificationCurrent ? '当前指标的来源核验已失效，请先在课程主题页重新核验。'
        : !planSourceCurrent ? '方案绑定的来源签核版本已变化，请重新生成方案后再审核。'
          : !responseRefsInDraft ? '方案引用的作答记录超出原草稿证据范围，请重新生成方案。' : '';

  return <div className={styles.pageStack}>
    <StudentQuickSwitch students={run.students} classId={selectedClass} selectedStudent={selectedStudent} search={studentSearch} onSearch={setStudentSearch} onSelect={setStudent} showCurrent showActions={false}/>
    <ScopeSelectors run={run} selectedStudent={selectedStudent} selectedIndicator={selectedIndicator} objectiveName={objectiveName} onStudent={setStudent} onIndicator={setIndicator}/>
    <div className={styles.relatedLinks}>
      <Notice>页面只使用当前学生、指标和测验节点的证据生成方案；外部 AI 分析需单独确认数据传输范围。</Notice>
      <Link to={{ pathname: routes.studentDiagnosis, search }}>返回学生诊断 <ArrowRight size={15}/></Link>
    </div>
    <StudentLearningSummary run={run} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode} objectiveName={objectiveName(selectedIndicator)} draft={draft}/>

    {draftQuery.isPending ? <Loading label="正在生成规则建议草稿…"/> : draftQuery.isError ? <ErrorBox message={(draftQuery.error as Error).message}/> : <>
      <div className={styles.workspaceGrid} data-testid="student-draft-and-evidence">
        <div className={styles.mainColumn}>
          <PersonalizedLearningPath plan={plan} selection={selection} status={planStatus} error={draft?.teaching_plan_preview_error} draft={draft}/>
        </div>
        <aside className={styles.sideColumn}>
          <LearningEvidencePanel draft={draft} bundle={bundle} objective={objectiveRow} insights={insights.data as unknown as StudentInsights | undefined}/>
          <ReviewHistoryPanel rows={currentNodeReviews} studentId={selectedStudent} nodeId={selectedNode}/>
          <RepresentativeCaseStatus cases={teacherCases.data} selectedStudent={selectedStudent}/>
        </aside>
      </div>

      <div className={styles.fullWidthPanel} data-testid="student-review-plan-panel">
        <Panel title="教师复核与个性化方案" icon={<ClipboardCheck size={18}/>} action={<span className={shared.muted}>审核结论会按版本保留，不覆盖历史</span>}>
          {plan ? <>
            <TeachingPlanReviewEditor
              key={`${selectedStudent}:${selectedIndicator}:${selectedNode}:${plan.evidence_fingerprint}:${latestSourceVerification?.version ?? 'no-source'}`}
              plan={plan}
              selection={selection}
              disabled={review.isPending}
              canAccept={canAccept}
              blocker={acceptBlocker}
              onSave={(status, editedPlan, reviewer, reason) => review.mutate({ status, plan: editedPlan, reviewer, reason })}
              onOtherDecision={(status, reviewer, reason) => review.mutate({ status, reviewer, reason })}
            />
            {review.isSuccess && <Notice>教师复核已保存。</Notice>}
            {review.isError && <ErrorBox message={(review.error as Error).message}/>}
          </> : <>
            <Notice tone="warning">
              {str(draft?.teaching_plan_preview_error, '当前没有可供教师复核的 V2 方案。请先补齐节点、评分或来源条件后重新生成。')}
            </Notice>
            <BlockedPlanDecision disabled={review.isPending} onDecide={(status, reviewer, reason) => review.mutate({ status, reviewer, reason })}/>
            {review.isSuccess && <Notice>复核结果已保存。</Notice>}
            {review.isError && <ErrorBox message={(review.error as Error).message}/>}
          </>}
        </Panel>
      </div>

      {(reviews.isPending || adjustments.isPending || teacherCases.isPending) ? <Loading label="读取教师复核与案例记录…"/>
        : reviews.isError ? <ErrorBox message={(reviews.error as Error).message}/>
          : adjustments.isError ? <ErrorBox message={(adjustments.error as Error).message}/>
            : teacherCases.isError ? <ErrorBox message={(teacherCases.error as Error).message}/>
              : <>
                <StudentAdjustmentWorkflow
                  run={run}
                  studentId={selectedStudent}
                  indicatorId={selectedIndicator}
                  nodeId={selectedNode}
                  review={acceptedReview}
                  latestReview={latestNodeReview}
                  evidence={bundle}
                  adjustments={(adjustments.data ?? []).filter(row => row.student_id === selectedStudent && row.indicator_id === selectedIndicator)}
                />
                <TeacherCaseForm
                  key={`${run.run_id}:${selectedStudent}:${selectedIndicator}:${selectedNode}:${acceptedReview?.version ?? 'pending'}`}
                  runId={run.run_id}
                  studentId={selectedStudent}
                  indicatorId={selectedIndicator}
                  nodeId={selectedNode}
                  review={acceptedReview}
                  evidence={bundle}
                  currentCase={teacherCases.data?.[selectedStudent]?.at(-1)}
                  sourceVerified={acceptedSourceIsCurrent}
                  pending={saveTeacherCase.isPending}
                  onSave={payload => saveTeacherCase.mutate(payload)}
                />
                {saveTeacherCase.isError && <ErrorBox message={(saveTeacherCase.error as Error).message}/>}
              </>}

      <AIAnalysisPanel key={`${run.run_id}:${selectedStudent}:${selectedIndicator}:${selectedNode}`} runId={run.run_id} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode}/>
    </>}
  </div>;
}

/** 没有可审核方案时的教师决定：继续观察或驳回也必须留下教师与理由。 */
function BlockedPlanDecision({ disabled, onDecide }: {
  disabled: boolean;
  onDecide: (status: 'rejected' | 'needs_observation', reviewer: string, reason: string) => void;
}) {
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const complete = Boolean(reviewer.trim() && reason.trim());
  return <>
    <div className={styles.editorRow2}>
      <label className={styles.editorField}><span>复核教师</span>
        <input required maxLength={200} aria-label="复核教师" value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="教师姓名"/>
      </label>
      <label className={styles.editorField}><span>复核理由</span>
        <input required maxLength={4000} aria-label="复核理由" value={reason} onChange={event => setReason(event.target.value)} placeholder="说明为何继续观察或驳回"/>
      </label>
    </div>
    <div className={styles.editorActions}>
      <button type="button" disabled={disabled || !complete} onClick={() => onDecide('needs_observation', reviewer.trim(), reason.trim())}>继续观察</button>
      <button className={styles.rejectAction} type="button" disabled={disabled || !complete} onClick={() => onDecide('rejected', reviewer.trim(), reason.trim())}>拒绝方案</button>
    </div>
    {!complete && <p className={styles.editorHint}>继续观察或驳回也需要填写复核教师与理由。</p>}
  </>;
}
