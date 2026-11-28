import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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
import { StudentMetricOverview } from '../components/StudentMetricOverview';
import { TeacherCaseForm } from '../components/TeacherCaseForm';
import { TeachingPlanReviewEditor } from '../components/TeachingPlanReviewEditor';
import { ScopeSelectors } from '../../diagnosis/components/ScopeSelectors';
import { StudentScoreBars } from '../../diagnosis/components/StudentScoreBars';
import { StudentQuickSwitch } from '../../diagnosis/components/StudentQuickSwitch';
import { useWorkbenchScope } from '../../shared/useWorkbenchScope';
import { objectiveLabel, str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import type { Bundle } from '../../shared/workbenchTypes';
import type { Draft, PlanStatus, StudentInsights, TeachingPlanV2 } from '../types';
import { asTeachingPlan, isCoveragePlan, planResponseRecordIds } from '../types';
import styles from './StudentTeachingPage.module.css';
import shared from '../../shared/WorkbenchPages.module.css';

const SECTIONS = [
  { id: 'student-overview', label: '学习总览' },
  { id: 'student-evidence', label: '诊断证据' },
  { id: 'student-plan', label: '个性化方案' },
  { id: 'student-review', label: '教师审核' },
  { id: 'student-tracking', label: '实施追踪' },
  { id: 'student-export', label: '案例导出' },
] as const;

type PageStateTone = 'green' | 'amber';

type PageState = {
  key: 'scope' | 'source' | 'scoring' | 'blocked' | 'review' | 'accepted' | 'accepted_stale';
  label: string;
  tone: PageStateTone;
  detail: string;
};

/**
 * 页面唯一的业务状态来源。
 * 顶部范围、学习总览、方案章节与教师审核模块都从这里取标签，避免同一页出现两套判断。
 */
function resolvePageState(options: {
  planStatus: PlanStatus;
  hasDraftPlan: boolean;
  acceptedIsCurrent: boolean;
  acceptedIsStale: boolean;
}): PageState {
  const { planStatus, hasDraftPlan, acceptedIsCurrent, acceptedIsStale } = options;
  if (acceptedIsCurrent) {
    return {
      key: 'accepted',
      label: '方案已采纳',
      tone: 'green',
      detail: '教师已采纳当前有效版本，可以进入教学实施与效果观察。',
    };
  }
  if (acceptedIsStale) {
    return {
      key: 'accepted_stale',
      label: '已采纳方案已失效',
      tone: 'amber',
      detail: '来源或证据已经变化，此前采纳的方案只保留在历史记录中。',
    };
  }
  if (planStatus === 'requires_source_verification') {
    return {
      key: 'source',
      label: '等待来源核验',
      tone: 'amber',
      detail: '当前指标来源尚未核验或已失效，正式方案暂不可生成。',
    };
  }
  if (planStatus === 'requires_scoring') {
    return {
      key: 'scoring',
      label: '等待完成评分',
      tone: 'amber',
      detail: '当前范围存在待评分记录，完成评分后才能生成方案。',
    };
  }
  if (planStatus === 'requires_scope_selection') {
    return {
      key: 'scope',
      label: '等待选择测验节点',
      tone: 'amber',
      detail: '请先选择单一测验节点，页面不会合并不同节点的证据。',
    };
  }
  if (hasDraftPlan) {
    return {
      key: 'review',
      label: '待教师审核',
      tone: 'amber',
      detail: '规则方案已经生成，请核对证据与材料后由教师审核。',
    };
  }
  return {
    key: 'blocked',
    label: '方案条件不足',
    tone: 'amber',
    detail: '当前证据组合不足，请查看下方方案章节中的具体原因。',
  };
}

/**
 * 学生个性化学习建议的页面编排层。
 * 负责范围、数取与页面状态；各章节内部细节交给业务组件。
 */
export function StudentTeachingPage() {
  const { run, runQuery, scope, search, setIndicator, setStudent } = useWorkbenchScope();
  const [studentSearch, setStudentSearch] = useState('');
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reviews'] }),
        queryClient.invalidateQueries({ queryKey: ['teacher-cases'] }),
        queryClient.invalidateQueries({ queryKey: ['teaching-adjustments'] }),
      ]);
    },
  });
  const saveTeacherCase = useMutation({
    mutationFn: (payload: Row) => api<Row>('/api/teacher-case', postJson(payload)),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['teacher-cases'] }); },
  });

  const draft = draftQuery.data as unknown as Draft | undefined;
  const bundle = evidence.data as unknown as Bundle | undefined;
  const draftPlan = asTeachingPlan(draft?.teaching_plan_preview);
  const selection = draft?.resource_selection ?? null;
  const planStatus: PlanStatus = draft?.plan_status ?? 'blocked';
  const objectiveRow = run?.objectives.find(row => String(row['指标编号'] ?? '') === selectedIndicator);
  const objectiveName = (id: string) => objectiveLabel(run?.objectives ?? [], id);
  const currentNodeReviews = (reviews.data?.[`${selectedStudent}:${selectedIndicator}`] ?? [])
    .filter(row => row.node_id === selectedNode)
    .sort((a, b) => Number(a.version) - Number(b.version));
  const latestNodeReview = currentNodeReviews.at(-1);
  const acceptedReview = latestNodeReview && (latestNodeReview.status === 'accepted' || latestNodeReview.status === 'edited') ? latestNodeReview : undefined;
  const acceptedPlan = asTeachingPlan(acceptedReview?.teaching_plan_v2);
  const latestSourceVerification = (verifications.data?.[selectedIndicator] ?? []).at(-1);
  const sourceVerificationCurrent = latestSourceVerification?.status === 'verified' && !latestSourceVerification.stale;
  const acceptedSourceVersions = acceptedReview?.source_verification_versions && typeof acceptedReview.source_verification_versions === 'object' ? acceptedReview.source_verification_versions as Row : {};
  const acceptedSourceIsCurrent = sourceVerificationCurrent && Number(acceptedSourceVersions[selectedIndicator]) === Number(latestSourceVerification?.version);
  const acceptedScopeIsCurrent = Boolean(acceptedPlan
    && acceptedPlan.scope.run_id === runId
    && acceptedPlan.scope.student_id === selectedStudent
    && acceptedPlan.scope.indicator_id === selectedIndicator
    && acceptedPlan.scope.node_id === selectedNode);
  const bundleFingerprint = typeof bundle?.fingerprint === 'string' ? bundle.fingerprint : '';
  const acceptedFingerprintIsCurrent = !bundleFingerprint || !acceptedPlan || acceptedPlan.evidence_fingerprint === bundleFingerprint;
  const acceptedReviewIsCurrent = Boolean(acceptedReview && acceptedPlan && acceptedScopeIsCurrent && acceptedSourceIsCurrent && acceptedFingerprintIsCurrent);
  const acceptedReviewIsStale = Boolean(acceptedReview && acceptedPlan && !acceptedReviewIsCurrent);
  const effectivePlan = acceptedReviewIsCurrent ? acceptedPlan : null;
  const displayPlan = effectivePlan ?? draftPlan;
  const planOrigin: 'accepted' | 'draft' | null = effectivePlan ? 'accepted' : draftPlan ? 'draft' : null;
  const draftRecordIds = new Set(Array.isArray(draft?.evidence_record_ids) ? draft!.evidence_record_ids.map(String) : []);
  const coveragePlan = isCoveragePlan(draftPlan);
  const planSourceCurrent = Boolean(draftPlan && latestSourceVerification && draftPlan.source_versions?.[selectedIndicator] === Number(latestSourceVerification.version));
  const responseRefsInDraft = Boolean(draftPlan && draftPlan.evidence_refs.filter(ref => ref.kind === 'response').every(ref => draftRecordIds.has(ref.record_id)));
  const canAccept = Boolean(draftPlan && planStatus === 'ready' && sourceVerificationCurrent && planSourceCurrent && (coveragePlan || responseRefsInDraft));
  const acceptBlocker = !draftPlan ? ''
    : planStatus !== 'ready' ? `当前方案状态为「${planStatus}」，补齐前置条件后重新生成。`
      : !sourceVerificationCurrent ? '当前指标的来源核验已失效，请先在课程主题页重新核验。'
        : !planSourceCurrent ? '方案绑定的来源签核版本已变化，请重新生成方案后再审核。'
          : !responseRefsInDraft ? '方案引用的作答记录超出原草稿证据范围，请重新生成方案。' : '';
  const pageState = resolvePageState({ planStatus, hasDraftPlan: Boolean(draftPlan), acceptedIsCurrent: acceptedReviewIsCurrent, acceptedIsStale: acceptedReviewIsStale });
  const reviewEditorPlan = draftPlan ?? effectivePlan;
  const nodeName = String(run?.nodes.find(row => String(row['节点编号'] ?? '') === selectedNode)?.['节点名称'] ?? '');
  const studentName = String(run?.students.find(row => String(row['学生编号'] ?? '') === selectedStudent)?.['姓名'] ?? '');
  const studentCases = teacherCases.data?.[selectedStudent] ?? [];
  const currentCase = studentCases.filter(row => row.indicator_id === selectedIndicator && row.node_id === selectedNode).at(-1);
  const scrollToSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const updateActiveSection = () => {
      let current = SECTIONS[0].id as string;
      for (const section of SECTIONS) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= 160) current = section.id;
      }
      setActiveSection(current);
    };
    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);
    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, [draft, runId, selectedStudent, selectedIndicator, selectedNode]);

  if (runQuery.isPending) return <Loading/>;
  if (!run) return <EmptyState title="当前没有分析运行" detail="请先在教学工作台导入课程与学情数据。" action={<Link className={shared.linkButton} to={routes.dashboard}>前往教学工作台 <ArrowRight size={15}/></Link>}/>;

  return <div className={styles.pageStack}>
    <section className={styles.contextPanel} aria-label="当前分析范围">
      <div className={styles.contextLabel}>当前分析范围</div>
      <div className={styles.contextFacts}>
        <div className={styles.contextFact}><span>学生</span><b>{selectedStudent}{studentName ? ` · ${studentName}` : ''}</b></div>
        <div className={styles.contextFact}><span>班级</span><b>{selectedClass}</b></div>
        <div className={styles.contextFact}><span>测验</span><b>{selectedNode}{nodeName ? ` · ${nodeName}` : ''}</b></div>
        <div className={`${styles.contextFact} ${styles.contextFactWide}`}><span>观察指标</span><b>{objectiveName(selectedIndicator)}</b><small>{selectedIndicator}</small></div>
      </div>
      <div className={styles.contextState}>
        <span>方案状态</span>
        <b className={styles.statePill} data-tone={pageState.tone}>{pageState.label}</b>
        <small>{pageState.detail}</small>
      </div>
    </section>

    <div className={styles.contextControls}>
      <StudentQuickSwitch students={run.students} classId={selectedClass} selectedStudent={selectedStudent} search={studentSearch} onSearch={setStudentSearch} onSelect={setStudent} showCurrent showActions={false}/>
      <ScopeSelectors run={run} selectedStudent={selectedStudent} selectedIndicator={selectedIndicator} objectiveName={objectiveName} onStudent={setStudent} onIndicator={setIndicator}/>
    </div>

    <nav className={styles.sectionNav} aria-label="页面章节">
      {SECTIONS.map(section => <button
        key={section.id}
        type="button"
        aria-current={activeSection === section.id ? 'true' : undefined}
        onClick={() => scrollToSection(section.id)}
      >{section.label}</button>)}
    </nav>

    <div className={styles.relatedLinks}>
      <Notice>页面只使用当前学生、指标和测验节点的证据生成方案；外部 AI 分析需单独确认数据传输范围。</Notice>
      <Link to={{ pathname: routes.studentDiagnosis, search }}>返回学生诊断 <ArrowRight size={15}/></Link>
    </div>

    {draftQuery.isPending ? <Loading label="正在读取课程、证据与规则草稿…"/> : draftQuery.isError ? <ErrorBox message={(draftQuery.error as Error).message} onRetry={() => void draftQuery.refetch()}/> : <>
      <section id="student-overview" className={styles.chapter}>
        <ChapterHead index="01" title="学生学习总览" detail="先确认当前范围与有效评分，再看知识指标表现；缺失数据保持未知，不折算成零分。"/>
        <div className={styles.overviewGrid}>
          <StudentLearningSummary run={run} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode} objectiveName={objectiveName(selectedIndicator)} draft={draft} stateLabel={pageState.label} stateTone={pageState.tone}/>
          <Panel title="本次有效评分" action={<Link to={{ pathname: routes.studentDiagnosis, search }}>查看诊断依据 <ArrowRight size={14}/></Link>}>
            {evidence.isPending ? <Loading compact label="正在读取有效评分…"/> : evidence.isError ? <ErrorBox message={(evidence.error as Error).message} onRetry={() => void evidence.refetch()}/> : bundle ? <StudentScoreBars bundle={bundle}/> : <EmptyState compact title="暂无有效评分数据" detail="接口没有返回当前范围的证据包；没有返回不等于零分。"/>}
          </Panel>
        </div>
        <StudentMetricOverview run={run} studentId={selectedStudent} nodeId={selectedNode} indicatorId={selectedIndicator}/>
      </section>

      <section id="student-evidence" className={styles.chapter}>
        <ChapterHead index="02" title="学情诊断与证据链" detail="第一层看诊断摘要，第二层看三类证据，第三层按需展开原始作答与评分明细。"/>
        <LearningEvidencePanel
          draft={draft}
          bundle={bundle}
          objective={objectiveRow}
          insights={insights.data as unknown as StudentInsights | undefined}
          isPending={evidence.isPending}
          isError={evidence.isError}
          error={evidence.isError ? (evidence.error as Error).message : ''}
          onRetry={() => void evidence.refetch()}
        />
      </section>

      <section id="student-plan" className={styles.chapter}>
        <ChapterHead index="03" title="个性化方案与学习路径" detail="方案未就绪时说明阻塞原因与下一步；方案生成后完整呈现目标、材料、步骤、提示与调整条件。"/>
        {acceptedReviewIsStale && <Notice tone="warning">此前采纳的教师方案因来源或证据变化已失效，只能作为历史记录；请重新核验或生成方案后再审核。</Notice>}
        <PersonalizedLearningPath
          plan={displayPlan}
          planOrigin={planOrigin}
          planVersion={acceptedReviewIsCurrent ? acceptedReview?.version : undefined}
          stateLabel={pageState.label}
          stateTone={pageState.tone}
          stateDetail={pageState.detail}
          selection={selection}
          status={planStatus}
          error={draft?.teaching_plan_preview_error}
          draft={draft}
          search={search}
        />
      </section>

      <section id="student-review" className={styles.chapter} data-testid="student-review-plan-panel">
        <ChapterHead index="04" title="教师审核与方案调整" detail="当前方案审核与历史记录放在同一章节；只有最新且来源、证据都有效的采纳结果才作为实施依据。"/>
        <Panel title="教师复核与个性化方案" icon={<ClipboardCheck size={18}/>} action={<span className={shared.muted}>审核结论按版本保留，不覆盖历史</span>}>
          {reviewEditorPlan ? <>
            <TeachingPlanReviewEditor
              key={`${selectedStudent}:${selectedIndicator}:${selectedNode}:${reviewEditorPlan.evidence_fingerprint}:${latestSourceVerification?.version ?? 'no-source'}:${acceptedReview?.version ?? 'draft'}`}
              plan={reviewEditorPlan}
              selection={selection}
              disabled={review.isPending}
              canAccept={canAccept}
              blocker={acceptBlocker}
              alreadyAccepted={acceptedReviewIsCurrent}
              acceptedVersion={acceptedReview?.version}
              onSave={(status, editedPlan, reviewer, reason) => review.mutate({ status, plan: editedPlan, reviewer, reason })}
              onOtherDecision={(status, reviewer, reason) => review.mutate({ status, reviewer, reason })}
            />
            {review.isSuccess && <Notice>教师复核已保存。页面已按最新有效版本更新方案展示。</Notice>}
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
        <ReviewHistoryPanel rows={currentNodeReviews} studentId={selectedStudent} nodeId={selectedNode} effectiveVersion={acceptedReviewIsCurrent ? acceptedReview?.version : undefined}/>
      </section>

      {(reviews.isPending || adjustments.isPending || teacherCases.isPending) ? <Loading label="读取教师复核与案例记录…"/>
        : reviews.isError ? <ErrorBox message={(reviews.error as Error).message}/>
          : adjustments.isError ? <ErrorBox message={(adjustments.error as Error).message}/>
            : teacherCases.isError ? <ErrorBox message={(teacherCases.error as Error).message}/>
              : <>
                <section id="student-tracking" className={styles.chapter}>
                  <ChapterHead index="05" title="教学实施与效果追踪" detail="只有当前有效且已被教师采纳的方案才能建立实施计划；没有后续有效评分时，不生成效果结论。"/>
                  <StudentAdjustmentWorkflow
                    run={run}
                    studentId={selectedStudent}
                    indicatorId={selectedIndicator}
                    nodeId={selectedNode}
                    review={acceptedReviewIsCurrent ? acceptedReview : undefined}
                    latestReview={latestNodeReview}
                    evidence={bundle}
                    adjustments={(adjustments.data ?? []).filter(row => row.student_id === selectedStudent && row.indicator_id === selectedIndicator)}
                    onGoToReview={() => scrollToSection('student-review')}
                    goToReviewLabel={acceptedReviewIsStale ? '查看已失效的审核记录' : '前往教师审核'}
                  />
                </section>
                <section id="student-export" className={styles.chapter}>
                  <div className={styles.chapterTitleRow}>
                    <ChapterHead index="06" title="代表性案例与成果导出" detail="三名代表性学生的确认状态与当前学生案例进度集中在这里；最终成果统一在教学工作台导出。"/>
                    <Link to={{ pathname: routes.dashboard, search }} className={styles.exportLink}>前往案例资料包导出 <ArrowRight size={14}/></Link>
                  </div>
                  <RepresentativeCaseStatus cases={teacherCases.data} selectedStudent={selectedStudent} currentCase={currentCase} reviewCurrent={acceptedReviewIsCurrent}/>
                  <TeacherCaseForm
                    key={`${run.run_id}:${selectedStudent}:${selectedIndicator}:${selectedNode}:${acceptedReview?.version ?? 'pending'}`}
                    runId={run.run_id}
                    studentId={selectedStudent}
                    indicatorId={selectedIndicator}
                    nodeId={selectedNode}
                    review={acceptedReviewIsCurrent ? acceptedReview : undefined}
                    evidence={bundle}
                    currentCase={currentCase}
                    sourceVerified={acceptedSourceIsCurrent}
                    pending={saveTeacherCase.isPending}
                    onSave={payload => saveTeacherCase.mutate(payload)}
                  />
                </section>
                {saveTeacherCase.isError && <ErrorBox message={(saveTeacherCase.error as Error).message}/>}
              </>}

      <AIAnalysisPanel key={`${run.run_id}:${selectedStudent}:${selectedIndicator}:${selectedNode}`} runId={run.run_id} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode}/>
    </>}
  </div>;
}

function ChapterHead({ index, title, detail }: { index: string; title: string; detail: string }) {
  return <div className={styles.chapterHead}>
    <span className={styles.chapterIndex}>{index}</span>
    <div>
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
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
