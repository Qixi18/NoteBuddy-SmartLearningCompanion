import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowRight, BookOpen, Check, CircleHelp, ClipboardCheck, FileSearch, Layers3, Link2, NotebookTabs, Sparkles, Target, Users } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, postJson } from '../../api/client';
import { useCases, useClassInsights, useRun } from '../../api/queries';
import type { CaseCandidate, ClassInsights, RunData } from '../../types/api';
import { DataTable, EmptyState, ErrorBox, Loading, Notice, Panel } from '../../components/PageBits';
import { ReactECharts } from '../../components/ReactECharts';
import { routes } from '../../app/routes';
import { KnowledgeStructurePage } from './KnowledgeStructurePage';
import styles from './ContentPage.module.css';

type Kind = 'overview' | 'structure' | 'items' | 'class' | 'student' | 'evidence' | 'studentTeaching' | 'classTeaching';
type Row = Record<string, unknown>;
type Claim = { claim_id: string; kind: string; text: string; evidence_refs: Array<{ record_id?: string; material_id: string; description: string }>; limitations: string[] };
type Bundle = { scope: Record<string, string>; responses: Row[]; items: Row[]; rubric_definitions: Row[]; coverage: Record<string, unknown>; source_context?: Row; issues: Row[] };

function str(value: unknown, empty = '—') { return value == null || value === '' ? empty : String(value); }
function label(row: Row, choices: string[], fallback: string) { for (const key of choices) if (row[key]) return String(row[key]); return fallback; }
function isSyntheticVerification(row: Row | undefined) { return Boolean(row && ['reason', 'curriculum_locator', 'textbook_locator'].some(key => /合成|模拟验收|synthetic|mock/i.test(String(row[key] ?? '')))); }
function percent(value: number | null) { return value == null ? '无可比数据' : `${(value * 100).toFixed(1)}%`; }
function heatmapTone(value: number | null) { return value === null ? styles.heatmapUnavailable : value >= 0.9 ? styles.heatmapHigh : value >= 0.8 ? styles.heatmapGood : value >= 0.7 ? styles.heatmapMid : value >= 0.6 ? styles.heatmapLow : styles.heatmapWeak; }
function useScope() {
  const [params, setParams] = useSearchParams();
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next); };
  const updateMany = (values: Record<string, string>) => setParams(current => { const next = new URLSearchParams(current); for (const [key, value] of Object.entries(values)) value ? next.set(key, value) : next.delete(key); return next; });
  return { params, update, updateMany, node: params.get('node') ?? '', classId: params.get('class') ?? '', student: params.get('student') ?? '', indicator: params.get('indicator') ?? '' };
}

export function ContentPage({ kind }: { kind: Kind }) {
  const scope = useScope();
  const [studentSearch, setStudentSearch] = useState('');
  const runQuery = useRun();
  const run = runQuery.data;
  const params = useParams();
  const queryClient = useQueryClient();
  const selectedStudent = scope.student || String(run?.students.find(item => String(item['模拟班级编号'] ?? '') === scope.classId)?.['学生编号'] ?? run?.students[0]?.['学生编号'] ?? '');
  const selectedIndicator = scope.indicator || String(run?.objectives[0]?.['指标编号'] ?? '');
  const selectedNode = scope.node || String(run?.nodes[0]?.['节点编号'] ?? '');
  const selectedClass = scope.classId || String(run?.students[0]?.['模拟班级编号'] ?? '');

  const catalog = useQuery({ queryKey: ['material-catalog', run?.run_id], queryFn: () => api<Row>('/api/material-catalog'), enabled: Boolean(run && (kind === 'overview' || kind === 'items')) });
  const verifications = useQuery({ queryKey: ['source-verifications', run?.run_id], queryFn: () => api<Record<string, Row[]>>('/api/source-verifications'), enabled: Boolean(run && (kind === 'overview' || kind === 'structure' || kind === 'items' || kind === 'studentTeaching')) });
  const candidates = useQuery({ queryKey: ['knowledge-candidates', run?.run_id, selectedIndicator], queryFn: () => api<Row>(`/api/knowledge-link-candidates?indicator_id=${encodeURIComponent(selectedIndicator)}`), enabled: Boolean(run && selectedIndicator && kind === 'structure') });
  const insights = useClassInsights(run?.run_id ?? '', selectedNode);
  const cases = useCases(Boolean(run));
  const studentInsights = useQuery({
    queryKey: ['student-insights', run?.run_id, selectedNode, selectedStudent, selectedIndicator],
    queryFn: () => api<{ scope: Record<string, string>; claims: Claim[] }>(`/api/student-insights?student=${encodeURIComponent(selectedStudent)}&indicator=${encodeURIComponent(selectedIndicator)}&node=${encodeURIComponent(selectedNode)}`),
    enabled: Boolean(run && selectedStudent && selectedIndicator && selectedNode && (kind === 'student' || kind === 'evidence' || kind === 'studentTeaching')),
  });
  const evidence = useQuery({
    queryKey: ['evidence-bundle', run?.run_id, selectedNode, selectedStudent, selectedIndicator],
    queryFn: () => api<Bundle>(`/api/evidence-bundle?student=${encodeURIComponent(selectedStudent)}&indicator=${encodeURIComponent(selectedIndicator)}&node=${encodeURIComponent(selectedNode)}`),
    enabled: Boolean(run && selectedStudent && selectedIndicator && selectedNode && (kind === 'evidence' || kind === 'student' || kind === 'studentTeaching')),
  });
  const draft = useQuery({
    queryKey: ['draft', run?.run_id, selectedStudent, selectedIndicator, selectedNode],
    queryFn: () => api<Row>(`/api/draft?student=${encodeURIComponent(selectedStudent)}&indicator=${encodeURIComponent(selectedIndicator)}&node=${encodeURIComponent(selectedNode)}`),
    enabled: Boolean(run && selectedStudent && selectedIndicator && selectedNode && kind === 'studentTeaching'),
  });
  const reviews = useQuery({
    queryKey: ['reviews', run?.run_id],
    queryFn: () => api<Record<string, Row[]>>('/api/reviews'),
    enabled: Boolean(run && kind === 'studentTeaching'),
  });
  const teacherCases = useQuery({
    queryKey: ['teacher-cases', run?.run_id],
    queryFn: () => api<Record<string, Row[]>>('/api/teacher-cases'),
    enabled: Boolean(run && kind === 'studentTeaching'),
  });
  const adjustments = useQuery({
    queryKey: ['teaching-adjustments', run?.run_id, selectedStudent],
    queryFn: () => api<Row[]>('/api/teaching-adjustments'),
    enabled: Boolean(run && kind === 'studentTeaching'),
  });
  const report = useQuery({
    queryKey: ['class-report', run?.run_id, selectedNode],
    queryFn: () => api<Row>(`/api/reports/class?node=${encodeURIComponent(selectedNode)}`),
    enabled: Boolean(run && selectedNode && kind === 'classTeaching'),
  });
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
  if (kind === 'class' && insights.isError) return <ErrorBox message={(insights.error as Error).message} onRetry={() => void insights.refetch()}/>;

  const objectiveName = (id: string) => label(run.objectives.find(row => row['指标编号'] === id) ?? {}, ['观察指标', '指标名称', '名称'], id);
  const setStudent = (value: string) => {
    const student = run?.students.find(row => String(row['学生编号'] ?? '') === value);
    scope.updateMany({ student: value, ...(student ? { class: String(student['模拟班级编号'] ?? '') } : {}) });
  };
  const setIndicator = (value: string) => scope.update('indicator', value);
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
  const knowledgeKind = kind === 'overview' || kind === 'structure' || kind === 'items' ? kind : undefined;
  const knowledgeHeader = knowledgeKind ? <KnowledgeModuleHeader kind={knowledgeKind} search={scope.params.toString()}/> : null;
  const selectControls = (kind === 'student' || kind === 'evidence' || kind === 'studentTeaching') ? <div className={styles.selectControls}>
    {kind !== 'studentTeaching' && <label>学生<select aria-label="学生" value={selectedStudent} onChange={event => setStudent(event.target.value)}>{run.students.map((row, index) => <option key={String(row['学生编号'] ?? index)} value={String(row['学生编号'] ?? '')}>{String(row['学生编号'] ?? '未知学生')} · {String(row['模拟班级编号'] ?? '未分班')}</option>)}</select></label>}
    {(kind === 'student' || kind === 'evidence' || kind === 'studentTeaching') && <label>观察指标<select aria-label="观察指标" value={selectedIndicator} onChange={event => setIndicator(event.target.value)}>{run.objectives.map((row, index) => <option key={String(row['指标编号'] ?? index)} value={String(row['指标编号'] ?? '')}>{objectiveName(String(row['指标编号'] ?? ''))}</option>)}</select></label>}
  </div> : null;

  if (kind === 'overview') return <TopicOverviewPage
    run={run}
    catalog={catalog.data}
    catalogPending={catalog.isPending}
    catalogError={catalog.error as Error | null}
    verifications={verifications.data ?? {}}
    verificationPending={verifications.isPending}
    selectedStudent={selectedStudent}
    selectedIndicator={selectedIndicator}
    selectedNode={selectedNode}
    search={scope.params.toString()}
    onSourcesSaved={async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['source-verifications'] }),
        queryClient.invalidateQueries({ queryKey: ['material-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['run'] }),
      ]);
    }}
  />;

  if (kind === 'structure') return <div className={styles.pageStack}>
    {knowledgeHeader}
    <Notice>主题与指标层级来自当前课程要求。中部连线只表示主题归属；前置关系只有教师已核验后才会显示为已确认。候选关系单独标记，不作为既定知识依赖。</Notice>
    <KnowledgeStructurePage run={run} selectedIndicator={selectedIndicator} search={scope.params.toString()} verifications={verifications.data ?? {}} candidates={candidates.data} candidatesPending={candidates.isPending} onSelectIndicator={setIndicator}/>
  </div>;

  if (kind === 'items') return <ItemRelationsPage run={run} catalog={catalog.data} catalogPending={catalog.isPending} catalogError={catalog.error as Error | null} search={scope.params} selectedIndicator={selectedIndicator} objectiveName={objectiveName}/>;

  if (kind === 'class') return <div className={styles.pageStack}>
    {selectControls}
    <div className={styles.classScopeBar} aria-label="班级诊断范围"><span><Users size={15}/><b>班级范围</b> {selectedClass || '未选择'}</span><span><BookOpen size={15}/><b>测验节点</b> {selectedNode}</span><span><Layers3 size={15}/><b>分析维度</b> 主题表现 · 共同题目比较</span></div>
    <ClassDiagnosis insights={insights.data} cases={cases.data ?? []} classId={selectedClass} nodeId={selectedNode} run={run} objectiveName={objectiveName}/>
    {insights.data?.limitations.map((item, index) => <p className={styles.limitation} key={index}><CircleHelp size={14}/>{item}</p>)}
  </div>;

  if (kind === 'student') return <div className={styles.pageStack}>
    {selectControls}
    <StudentQuickSwitch students={run.students} classId={selectedClass} selectedStudent={selectedStudent} search={studentSearch} onSearch={setStudentSearch} onSelect={setStudent}/>
    {evidence.data && <StudentEvidenceSummary bundle={evidence.data} testName={label(run.nodes.find(row => String(row['节点编号'] ?? '') === selectedNode) ?? {}, ['节点名称', '测验名称', '名称'], selectedNode)} indicatorName={objectiveName(selectedIndicator)}/>}
    {evidence.data && <div className={styles.studentDiagnosticGrid}>
      <Panel title="本次作答表现" icon={<Activity size={18}/>}>{evidence.data.responses.length ? <StudentScoreBars bundle={evidence.data}/> : <EmptyState title="当前范围没有作答记录" detail="无记录不代表未掌握。补充本次测验作答后，这里会显示有效评分。"/>}</Panel>
      <Panel title="学生画像与诊断结论" icon={<Target size={18}/>}>{studentInsights.isPending ? <Loading/> : studentInsights.data ? <StudentDiagnosticClaims claims={studentInsights.data.claims} evidencePath={`${routes.itemEvidence}`} params={scope.params}/> : <EmptyState title="当前范围没有诊断结论" detail="诊断接口没有返回可追溯的主张。无记录不代表未掌握。"/>}</Panel>
    </div>}
    {evidence.data && <div className={styles.twoColumns}>
      <Panel title="典型作答证据" icon={<FileSearch size={18}/>} action={<Link to={{ pathname: routes.itemEvidence, search: scope.params.toString() }}>查看完整证据 <ArrowRight size={14}/></Link>}>{<EvidenceRows bundle={evidence.data} selectedItem={params.itemId}/>}</Panel>
      <Panel title="评分点本次表现" icon={<Layers3 size={18}/> }><RubricPointSummary bundle={evidence.data} params={scope.params}/></Panel>
    </div>}
    <Notice>本页结论仅描述当前学生、观察指标和测验节点内有记录支持的表现，不代表稳定能力等级。评分点未知、未评分或冲突时不会按零分处理。<Link to={{ pathname: routes.studentTeaching, search: scope.params.toString() }}>查看个性化教学建议 <ArrowRight size={14}/></Link></Notice>
  </div>;

  if (kind === 'evidence') return <div className={styles.pageStack}>
    {selectControls}
    {evidence.isPending ? <Loading/> : evidence.data ? <EvidenceDetail bundle={evidence.data} itemId={params.itemId} insights={insights.data} studentClaims={studentInsights.data?.claims ?? []} studentClaimsPending={studentInsights.isPending} studentClaimsError={studentInsights.error as Error | null} objectiveName={objectiveName} topicName={label(run.objectives.find(row => String(row['指标编号'] ?? '') === selectedIndicator) ?? {}, ['主题名称', '主题编号'], '课程主题未提供')} classId={selectedClass} search={scope.params}/> : <EmptyState title="暂无证据包" detail={(evidence.error as Error | null)?.message ?? '当前学生、指标和测验节点范围没有证据包。'}/>}
  </div>;

  if (kind === 'studentTeaching') return <div className={styles.pageStack}>
    <StudentQuickSwitch students={run.students} classId={selectedClass} selectedStudent={selectedStudent} search={studentSearch} onSearch={setStudentSearch} onSelect={setStudent} showCurrent showActions={false}/>
    {selectControls}
    <Notice>以下规则草稿以当前学生、指标和测验节点为范围。请核对证据后再保存教师复核；外部 AI 生成需单独确认数据传输范围。</Notice>
    {draft.isPending ? <Loading label="正在生成规则建议草稿…"/> : draft.data ? <div className={styles.twoColumns}><Panel title="学习建议草稿" icon={<Sparkles size={18}/>}>
      <div className={styles.draftFields}><label>诊断依据<p>{str(draft.data.diagnosis)}</p></label><label>建议行动<p>{str(draft.data.recommendation)}</p></label><label>调整条件<p>{str(draft.data.adjustment_condition)}</p></label><label>观察点<p>{str(draft.data.observation_point)}</p></label>
        <div><strong>关联证据</strong><EvidenceRefs ids={Array.isArray(draft.data.evidence_record_ids) ? draft.data.evidence_record_ids.map(String) : []}/></div>
      </div><ReviewPlanForm key={`${selectedStudent}:${selectedIndicator}:${selectedNode}:${latestSourceVerification?.version ?? 'no-source'}`} materials={currentVerifiedMaterials} defaultActivity={str(draft.data.recommendation, '')} defaultObservation={str(draft.data.observation_point, '')} disabled={review.isPending || !canAcceptDraft || !sourceVerificationCurrent} onAccept={(plan, reviewer, reason) => review.mutate({ status: 'accepted', structured_plan: plan, reviewer, reason })}/><div className={styles.reviewActions}><button onClick={() => review.mutate({ status: 'needs_observation' })} disabled={review.isPending}><CircleHelp size={15}/>继续观察</button><button className={styles.rejectButton} onClick={() => review.mutate({ status: 'rejected' })} disabled={review.isPending}>拒绝草稿</button></div>{!isActionableDraft(draft.data) && <Notice tone="warning">当前证据状态不足以支持采纳。可以继续观察或驳回；补齐来源核验与有效作答后再重新生成草稿。</Notice>}{isActionableDraft(draft.data) && !canAcceptDraft && <Notice>正在核对所引用作答的来源行；证据范围完整后才能采纳。</Notice>}{isActionableDraft(draft.data) && !sourceVerificationCurrent && <Notice tone="warning">采纳方案前请在课程主题页完成当前指标的来源核验。</Notice>}{review.isSuccess && <Notice>复核结果已保存。</Notice>}{review.isError && <ErrorBox message={(review.error as Error).message}/>}
    </Panel><Panel title="证据与资源" icon={<BookOpen size={18}/>}>{evidence.data ? <EvidenceRows bundle={evidence.data}/> : <EmptyState title="证据包读取中" detail="建议只使用接口返回的当前范围证据。"/>}<div className={styles.relatedAction}><Link to={{ pathname: routes.studentDiagnosis, search: scope.params.toString() }}>返回学生诊断 <ArrowRight size={15}/></Link></div></Panel></div> : <ErrorBox message={(draft.error as Error | null)?.message ?? '无法生成建议草稿'}/>}
    {reviews.isPending || adjustments.isPending || teacherCases.isPending ? <Loading label="读取教师复核与案例记录…"/> : reviews.isError ? <ErrorBox message={(reviews.error as Error).message}/> : adjustments.isError ? <ErrorBox message={(adjustments.error as Error).message}/> : teacherCases.isError ? <ErrorBox message={(teacherCases.error as Error).message}/> : <><StudentAdjustmentWorkflow run={run} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode} review={acceptedReview} latestReview={latestNodeReview} evidence={evidence.data} adjustments={(adjustments.data ?? []).filter(row => row.student_id === selectedStudent && row.indicator_id === selectedIndicator)} /><TeacherCaseForm key={`${run.run_id}:${selectedStudent}:${selectedIndicator}:${selectedNode}:${acceptedReview?.version ?? 'pending'}`} runId={run.run_id} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode} review={acceptedReview} evidence={evidence.data} currentCase={teacherCases.data?.[selectedStudent]?.at(-1)} sourceVerified={acceptedSourceIsCurrent} pending={saveTeacherCase.isPending} onSave={payload => saveTeacherCase.mutate(payload)}/>{saveTeacherCase.isError && <ErrorBox message={(saveTeacherCase.error as Error).message}/>}</>}
    <AIAnalysisPanel key={`${run.run_id}:${selectedStudent}:${selectedIndicator}:${selectedNode}`} runId={run.run_id} studentId={selectedStudent} indicatorId={selectedIndicator} nodeId={selectedNode}/>
  </div>;

  return <div className={styles.pageStack}>
    <Notice tone="warning">当前后端的班级报告为只读分析结果，班级 AI 建议与持久化方案尚无独立班级范围契约。这里不会将节点分析伪装成班级专属建议或学生复核记录。</Notice>
    {report.isPending ? <Loading label="读取班级教学分析依据…"/> : report.data ? <Panel title="班级教学分析报告" icon={<Users size={18}/> } action={<button className={styles.textButton} onClick={() => window.print()}>打印报告</button>}><ClassTeachingReport value={report.data}/></Panel> : <ErrorBox message={(report.error as Error | null)?.message ?? '班级报告暂不可用'}/>}
    <Panel title="教师教学流程" icon={<ArrowDownRight size={18}/>}><ol className={styles.flow}><li><b>查看班级诊断</b><span>确认共同题目范围与证据质量。</span></li><li><b>核对报告依据</b><span>班级建议保存能力待后端增加班级范围契约后接入。</span></li><li><b>记录实施与观察</b><span>当前教学调整 API 为学生范围，暂不用于保存班级方案。</span></li></ol></Panel>
  </div>;
}

function KnowledgeModuleHeader({ kind, search }: { kind: 'overview' | 'structure' | 'items'; search: string }) {
  const tabs = [
    { id: 'overview', label: '主题概览', path: routes.topicOverview, icon: Layers3 },
    { id: 'structure', label: '知识结构', path: routes.knowledgeStructure, icon: Link2 },
    { id: 'items', label: '题目关联', path: routes.itemRelations, icon: FileSearch },
  ] as const;
  return <div className={styles.knowledgeModuleHeader}>
    <nav className={styles.knowledgeTabs} aria-label="课程知识页面">
      {tabs.map(tab => { const Icon = tab.icon; return <Link key={tab.id} to={{ pathname: tab.path, search }} aria-current={kind === tab.id ? 'page' : undefined} className={`${styles.knowledgeTab} ${kind === tab.id ? styles.knowledgeTabActive : ''}`}><Icon size={17}/>{tab.label}</Link>; })}
    </nav>
    <div className={styles.knowledgeActions}>
      <Link to={{ pathname: routes.classDiagnosis, search }}><Target size={16}/>查看学情关联</Link>
      <Link to={{ pathname: routes.studentTeaching, search }}><Sparkles size={16}/>生成教学建议</Link>
    </div>
  </div>;
}

function ItemRelationsPage({ run, catalog, catalogPending, catalogError, search, selectedIndicator, objectiveName }: { run: RunData; catalog?: Row; catalogPending: boolean; catalogError: Error | null; search: URLSearchParams; selectedIndicator: string; objectiveName: (id: string) => string }) {
  const [query, setQuery] = useState('');
  const [indicatorFilter, setIndicatorFilter] = useState('');
  const [activeItemId, setActiveItemId] = useState('');
  const indicatorIds = [...new Set(run.items.map(item => String(item['指标编号'] ?? '')).filter(Boolean))];
  const normalizedQuery = query.trim().toLowerCase();
  const items = run.items.filter(item => {
    const indicatorId = String(item['指标编号'] ?? '');
    const text = `${String(item['材料编号'] ?? '')} ${String(item['题干或内容'] ?? '')} ${String(item['指标编号'] ?? '')} ${objectiveName(indicatorId)}`.toLowerCase();
    return (!indicatorFilter || indicatorId === indicatorFilter) && (!normalizedQuery || text.includes(normalizedQuery));
  });
  const selectedItem = items.find(item => String(item['材料编号'] ?? '') === activeItemId) ?? items[0];
  const selectedId = String(selectedItem?.['材料编号'] ?? '');
  const itemIndicator = String(selectedItem?.['指标编号'] ?? selectedIndicator);
  const objective = run.objectives.find(row => String(row['指标编号'] ?? '') === itemIndicator) ?? {};
  const rubricPoints = String(selectedItem?.['评分点'] ?? '').split(/\r?\n/).map(point => point.trim()).filter(Boolean);
  const catalogIndicators = Array.isArray(catalog?.indicators) ? catalog.indicators as Row[] : [];
  const indicatorCatalog = catalogIndicators.find(row => String(row.indicator_id ?? '') === itemIndicator);
  const associatedMaterials = Array.isArray(indicatorCatalog?.materials) ? indicatorCatalog.materials as Row[] : [];
  const associatedDocuments = Array.isArray(indicatorCatalog?.documents) ? indicatorCatalog.documents as Row[] : [];
  const detailSearch = new URLSearchParams(search);
  if (itemIndicator) detailSearch.set('indicator', itemIndicator);
  const topic = label(selectedItem ?? {}, ['主题名称', '主题编号'], label(objective, ['主题名称', '主题编号'], '未提供主题'));
  return <div className={styles.pageStack}>
    <KnowledgeModuleHeader kind="items" search={search.toString()}/>
    <Notice>清单按当前运行的题目材料构建。题型、难度与适用分析未由数据提供时不显示推断值；选择题目可查看其课程要求、评分点和来源目录。</Notice>
    <div className={styles.itemRelationControls}>
      <label>搜索题目<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="输入题目编号、题干或指标"/></label>
      <label>观察指标<select value={indicatorFilter} onChange={event => setIndicatorFilter(event.target.value)}><option value="">全部指标</option>{indicatorIds.map(id => <option key={id} value={id}>{objectiveName(id)} · {id}</option>)}</select></label>
      <span>{items.length} 道题目 · {indicatorIds.length} 项关联指标</span>
    </div>
    {run.items.length ? <div className={styles.itemRelationGrid}>
      <Panel title={`题目关联清单（${items.length}）`} icon={<FileSearch size={18}/>}>{items.length ? <div className={styles.itemRelationList} role="group" aria-label="题目关联清单">{items.map((item, index) => {
        const id = String(item['材料编号'] ?? `item-${index}`);
        const indicatorId = String(item['指标编号'] ?? '');
        const prompt = label(item, ['题干或内容', '题目内容', '材料名称'], '未提供题目内容');
        const pointCount = String(item['评分点'] ?? '').split(/\r?\n/).filter(point => point.trim()).length;
        return <button key={id} type="button" aria-current={id === selectedId ? 'true' : undefined} className={`${styles.itemRelationButton} ${id === selectedId ? styles.itemRelationButtonActive : ''}`} onClick={() => setActiveItemId(id)}>
          <span className={styles.itemRelationButtonHead}><b>{id}</b><small>{str(item['满分'], '未提供满分')} 分</small></span>
          <span className={styles.itemRelationPrompt}>{prompt}</span>
          <span className={styles.itemRelationMeta}>{objectiveName(indicatorId)}{indicatorId ? ` · ${indicatorId}` : ' · 未关联指标'}{pointCount ? ` · ${pointCount} 个评分点` : ''}</span>
        </button>;
      })}</div> : <EmptyState title="没有匹配的题目" detail="更改搜索词或指标筛选条件。"/>}</Panel>
      <Panel title="当前题目详情" icon={<NotebookTabs size={18}/>}>{selectedItem ? <div className={styles.itemRelationDetail}>
        <header><div><span>题目编号</span><h3>{selectedId}</h3></div><span className={styles.itemRelationMaximum}>满分 {str(selectedItem['满分'], '未提供')} 分</span></header>
        <section className={styles.itemRelationPromptBlock}><h4>题目内容</h4><p>{label(selectedItem, ['题干或内容', '题目内容', '材料名称'], '当前运行未提供题目内容。')}</p></section>
        <dl className={styles.itemRelationFacts}><div><dt>对应主题</dt><dd>{topic}</dd></div><div><dt>观察指标</dt><dd>{objectiveName(itemIndicator)}{itemIndicator ? ` · ${itemIndicator}` : ''}</dd></div><div><dt>学习要求</dt><dd>{str(objective['学习要求'], '当前课程数据未提供学习要求。')}</dd></div></dl>
        <section className={styles.itemRelationRubric}><h4>评分点</h4>{rubricPoints.length ? <ol>{rubricPoints.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}</ol> : <p>当前题目未提供评分点。</p>}</section>
        <div className={styles.itemRelationActions}><Link to={{ pathname: `${routes.itemEvidence}/${encodeURIComponent(selectedId)}`, search: detailSearch.toString() }}><FileSearch size={15}/>查看该题证据</Link><Link to={{ pathname: routes.studentTeaching, search: detailSearch.toString() }}><Sparkles size={15}/>查看个性化建议</Link></div>
      </div> : <EmptyState title="选择一题查看详情" detail="题目内容、课程指标和评分点会显示在这里。"/>}</Panel>
    </div> : <EmptyState title="当前运行没有题目材料" detail="检查导入的数据包是否包含题目与材料表。"/>}
    <Panel title="关联课程来源与材料" icon={<Link2 size={18}/>}>{catalogPending ? <Loading label="读取课程来源目录…"/> : catalogError ? <ErrorBox message={catalogError.message}/> : indicatorCatalog ? <div className={styles.itemRelationSources}>
      <div className={styles.itemRelationSourceHeading}><b>{objectiveName(itemIndicator)} · {itemIndicator}</b><span className={`${styles.status} ${indicatorCatalog.source_status === 'verified' && !indicatorCatalog.source_stale ? isSyntheticVerification(indicatorCatalog) ? styles.syntheticStatus : styles.verified : ''}`}>{indicatorCatalog.source_stale ? '核验已过期' : indicatorCatalog.source_status === 'verified' ? isSyntheticVerification(indicatorCatalog) ? '合成验收记录' : '来源已核验' : '待核验'}</span></div>
      {Boolean(indicatorCatalog.curriculum_locator) && <p>课标定位：{str(indicatorCatalog.curriculum_locator)}</p>}{Boolean(indicatorCatalog.textbook_locator) && <p>教材定位：{str(indicatorCatalog.textbook_locator)}</p>}
      {associatedMaterials.length ? <div className={styles.itemRelationSourceList}><h4>关联材料</h4>{associatedMaterials.map((material, index) => <article key={`${String(material.material_id)}-${index}`}><b>{str(material.material_id)}</b><span>{str(material.title, str(material.resource_type, '课程材料'))}</span><small>{material.verified ? '已核验' : '未核验'}</small></article>)}</div> : <p>当前目录没有关联材料。</p>}
      {associatedDocuments.length ? <div className={styles.itemRelationSourceList}><h4>来源文件</h4>{associatedDocuments.map((document, index) => <article key={`${String(document.name)}-${index}`}><b>{str(document.name)}</b><span>{document.available ? `${str(document.page_count, '页数未知')} 页` : '来源文件缺失'}</span><small>{str(document.status)}</small></article>)}</div> : null}
    </div> : <EmptyState title="没有对应的课程来源目录" detail="当前题目关联指标尚未出现在材料目录中。"/>}</Panel>
  </div>;
}

type TopicOverviewRow = {
  order: number;
  topic_id: string;
  topic_name: string;
  requirements: string[];
  indicators: Array<{ id: string; name: string }>;
  source_names: string[];
  material_ids: string[];
  verification: 'verified' | 'pending' | 'stale' | 'partial';
  verification_label: string;
};

function topicOverviewRows(objectives: Row[], items: Row[], catalog: Row | undefined, histories: Record<string, Row[]>): TopicOverviewRow[] {
  const groups = new Map<string, Row[]>();
  for (const objective of objectives) {
    const topicId = str(objective['主题编号'], '未分类');
    groups.set(topicId, [...(groups.get(topicId) ?? []), objective]);
  }
  const catalogRows = Array.isArray(catalog?.indicators) ? catalog.indicators as Row[] : [];
  return [...groups.entries()].map(([topicId, rows], index) => {
    const indicatorIds = rows.map(row => String(row['指标编号'] ?? '')).filter(Boolean);
    const indicators = rows.map(row => ({
      id: String(row['指标编号'] ?? '未提供编号'),
      name: label(row, ['观察指标', '指标名称', '名称'], '未命名观察指标'),
    }));
    const requirements = [...new Set(rows.map(row => label(row, ['学习要求', '课程要求', '内容要求', '要求描述'], '')).filter(Boolean))];
    const topicCatalog = catalogRows.filter(row => indicatorIds.includes(String(row.indicator_id ?? '')));
    const sourceNames = [...new Set(topicCatalog.flatMap(entry => {
      const documents = Array.isArray(entry.documents) ? entry.documents as Row[] : [];
      return [...documents.map(document => String(document.name ?? '')).filter(Boolean), ...[entry.curriculum_locator, entry.textbook_locator].filter((value): value is string => typeof value === 'string' && Boolean(value))];
    }))];
    const materialIds = [...new Set(items.filter(item => indicatorIds.includes(String(item['指标编号'] ?? ''))).map(item => String(item['材料编号'] ?? '')).filter(Boolean))];
    const latestStates = indicatorIds.map(id => (histories[id] ?? []).at(-1));
    const verifiedCount = latestStates.filter(row => row?.status === 'verified' && !row.stale).length;
    const hasStale = latestStates.some(row => row?.stale || row?.status === 'rejected');
    const verification: TopicOverviewRow['verification'] = indicatorIds.length > 0 && verifiedCount === indicatorIds.length ? 'verified' : hasStale ? 'stale' : verifiedCount > 0 ? 'partial' : 'pending';
    const hasSyntheticVerification = latestStates.some(row => row?.status === 'verified' && !row.stale && isSyntheticVerification(row));
    const verificationLabel = verification === 'verified' ? hasSyntheticVerification ? '含合成验收记录' : '已核验' : verification === 'stale' ? '核验需更新' : verification === 'partial' ? `部分核验 ${verifiedCount}/${indicatorIds.length}` : '待核验';
    const topicName = label(rows[0], ['主题名称'], topicId);
    return { order: index + 1, topic_id: topicId, topic_name: topicName, requirements, indicators, source_names: sourceNames, material_ids: materialIds, verification, verification_label: verificationLabel };
  });
}

function TopicOverviewPage({ run, catalog, catalogPending, catalogError, verifications, verificationPending, selectedStudent, selectedIndicator, selectedNode, search, onSourcesSaved }: {
  run: RunData;
  catalog?: Row;
  catalogPending: boolean;
  catalogError: Error | null;
  verifications: Record<string, Row[]>;
  verificationPending: boolean;
  selectedStudent: string;
  selectedIndicator: string;
  selectedNode: string;
  search: string;
  onSourcesSaved: () => Promise<void>;
}) {
  const topics = topicOverviewRows(run.objectives, run.items, catalog, verifications);
  const linkedById = new Map<string, Row>();
  for (const entry of Array.isArray(catalog?.indicators) ? catalog.indicators as Row[] : []) {
    for (const material of Array.isArray(entry.materials) ? entry.materials as Row[] : []) linkedById.set(String(material.material_id ?? ''), material);
  }
  return <div className={styles.pageStack}>
    <KnowledgeModuleHeader kind="overview" search={search}/>
    <Notice>本页内容取自当前课程运行快照；核验状态反映记录状态。若定位依据为合成验收数据，会明确标出，不代表真实课标或教材已完成核验。</Notice>
    <Panel title="主题学习要求与资源映射" icon={<Layers3 size={18}/>}>{topics.length ? <div className={styles.topicOverviewTable}><DataTable columns={[
      { key: 'order', title: '序号', render: row => <span className={styles.topicOrder}>{String(row.order)}</span> },
      { key: 'topic', title: '主题', render: row => <><strong>{String(row.topic_name)}</strong><small className={styles.secondaryCell}>{String(row.topic_id)}</small></> },
      { key: 'requirements', title: '学习要求', render: row => <ul className={styles.requirementList}>{(row.requirements as string[]).length ? (row.requirements as string[]).map((requirement, index) => <li key={`${String(row.topic_id)}-${index}`}>{requirement}</li>) : <li>当前数据未提供独立的学习要求文本。</li>}</ul> },
      { key: 'indicators', title: '观察指标', render: row => <div className={styles.inlineTags}>{(row.indicators as Array<{ id: string; name: string }>).map(item => <Link key={item.id} to={{ pathname: routes.knowledgeStructure, search: new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(search)), indicator: item.id }).toString() }}><b>{item.id}</b> {item.name}</Link>)}</div> },
      { key: 'sources', title: '教材 / 来源', render: row => <span className={styles.clamped}>{(row.source_names as string[]).length ? (row.source_names as string[]).join('；') : catalogPending ? '正在读取来源…' : '当前目录未提供来源定位'}</span> },
      { key: 'materials', title: '关联题目 / 材料', render: row => (row.material_ids as string[]).length ? (row.material_ids as string[]).join('、') : '暂无关联材料' },
      { key: 'verification', title: '来源核验', render: row => <span className={`${styles.status} ${row.verification_label === '已核验' ? styles.verified : row.verification_label === '含合成验收记录' ? styles.syntheticStatus : ''}`}>{String(row.verification_label)}</span> },
    ]} rows={topics as unknown as Row[]}/></div>:<EmptyState title="没有课程主题" detail="导入课程要求后，此处会按真实主题汇总学习要求和资源映射。"/>}</Panel>
    <div className={styles.overviewColumns}>
      <Panel title="主题重点提示" icon={<Target size={18}/>}>{topics.length ? <div className={styles.topicFocusList}>{topics.map(topic => <article key={topic.topic_id}><header><span className={styles.topicOrder}>{topic.order}</span><div><strong>{topic.topic_name}</strong><small>{topic.indicators.length} 项课程观察指标</small></div></header><ul className={styles.requirementList}>{topic.requirements.length ? topic.requirements.map((item, index) => <li key={`${topic.topic_id}-req-${index}`}>{item}</li>) : <li>课程数据未提供独立的学习要求文本。</li>}</ul><small className={styles.topicFocusMeta}>指标：{topic.indicators.map(item => item.id).join('、') || '未提供'}</small></article>)}</div> : <EmptyState title="没有学习要求" detail="导入课程要求后显示主题和要求。"/>}</Panel>
      <Panel title="教材 / 来源映射" icon={<NotebookTabs size={18}/>}>{catalogPending ? <Loading/> : catalog ? <MaterialCatalog value={catalog}/> : <EmptyState title="来源目录暂不可用" detail={catalogError?.message ?? '当前运行没有可用的来源目录。'}/>}<div className={styles.sourceSummary}><span><strong>{Object.values(verifications).flat().filter(row => row.status === 'verified' && !row.stale).length}</strong> 条当前有效记录（含合成验收数据）</span><span><strong>{run.objectives.length}</strong> 项观察指标</span><span>{verificationPending ? '正在读取核验记录…' : '课程或材料变更后，相关核验会标记为过期。'}</span></div></Panel>
      <Panel title="相关题目 / 材料列表" icon={<FileSearch size={18}/>}>{run.items.length ? <DataTable columns={[
        { key: 'id', title: '编号', render: row => String(row['材料编号'] ?? '—') },
        { key: 'type', title: '类型', render: row => <span className={styles.typeTag}>{String(linkedById.get(String(row['材料编号'] ?? ''))?.resource_type ?? '题目')}</span> },
        { key: 'topic', title: '主题归属', render: row => label(run.objectives.find(objective => String(objective['指标编号'] ?? '') === String(row['指标编号'] ?? '')) ?? {}, ['主题名称', '主题编号'], '未关联主题') },
        { key: 'content', title: '内容简述', render: row => <span className={styles.clamped}>{label(row, ['题干或内容', '题目内容', '材料名称'], '当前数据未提供题目内容')}</span> },
        { key: 'action', title: '操作', render: row => <Link to={{ pathname: `${routes.itemEvidence}/${encodeURIComponent(String(row['材料编号'] ?? ''))}`, search: new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(search)), indicator: String(row['指标编号'] ?? selectedIndicator), student: selectedStudent, node: selectedNode }).toString() }}>查看证据</Link> },
      ]} rows={run.items}/>:<EmptyState title="当前运行没有关联题目" detail="题目材料会按导入数据展示，不会补入设计稿中的示例编号。"/>}</Panel>
    </div>
    <div className={styles.overviewGuide}><strong><CircleHelp size={18}/>这套映射如何支持后续分析？</strong><span><Check size={17}/>明确课程学习要求</span><span><Layers3 size={17}/>关联课标与教材来源</span><span><Target size={17}/>为学情分析提供主题维度</span><span><Sparkles size={17}/>为教学建议提供课程依据</span></div>
    <details className={styles.sourceWorkflow}><summary><Check size={17}/>教师来源核验 <small>编辑当前指标的来源定位并记录核验版本</small></summary><SourceVerificationEditor objectives={run.objectives} items={run.items} histories={verifications} onSaved={onSourcesSaved}/></details>
  </div>;
}

function isActionableDraft(draft: Row | undefined) {
  return draft?.unknown_reason === null
    && Array.isArray(draft.evidence_record_ids)
    && draft.evidence_record_ids.length > 0;
}

function responseEvidenceRefs(bundle: Bundle | undefined, recordIds: string[]) {
  if (!bundle || !recordIds.length) return [];
  const wanted = new Set(recordIds);
  return bundle.responses.filter(row => wanted.has(String(row.record_id))).map(row => ({
    kind: 'response',
    evidence_id: row.evidence_id,
    record_id: row.record_id,
    source_line: row.source_line,
    scope: bundle.scope,
  }));
}

function verifiedMaterials(history: Row[]) {
  const latest = history.at(-1);
  return latest?.status === 'verified' && !latest.stale && Array.isArray(latest.material_ids) ? latest.material_ids.map(String) : [];
}

function TeacherCaseForm({ runId, studentId, indicatorId, nodeId, review, evidence, currentCase, sourceVerified, pending, onSave }: {
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

function ReviewPlanForm({ materials, defaultActivity, defaultObservation, disabled, onAccept }: {
  materials: string[]; defaultActivity: string; defaultObservation: string; disabled: boolean;
  onAccept: (plan: Row, reviewer: string, reason: string) => void;
}) {
  const [activity, setActivity] = useState(defaultActivity);
  const [steps, setSteps] = useState('');
  const [practice, setPractice] = useState('');
  const [observations, setObservations] = useState(defaultObservation);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const lines = (value: string) => value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onAccept({ material_ids: materialIds, activity: activity.trim(), steps: lines(steps), practice: lines(practice), observation_points: lines(observations) }, reviewer.trim(), reason.trim());
  };
  const planComplete = materials.length > 0 && materialIds.length > 0 && materialIds.every(id => materials.includes(id)) && activity.trim() && lines(steps).length && lines(practice).length && lines(observations).length && reviewer.trim() && reason.trim();
  return <form className={styles.reviewPlanForm} onSubmit={submit}>
    <div className={styles.reviewPlanHeading}><strong>教师复核与结构化教学方案</strong><span>每行填写一项步骤、练习或观察点</span></div>
    <label>教学活动<input required value={activity} onChange={event => setActivity(event.target.value)} maxLength={4000} placeholder="填写本次课堂活动"/></label>
    <div className={styles.reviewPlanColumns}><label>实施步骤<textarea required rows={3} value={steps} onChange={event => setSteps(event.target.value)} placeholder={'每行一项，例如：\n回顾关键概念\n完成示范题'}/></label><label>配套练习<textarea required rows={3} value={practice} onChange={event => setPractice(event.target.value)} placeholder={'每行一项练习\n从已学题目到迁移题'}/></label></div>
    <label>观察点<textarea required rows={2} value={observations} onChange={event => setObservations(event.target.value)} placeholder="每行填写一个可以观察或核验的表现"/></label>
    <fieldset className={styles.reviewMaterials}><legend>关联已核验教学材料</legend>{materials.length ? materials.map(id => <label key={id}><input type="checkbox" checked={materialIds.includes(id)} onChange={() => setMaterialIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])}/>{id}</label>) : <small>当前指标没有有效的已核验材料。请先完成来源核验并关联材料，之后才能采纳方案。</small>}</fieldset>
    <div className={styles.reviewPlanColumns}><label>复核教师<input required value={reviewer} onChange={event => setReviewer(event.target.value)} maxLength={200}/></label><label>复核理由<input required value={reason} onChange={event => setReason(event.target.value)} maxLength={4000} placeholder="简述采纳理由与证据对应关系"/></label></div>
    <button className={styles.acceptButton} type="submit" disabled={disabled || !planComplete}><Check size={15}/>采纳建议并保存方案</button>
  </form>;
}

function AIAnalysisPanel({ runId, studentId, indicatorId, nodeId }: { runId: string; studentId: string; indicatorId: string; nodeId: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const queryClient = useQueryClient();
  const params = new URLSearchParams({ task: 'task03', run_id: runId, student_id: studentId, indicator_id: indicatorId, node_id: nodeId });
  const preview = useQuery({
    queryKey: ['ai-analysis-preview', runId, studentId, indicatorId, nodeId],
    queryFn: () => api<Row>(`/api/ai-analysis?${params.toString()}`),
  });
  const generate = useMutation({
    mutationFn: () => api<Row>('/api/ai-analysis', postJson({
      task: 'task03', action: preview.data?.analysis ? 'refresh' : 'generate',
      run_id: runId, student_id: studentId, indicator_id: indicatorId, node_id: nodeId,
      request_id: crypto.randomUUID(), transmission_confirmed: true,
    })),
    onSuccess: async () => {
      setConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ['ai-analysis-preview', runId, studentId, indicatorId, nodeId] });
    },
  });
  const saved = (generate.data ?? preview.data?.analysis) as Row | undefined;
  const findings = Array.isArray(saved?.findings) ? saved.findings as Row[] : [];
  const summary = preview.data?.input_summary && typeof preview.data.input_summary === 'object' ? preview.data.input_summary as Row : {};
  return <Panel title="AI 证据分析" icon={<Sparkles size={18}/> }>
    {preview.isPending ? <Loading label="读取模型配置与分析范围…"/> : preview.isError ? <ErrorBox message={(preview.error as Error).message} onRetry={() => void preview.refetch()}/> : <>
      <div className={styles.aiScope}><span>服务商：{str(preview.data?.provider)}</span><span>模型：{str(preview.data?.model)}</span><span>学生 {studentId} · 指标 {indicatorId} · 节点 {nodeId}</span><span>{str(summary.record_count, '0')} 条原始记录 · {str(summary.evidence_count, '0')} 条证据 · {str(summary.objective_count, '0')} 项课程目标</span></div>
      {!preview.data?.model_configured && <Notice tone="warning">本机没有配置可用的模型服务。配置模型密钥后，才可使用此功能。</Notice>}
      {Boolean(preview.data?.stale) && <Notice tone="warning">已有分析使用了旧的数据或来源版本，重新生成后才能作为当前范围的参考。</Notice>}
      {preview.data?.model_configured && <form className={styles.aiConsent} onSubmit={event => { event.preventDefault(); generate.mutate(); }}>
        <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>我确认将此范围的学生编号、课程指标、测验节点、作答/评分证据及当前有效的已签核来源片段发送给上述模型服务进行分析。</span></label>
        <button className={styles.adjustmentSubmit} type="submit" disabled={!confirmed || generate.isPending}>{generate.isPending ? '正在请求模型分析…' : saved ? '确认并重新生成分析' : '确认传输并生成分析'}</button>
      </form>}
      {generate.isError && <ErrorBox message={(generate.error as Error).message}/>}
      {saved && <div className={styles.aiResult}><div className={styles.aiResultHeader}><strong>{saved.status === 'complete' ? '分析完成' : saved.status === 'partial' ? '部分完成' : saved.status === 'failed' ? '分析失败' : saved.status === 'insufficient_evidence' ? '证据不足' : str(saved.status)}</strong><span>第 {str(saved.generation, '1')} 次 · {str(saved.model)}</span></div>{findings.length ? findings.map((finding, index) => <article key={String(finding.finding_id ?? index)}><span>{str(finding.category, '证据观察')} · {supportLabel(finding.support_level)}</span><b>{str(finding.claim)}</b><p>{str(finding.interpretation)}</p>{typeof finding.limitations === 'string' && finding.limitations && <small>限制：{finding.limitations}</small>}{typeof finding.next_step === 'string' && finding.next_step && <small>建议下一步：{finding.next_step}</small>}{Array.isArray(finding.evidence_refs) && finding.evidence_refs.length > 0 && <div>{(finding.evidence_refs as Row[]).map((ref, refIndex) => <blockquote key={`${String(ref.evidence_id)}-${refIndex}`}>{str(ref.excerpt)}<small>{str(ref.source_locator, str(ref.record_id, '当前分析范围证据'))}</small></blockquote>)}</div>}</article>) : <EmptyState title="本次分析没有可展示的结论" detail={saved.status === 'failed' ? '检查模型服务状态后，可在确认传输范围后重试。' : '当前范围的证据包没有支持可展示主张的材料。'}/>}</div>}
    </>}
  </Panel>;
}

function supportLabel(value: unknown) {
  return value === 'supported' ? '证据支持' : value === 'limited' ? '证据有限' : value === 'conflicting' ? '证据冲突' : value === 'unavailable' ? '暂无依据' : '待核对';
}

function StudentAdjustmentWorkflow({ run, studentId, indicatorId, nodeId, review, latestReview, evidence, adjustments }: {
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
    mutationFn: () => api<Row>(`/api/teaching-adjustments/${encodeURIComponent(String(record.adjustment_id))}`, postJson({
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

function SourceVerificationEditor({ objectives, items, histories, onSaved }: {
  objectives: Row[];
  items: Row[];
  histories: Record<string, Row[]>;
  onSaved: () => Promise<void>;
}) {
  const [indicatorId, setIndicatorId] = useState(String(objectives[0]?.['指标编号'] ?? ''));
  const linkedMaterials = items.filter(item => String(item['指标编号'] ?? '') === indicatorId);
  const history = histories[indicatorId] ?? [];
  const latest = history.at(-1);
  return <Panel title="教师来源核验" icon={<Check size={18}/> }>
    {objectives.length ? <>
      <label className={styles.verificationIndicator}>选择观察指标<select value={indicatorId} onChange={event => setIndicatorId(event.target.value)}>{objectives.map((row, index) => <option key={String(row['指标编号'] ?? index)} value={String(row['指标编号'] ?? '')}>{String(row['指标编号'] ?? '未知指标')} · {label(row, ['观察指标', '指标名称', '名称'], '课程指标')}</option>)}</select></label>
      <div className={styles.verificationContext}><span>本次会核对该指标关联的全部题目材料，共 {linkedMaterials.length} 项。</span><span>当前记录：{latest ? `第 ${str(latest.version)} 版 · ${str(latest.status)}${latest.stale ? ' · 已过期' : ''}` : '尚无核验记录'}</span></div>
      <SourceVerificationForm key={`${indicatorId}-${str(latest?.version, '0')}`} indicatorId={indicatorId} materialIds={linkedMaterials.map(row => String(row['材料编号'] ?? '')).filter(Boolean)} latest={latest} onSaved={onSaved}/>
    </> : <EmptyState title="没有可核验的观察指标" detail="导入课程要求后，才能记录来源核验。"/>}
  </Panel>;
}

function SourceVerificationForm({ indicatorId, materialIds, latest, onSaved }: {
  indicatorId: string;
  materialIds: string[];
  latest?: Row;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState(String(latest?.status ?? 'pending'));
  const [curriculum, setCurriculum] = useState(String(latest?.curriculum_locator ?? ''));
  const [textbook, setTextbook] = useState(String(latest?.textbook_locator ?? ''));
  const [reviewer, setReviewer] = useState(String(latest?.reviewer ?? ''));
  const [reason, setReason] = useState(String(latest?.reason ?? ''));
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => api<Row>('/api/source-verification', postJson({
      indicator_id: indicatorId,
      status,
      curriculum_locator: curriculum.trim(),
      textbook_locator: textbook.trim(),
      material_ids: materialIds,
      knowledge_links: Array.isArray(latest?.knowledge_links) ? latest.knowledge_links : [],
      rubric_mappings: Array.isArray(latest?.rubric_mappings) ? latest.rubric_mappings : [],
      resource_links: Array.isArray(latest?.resource_links) ? latest.resource_links : [],
      expected_version: typeof latest?.version === 'number' ? latest.version : 0,
      reviewer: reviewer.trim(),
      reason: reason.trim(),
    })),
    onSuccess: async () => {
      await onSaved();
      await queryClient.invalidateQueries({ queryKey: ['source-verifications'] });
    },
  });
  const verified = status === 'verified';
  return <form className={styles.verificationForm} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); save.mutate(); }}>
    <div className={styles.verificationFields}>
      <label>课标定位<input value={curriculum} onChange={event => setCurriculum(event.target.value)} placeholder="例如：课程标准章节 / 页码" required={verified}/></label>
      <label>教材定位<input value={textbook} onChange={event => setTextbook(event.target.value)} placeholder="例如：教材版本、册次、章节与页码" required={verified}/></label>
      <label>核验人<input value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="教师姓名" required={verified}/></label>
      <label>核验依据<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="说明如何核对课标、教材和题目关联" required={verified} rows={3}/></label>
      <label>保存状态<select value={status} onChange={event => setStatus(event.target.value)}><option value="pending">待核验</option><option value="verified">已核验</option><option value="rejected">不通过</option></select></label>
    </div>
    <div className={styles.verificationMaterials}><b>关联题目材料</b>{materialIds.length ? materialIds.map(id => <span key={id}>{id}</span>) : <small>当前指标没有关联题目；后端不允许将空材料集标为已核验。</small>}</div>
    {verified && <Notice>提交后将绑定当前运行的来源指纹；后续课程或材料变化会使核验记录过期。候选知识关系不会自动签核。</Notice>}
    <div className={styles.reviewActions}><button type="submit" disabled={save.isPending || (verified && materialIds.length === 0)}><Check size={15}/>{save.isPending ? '正在保存…' : '保存核验记录'}</button></div>
    {save.isSuccess && <Notice>核验记录已保存，新版本已关联当前数据来源。</Notice>}{save.isError && <ErrorBox message={(save.error as Error).message}/>}
  </form>;
}

function JsonSummary({ value }: { value: unknown }) {
  if (value == null) return <EmptyState title="暂无数据" detail="接口没有返回数据。"/>;
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index + 1), item] as const) : typeof value === 'object' ? Object.entries(value as Row) : [['内容', value] as const];
  return <div className={styles.jsonSummary}>{entries.length ? entries.slice(0, 18).map(([key, item]) => <div key={key}><b>{key}</b><span>{typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item ?? '—')}</span></div>) : <EmptyState title="列表为空" detail="当前运行没有相应目录条目。"/>}</div>;
}

function ClassTeachingReport({ value }: { value: Row }) {
  const classes = Array.isArray(value.classes) ? value.classes as Row[] : [];
  const comparisons = Array.isArray(value.comparisons) ? value.comparisons as Row[] : [];
  const observations = Array.isArray(value.common_observations) ? value.common_observations as Row[] : [];
  const mappings = value.source_mappings && typeof value.source_mappings === 'object' ? value.source_mappings as Row : {};
  const ratio = (raw: unknown) => typeof raw === 'number' ? percent(raw) : '不可比较';
  return <div className={styles.reportStack}>
    <div className={styles.statStrip}><span><Users size={16}/><b>{classes.length}</b> 个班级</span><span><Target size={16}/><b>{comparisons.filter(row => row.status === 'available').length}</b> 项有共同题目比较</span><span><Layers3 size={16}/><b>{observations.length}</b> 项跨班共性观察</span><span>节点 {str(value.node_id)} · {value.status === 'ready' ? '报告就绪' : '数据不完整'}</span></div>
    <section className={styles.reportSection}>
      <div className={styles.reportSectionHeading}><div><h3>共同题目班级对照</h3><p>只比较各班都作答的题目；得分率不代表单题正确率或班级整体能力。</p></div></div>
      {comparisons.length ? <div className={styles.classComparisonList}>{comparisons.map((comparison, index) => {
        const classRows = Array.isArray(comparison.classes) ? comparison.classes as Row[] : [];
        const available = comparison.status === 'available';
        const materialIds = Array.isArray(comparison.common_material_ids) ? comparison.common_material_ids.map(String) : [];
        return <article className={styles.classComparisonCard} key={String(comparison.indicator_id ?? index)}>
          <header className={styles.classComparisonHeader}>
            <div><b>{str(comparison.indicator_id, '观察指标未命名')}</b><span>{available ? `${materialIds.length} 道共同题目` : '当前不可比较'}</span></div>
            <strong className={available ? styles.classComparisonDelta : styles.classComparisonUnavailable}>{typeof comparison.difference === 'number' ? `相差 ${(comparison.difference * 100).toFixed(1)} 个百分点` : '没有可用差异值'}</strong>
          </header>
          {available ? <>
            {materialIds.length > 0 && <div className={styles.commonMaterialTags} aria-label="共同题目">{materialIds.map(id => <span key={id}>{id}</span>)}</div>}
            <div className={styles.classComparisonRows}>{classRows.map((row, rowIndex) => {
              const rawRatio = typeof row.common_ratio === 'number' ? row.common_ratio : null;
              const safeRatio = rawRatio == null ? 0 : Math.max(0, Math.min(1, rawRatio));
              return <div className={styles.classComparisonRow} key={String(row.class_id ?? rowIndex)}>
                <div className={styles.classComparisonLabel}><b>{str(row.class_id, '未命名班级')}</b><span>{str(row.observed_student_count, '0')} 人 · {str(row.common_record_count, '0')} 条有效记录</span></div>
                <div className={styles.classComparisonTrack} role="img" aria-label={`${str(row.class_id)}共同题目得分率 ${ratio(rawRatio)}`}><span style={{ width: `${safeRatio * 100}%` }}/></div>
                <strong>{ratio(rawRatio)}</strong>
              </div>;
            })}</div>
          </> : <EmptyState title="共同题目不足，暂不可比" detail="补充各班都作答的观察题目后，才能计算同口径结果。"/>}
        </article>;
      })}</div> : <EmptyState title="没有班级比较数据" detail="当前节点没有可展示的指标比较。"/>}
    </section>
    <div className={styles.twoColumns}>
      <section className={styles.reportSection}><h3>已核验共性观察</h3>{observations.length ? <div className={styles.reportCards}>{observations.map((item, index) => <article key={String(item.issue_id ?? index)}><b>{str(item.label, str(item.indicator_id, '共性观察'))}</b><p>{str(item.indicator_id)}</p><small>{Array.isArray(item.by_class) ? (item.by_class as Row[]).filter(row => Number(row.affected_count) > 0).map(row => `${str(row.class_id)}：${str(row.affected_count)} / ${str(row.observed_student_count)} 人`).join('；') : '没有班级明细'}</small></article>)}</div> : <EmptyState title="暂无跨班共性观察" detail="需要多个班级均出现有已核验评分点证据支持的问题；缺少证据时不会推断。"/>}</section>
      <section className={styles.reportSection}><h3>课程来源映射状态</h3>{Object.keys(mappings).length ? <DataTable columns={[{ key: 'indicator', title: '观察指标' }, { key: 'status', title: '状态', render: row => row.status === 'verified' ? '已核验' : row.status === 'not_generated' ? '尚未生成' : str(row.status) }, { key: 'usable_count', title: '可用映射' }, { key: 'needs_resolution_count', title: '待处理' }]} rows={Object.entries(mappings).map(([indicator, summary]) => ({ indicator, ...(summary as Row) }))}/> : <EmptyState title="没有来源映射摘要" detail="当前报告未返回课程映射状态。"/>}</section>
    </div>
    {Array.isArray(value.limitations) && value.limitations.map((limitation, index) => <p className={styles.limitation} key={index}><CircleHelp size={14}/>{String(limitation)}</p>)}
  </div>;
}

function MaterialCatalog({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') return <EmptyState title="暂无材料目录" detail="目录接口没有返回可展示条目。"/>;
  const indicators = (value as Row).indicators;
  if (!Array.isArray(indicators) || !indicators.length) return <EmptyState title="当前运行没有教材目录条目" detail="指标与教材材料尚未建立目录关联。"/>;
  return <div className={styles.catalogList}>{(indicators as Row[]).map((item, index) => {
    const docs = Array.isArray(item.documents) ? item.documents as Row[] : [];
    const materials = Array.isArray(item.materials) ? item.materials as Row[] : [];
    const syntheticVerification = /合成|模拟验收|synthetic|mock/i.test(`${String(item.curriculum_locator ?? '')} ${String(item.textbook_locator ?? '')}`);
    return <article key={String(item.indicator_id ?? index)}><header><div><strong>{str(item.indicator_id)}</strong><small>{str(item.topic_id, '未关联主题')}</small></div><span className={`${styles.status} ${item.source_status === 'verified' && !item.source_stale ? syntheticVerification ? styles.syntheticStatus : styles.verified : ''}`}>{item.source_stale ? '核验已过期' : item.source_status === 'verified' ? syntheticVerification ? '合成验收记录' : '来源已核验' : '待核验'}</span></header>
      {Boolean(item.curriculum_locator) && <p className={styles.catalogLocator}>课标定位：{str(item.curriculum_locator)}</p>}{Boolean(item.textbook_locator) && <p className={styles.catalogLocator}>教材定位：{str(item.textbook_locator)}</p>}
      {docs.length > 0 && <div className={styles.documentList}>{docs.map((doc, docIndex) => <div key={`${String(doc.name)}-${docIndex}`}><NotebookTabs size={14}/><span>{str(doc.name)}</span><small>{doc.available ? `${str(doc.page_count, '页数未知')} 页` : '来源文件缺失'}</small></div>)}</div>}
      {materials.length > 0 && <div className={styles.materialTags}>{materials.map((material, materialIndex) => <span key={`${String(material.material_id)}-${materialIndex}`}><b>{str(material.material_id)}</b>{str(material.title, str(material.resource_type, '材料'))}{material.verified ? ' · 已核验' : ''}</span>)}</div>}
    </article>;
  })}</div>;
}

function ClassDiagnosis({ insights, cases, classId, nodeId, run, objectiveName }: { insights?: ClassInsights; cases: CaseCandidate[]; classId: string; nodeId: string; run: RunData; objectiveName: (id: string) => string }) {
  if (!insights) return <Loading label="正在分析班级比较与共性问题…"/>;
  const selected = insights.classes.find(item => item.class_id === classId);
  const graph = {
    color: ['#16864a', '#80cb6d', '#b5e9a7'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: number | null) => percent(value) },
    legend: { bottom: 0, textStyle: { color: '#77847a', fontSize: 10 } },
    grid: { left: 82, right: 12, top: 14, bottom: 38 },
    xAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: (value: number) => `${Math.round(value * 100)}%`, color: '#87928a', fontSize: 9, hideOverlap: true }, splitLine: { lineStyle: { color: '#edf1ed' } } },
    yAxis: { type: 'category', data: insights.comparisons.map(item => objectiveName(item.indicator_id)).slice(0, 8).reverse(), axisLabel: { color: '#53645a', width: 90, overflow: 'truncate' } },
    series: insights.classes.map(summary => ({ name: summary.class_id, type: 'bar', data: insights.comparisons.map(item => item.classes.find(row => row.class_id === summary.class_id)?.common_ratio ?? null).slice(0, 8).reverse(), barMaxWidth: 14, itemStyle: { borderRadius: [0, 6, 6, 0] }, connectNulls: false })),
  };
  const classCases = cases.filter(item => item.class_id === classId);
  const heatmapLegend = [{ label: '≥ 90%', tone: styles.heatmapHigh }, { label: '80–89%', tone: styles.heatmapGood }, { label: '70–79%', tone: styles.heatmapMid }, { label: '60–69%', tone: styles.heatmapLow }, { label: '< 60%', tone: styles.heatmapWeak }];
  const quality = run.quality;
  const excludedCount = quality.excluded_record_ids.length;
  const findingCount = quality.findings.length;
  const evidenceItems = insights.comparisons.flatMap(comparison => comparison.common_material_ids.map(materialId => {
    const item = run.items.find(row => String(row['材料编号'] ?? '') === materialId);
    return { comparison, materialId, item };
  })).filter(entry => entry.item).slice(0, 5);
  return <>
    <div className={styles.classDiagnosisGrid}>
    <Panel title="班级共同题目得分率对比" icon={<Activity size={18}/>} className={styles.classChartPanel}>
      <div className={styles.classSummaryBadges}><span><Users size={14}/>{insights.classes.length} 个班级</span><span><FileSearch size={14}/>{selected?.scored_record_count ?? 0} 条当前班有效评分</span></div>
      {insights.comparisons.some(item => item.status === 'available') ? <ReactECharts option={graph} notMerge lazyUpdate style={{ height: 270, width: '100%' }}/> : <EmptyState title="当前测验没有共同题目" detail="不能比较班级表现。页面保留不可比较状态，不绘制排名或零值。"/>}
      <p className={styles.heatmapNote}>仅比较各班共同作答题目；完整共同题目范围与覆盖数见下方热力图。</p>
    </Panel>
    <Panel title="班级共性问题" icon={<Target size={18}/>} className={styles.classIssuesPanel}>
      {insights.issues.length ? <div className={styles.issueList}>{insights.issues.slice(0, 4).map((issue, index) => <article className={styles.issueCard} key={String(issue.issue_id ?? index)}><span className={styles.issueRank}>{index + 1}</span><div><strong>{String(issue.label ?? issue.indicator_id)}</strong><p>{String(issue.indicator_id)} · {objectiveName(String(issue.indicator_id))}</p>{(issue.by_class as Row[]).filter(entry => Number(entry.affected_count) > 0).map(entry => <small key={String(entry.class_id)}>{String(entry.class_id)}：{String(entry.affected_count)} / {String(entry.observed_student_count)} 人（已核验评分点证据）</small>)}</div></article>)}</div> : <EmptyState title="暂无已核验共性问题" detail="仅依据有效来源核验和评分点证据生成；当前没有足够依据时不推断班级困难。"/>}
    </Panel>
    <Panel title="本次导入数据质量" icon={<CircleHelp size={18}/>} className={styles.classQualityPanel}>
      <div className={styles.qualityRows}><div><span><ClipboardCheck size={15}/>有效评分</span><strong>{quality.eligible_scored} / {quality.raw_rows}</strong></div><div><span><AlertTriangle size={15}/>排除记录</span><strong>{excludedCount}</strong></div><div><span><CircleHelp size={15}/>质量提示</span><strong>{findingCount}</strong></div></div>
      <p className={styles.heatmapNote}>此摘要覆盖当前运行的全部导入记录，不限于所选班级或测验节点。未评分、缺失或异常记录不按零分计算。</p>
      {quality.findings.slice(0, 2).map((finding, index) => <small className={styles.qualityFinding} key={`${String(finding.code)}-${index}`}>{String(finding.code ?? '数据提示')}：{String(finding.detail ?? '存在需留意的数据质量记录。')}</small>)}
    </Panel>
    </div>
    <Panel title="共同题目指标比较" icon={<Target size={18}/>} action={<span className={styles.muted}>仅绘制可比口径</span>}>
      <DataTable columns={[{ key: 'indicator_id', title: '观察指标', render: row => `${objectiveName(String(row.indicator_id))} (${String(row.indicator_id)})` }, { key: 'common_material_ids', title: '共同题目' }, ...insights.classes.map(summary => ({ key: summary.class_id, title: summary.class_id, render: (row: Row) => { const comp = insights.comparisons.find(item => item.indicator_id === row.indicator_id); const val = comp?.classes.find(item => item.class_id === summary.class_id); return comp?.status === 'available' ? `${percent(val?.common_ratio ?? null)} · ${val?.observed_student_count ?? 0} 人` : '不可比较'; } }))]} rows={insights.comparisons.map(item => ({ ...item }))}/>
    </Panel>
    <Panel title="观察指标得分热力图" icon={<Layers3 size={18}/>} action={<div className={styles.heatmapLegend}>{heatmapLegend.map(item => <span key={item.label}><i className={item.tone}/>{item.label}</span>)}</div>}>
      <p className={styles.heatmapNote}>仅按各班共同题目计算；不可比单元格不填色，也不以缺失记录补零。</p>
      {insights.comparisons.length ? <div className={styles.heatmapScroll}><table className={styles.heatmapTable}><thead><tr><th>观察指标</th>{insights.classes.map(summary => <th key={summary.class_id}>{summary.class_id}</th>)}</tr></thead><tbody>{insights.comparisons.map(comparison => <tr key={comparison.indicator_id}><th><span>{objectiveName(comparison.indicator_id)}</span><small>{comparison.indicator_id}</small></th>{insights.classes.map(summary => {
        const classScore = comparison.classes.find(item => item.class_id === summary.class_id);
        const ratio = comparison.status === 'available' ? classScore?.common_ratio ?? null : null;
        return <td key={`${comparison.indicator_id}-${summary.class_id}`} className={heatmapTone(ratio)} aria-label={`${summary.class_id} ${objectiveName(comparison.indicator_id)} ${comparison.status === 'available' ? percent(ratio) : '不可比较'}`}><span>{comparison.status === 'available' ? percent(ratio) : '不可比'}</span><small>{comparison.status === 'available' ? `${classScore?.observed_student_count ?? 0} 人 · ${classScore?.common_record_count ?? 0} 条` : '无共同题目'}</small></td>;
      })}</tr>)}</tbody></table></div> : <EmptyState title="没有可展示的指标热力图" detail="当前节点没有观察指标比较数据。"/>}
    </Panel>
    <div className={styles.twoColumns}><Panel title="代表性学生候选" icon={<Users size={18}/>}>{classCases.length ? <div className={styles.caseGrid}>{classCases.map(item => <Link className={styles.caseCard} key={item.student_id} to={{ pathname: routes.studentDiagnosis, search: new URLSearchParams({ node: nodeId, class: item.class_id, student: item.student_id }).toString() }}><span>{item.student_id}</span><b>{item.type}</b><p>{item.reason}</p><small>{item.evidence_record_ids.length} 条关联证据 · 查看学生诊断</small></Link>)}</div> : <EmptyState title="没有案例候选" detail="案例分类仅用于选择证据样本，不代表能力等级。"/>}</Panel>
      <Panel title="关键题目证据" icon={<FileSearch size={18}/>}>{evidenceItems.length ? <div className={styles.keyEvidenceList}>{evidenceItems.map(({ comparison, materialId, item }) => <article key={`${comparison.indicator_id}-${materialId}`}><header><b>{materialId}</b><span>{objectiveName(comparison.indicator_id)}</span></header><p>{label(item ?? {}, ['题干或内容', '题目内容', '材料名称'], '当前数据没有题目内容')}</p><small className={styles.evidenceScopeLabel}>所属指标共同题目口径（非单题得分）</small><div>{comparison.classes.map(score => <span key={score.class_id}>{score.class_id}：{comparison.status === 'available' ? `${percent(score.common_ratio)} · ${score.observed_student_count} 人` : '不可比较'}</span>)}</div><Link to={{ pathname: `${routes.itemEvidence}/${encodeURIComponent(materialId)}`, search: new URLSearchParams({ node: nodeId, class: classId, indicator: comparison.indicator_id }).toString() }}>查看作答证据 <ArrowRight size={13}/></Link></article>)}</div> : <EmptyState title="当前没有可列出的共同题目证据" detail="需要在班级间至少存在一题共同作答题目；未覆盖的题目不会列作可比证据。"/>}</Panel></div>
    <Panel title="测验与课程范围" icon={<BookOpen size={18}/>}><div className={styles.contextLine}><span>运行 {run.run_id}</span><span>节点 {insights.node_id}</span><span>{run.objectives.length} 项观察指标</span><span>{run.items.length} 道题目材料</span></div></Panel>
  </>;
}

function ClaimList({ claims, evidencePath, params }: { claims: Claim[]; evidencePath: string; params: URLSearchParams }) {
  return <div className={styles.claimList}>{claims.map(claim => <article className={styles.claim} key={claim.claim_id}><div className={styles.claimHeading}><span className={claim.kind === 'rule_observation' ? styles.ruleClaim : ''}>{claim.kind === 'rule_observation' ? '已核验规则观察' : claim.kind === 'hypothesis' ? '待核实假设' : '证据事实'}</span><b>{claim.text}</b></div>
    {claim.evidence_refs.length ? <div className={styles.claimEvidenceLinks}>{claim.evidence_refs.map((ref, index) => <Link key={`${ref.record_id ?? ref.material_id}-${index}`} to={{ pathname: `${evidencePath}/${encodeURIComponent(ref.material_id)}`, search: params.toString() }}><FileSearch size={13}/><span>{ref.record_id ?? ref.material_id}</span><small>{ref.description}</small><ArrowRight size={13}/></Link>)}</div> : <EvidenceRefs ids={[]}/>}
    {claim.limitations.map((item, index) => <small className={styles.limitText} key={index}><CircleHelp size={13}/>{item}</small>)}
  </article>)}</div>;
}

function StudentDiagnosticClaims({ claims, evidencePath, params }: { claims: Claim[]; evidencePath: string; params: URLSearchParams }) {
  const observations = claims.filter(claim => claim.kind !== 'fact');
  const facts = claims.filter(claim => claim.kind === 'fact');
  return <div className={styles.studentDiagnosticClaims}>
    {observations.length ? <ClaimList claims={observations} evidencePath={evidencePath} params={params}/> : <p className={styles.noCrossItemClaim}><CircleHelp size={15}/>当前没有跨题且有核验依据的规则观察；逐条事实和评分点记录见下方明细。</p>}
    {facts.length > 0 && <details className={styles.studentFactDisclosure}><summary>查看逐条证据事实（{facts.length}）</summary><ClaimList claims={facts} evidencePath={evidencePath} params={params}/></details>}
  </div>;
}

function StudentQuickSwitch({ students, classId, selectedStudent, search, onSearch, onSelect, showCurrent = false, showActions = true }: { students: Row[]; classId: string; selectedStudent: string; search: string; onSearch: (value: string) => void; onSelect: (value: string) => void; showCurrent?: boolean; showActions?: boolean }) {
  const classmates = students.filter(row => String(row['模拟班级编号'] ?? '') === classId && String(row['学生编号'] ?? '') !== selectedStudent);
  const matches = search.trim() ? students.filter(row => String(row['学生编号'] ?? '').toLowerCase().includes(search.trim().toLowerCase())) : [];
  return <section className={styles.studentQuickRow} aria-label="学生快速切换"><div className={styles.studentQuickGroup}><span>选择学生</span>{showCurrent && <b className={styles.studentCurrentChip} aria-current="true">{selectedStudent} · 当前学生</b>}{classmates.slice(0, 3).map(row => { const id = String(row['学生编号'] ?? ''); return <button key={id} type="button" onClick={() => onSelect(id)}>{id}</button>; })}{!classmates.length && <small>当前班级暂无其他学生</small>}</div><label className={styles.studentSearch}>查找学生<input value={search} onChange={event => onSearch(event.target.value)} placeholder="输入学号"/></label>{matches.length > 0 && <div className={styles.studentSearchResults}>{matches.slice(0, 5).map(row => { const id = String(row['学生编号'] ?? ''); return <button key={id} type="button" onClick={() => { onSelect(id); onSearch(''); }}>{id} · {String(row['模拟班级编号'] ?? '未分班')}</button>; })}</div>}{showActions && <div className={styles.studentQuickActions}><Link to={{ pathname: routes.itemEvidence, search: new URLSearchParams({ student: selectedStudent, class: classId }).toString() }}><FileSearch size={14}/>完整证据</Link><Link to={{ pathname: routes.studentTeaching, search: new URLSearchParams({ student: selectedStudent, class: classId }).toString() }}><Sparkles size={14}/>个性化建议</Link></div>}</section>;
}

function StudentEvidenceSummary({ bundle, testName, indicatorName }: { bundle: Bundle; testName: string; indicatorName: string }) {
  const scoredRows = bundle.responses.filter(row => row.disposition === 'scored' && finite(row.score) !== null && finite(row.maximum) !== null && finite(row.maximum)! > 0);
  const scored = scoredRows.reduce((sum, row) => sum + finite(row.score)!, 0);
  const maximum = scoredRows.reduce((sum, row) => sum + finite(row.maximum)!, 0);
  const expected = Array.isArray(bundle.coverage.expected_material_ids) ? bundle.coverage.expected_material_ids.length : 0;
  const covered = new Set(scoredRows.map(row => String(row.material_id ?? '')).filter(Boolean)).size;
  return <section className={styles.studentEvidenceSummary} aria-label="当前学生证据概况">
    <div className={styles.studentMetric}><span>当前测验</span><strong>{testName}</strong><small>仅显示所选测验节点</small></div>
    <div className={styles.studentMetric}><span>有效作答题目</span><strong>{covered} / {expected}</strong><small>{scoredRows.length} 条有效评分记录；未评分不计入</small></div>
    <div className={styles.studentMetric}><span>关注观察指标</span><strong>{indicatorName}</strong><small>课程定义的观察指标，不等同于能力等级</small></div>
    <div className={`${styles.studentMetric} ${bundle.issues.length ? styles.studentMetricWarning : ''}`}><span>本次有效评分表现</span><strong>{maximum > 0 ? `${(scored / maximum * 100).toFixed(1)}%` : '暂无数据'}</strong><small>{bundle.issues.length ? `${bundle.issues.length} 项证据数据提示，详见作答记录` : '只汇总当前范围有效评分，不代表整体掌握程度'}</small></div>
  </section>;
}

function StudentScoreBars({ bundle }: { bundle: Bundle }) {
  const rows = bundle.responses.filter(row => row.disposition === 'scored' && finite(row.score) !== null && finite(row.maximum) !== null && finite(row.maximum)! > 0);
  return rows.length ? <div className={styles.studentScoreList}><p>逐题显示当前有效评分；缺失记录不作为零分。</p>{rows.map((row, index) => { const score = finite(row.score)!; const maximum = finite(row.maximum)!; return <div className={styles.studentScoreRow} key={`${String(row.record_id)}-${index}`}><span>{str(row.material_id)} · {str(row.record_id)}</span><progress aria-label={`${str(row.record_id)} 得分`} max={maximum} value={Math.max(0, Math.min(score, maximum))}/><strong>{score} / {maximum}</strong></div>; })}</div> : <EmptyState title="当前范围没有有效评分" detail="有作答记录不一定代表已经评分；未评分状态保持未知。"/>;
}

function RubricPointSummary({ bundle, params }: { bundle: Bundle; params: URLSearchParams }) {
  const definitions = new Map(bundle.rubric_definitions.map(row => [`${String(row.item_id)}:${String(row.point_id)}`, row]));
  const points = bundle.responses.flatMap(response => {
    const observation = response.rubric_observation as Row | undefined;
    if (response.disposition !== 'scored' || observation?.state !== 'valid' || !Array.isArray(observation.points)) return [];
    return (observation.points as Row[]).map(point => ({ response, point, definition: definitions.get(`${String(response.material_id)}:${String(point.point_id)}`) }));
  });
  return points.length ? <div className={styles.rubricPointList}>{points.map(({ response, point, definition }, index) => {
    const earned = finite(point.earned); const maximum = finite(point.maximum);
    return <article key={`${String(response.record_id)}-${String(point.point_id)}-${index}`}><div><b>{str(definition?.description, String(point.point_id ?? '评分点'))}</b><small>{str(response.material_id)} · {str(response.record_id)}</small></div><strong className={earned !== null && maximum !== null && earned < maximum ? styles.pointPartial : styles.pointComplete}>{earned === null || maximum === null ? '未知' : `${earned} / ${maximum}`}</strong><Link aria-label={`查看 ${str(response.material_id)} 作答证据`} to={{ pathname: `${routes.itemEvidence}/${encodeURIComponent(String(response.material_id))}`, search: params.toString() }}><ArrowRight size={14}/></Link></article>;
  })}<small>仅反映本次作答中的评分点记录；冲突或未知评分点不推断为零分。</small></div> : <EmptyState title="没有可汇总的评分点观察" detail="当前数据未提供有效且一致的逐点评分。可在题目证据中查看原始作答与评分状态。"/>;
}

function finite(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function EvidenceRefs({ ids }: { ids: string[] }) {
  return ids.length ? <div className={styles.evidenceRefList}>{[...new Set(ids)].map(id => <span key={id}><FileSearch size={12}/>{id}</span>)}</div> : <small className={styles.muted}>未关联具体作答记录。</small>;
}

function EvidenceRows({ bundle, selectedItem }: { bundle: Bundle; selectedItem?: string }) {
  const rows = bundle.responses.filter(row => !selectedItem || row.material_id === selectedItem);
  return rows.length ? <div className={styles.evidenceRows}>{rows.slice(0, 8).map((row, index) => <details key={String(row.evidence_id ?? index)}><summary><b>{str(row.record_id, '作答记录')}</b><span>{str(row.material_id)}</span><span className={styles.disposition}>{str(row.disposition, '状态未知')}</span></summary><div className={styles.responseBody}><p><b>最终作答：</b>{str(row.raw_response, '未提供')}</p><p><b>解答过程：</b>{str(row.solution_steps, '未提供')}</p><p><b>得分：</b>{str(row.score, '无评分')} / {str(row.maximum, '未知满分')}</p>{Boolean(row.rubric_observation) && <JsonSummary value={row.rubric_observation}/>}</div></details>)}</div> : <EmptyState title="当前范围没有作答记录" detail="没有记录不代表零分或未掌握。"/>;
}

function EvidenceDetail({ bundle, itemId, insights, studentClaims, studentClaimsPending, studentClaimsError, objectiveName, topicName, classId, search }: { bundle: Bundle; itemId?: string; insights?: ClassInsights; studentClaims: Claim[]; studentClaimsPending: boolean; studentClaimsError: Error | null; objectiveName: (id: string) => string; topicName: string; classId: string; search: URLSearchParams }) {
  const item = itemId ? bundle.items.find(row => row.material_id === itemId) : bundle.items[0];
  if (!item) return <EmptyState title="没有匹配题目" detail="当前证据包未返回这个题号。请从题目关联或学生诊断重新打开证据，避免查看其他题目的记录。"/>;
  const rows = bundle.responses.filter(row => row.material_id === item.material_id);
  const scoredRows = rows.filter(row => row.disposition === 'scored' && finite(row.score) !== null && finite(row.maximum) !== null);
  const scopeStudent = String(bundle.scope.student_id ?? '');
  const scopeNode = String(bundle.scope.node_id ?? '');
  const scopeIndicator = String(bundle.scope.indicator_id ?? '');
  const objective = objectiveName(scopeIndicator);
  const topicId = String(bundle.source_context?.topic_id ?? '');
  const comparison = insights?.comparisons.find(row => row.indicator_id === scopeIndicator);
  const studentPath = { pathname: routes.studentDiagnosis, search: search.toString() };
  const issueRows = bundle.issues.filter(issue => rows.some(row => row.record_id === issue.record_id && row.source_line === issue.source_line));
  const relatedClaims = studentClaims.filter(claim => claim.kind !== 'fact' && claim.evidence_refs.some(ref => ref.material_id === item.material_id));
  return <>
    <div className={styles.evidenceBreadcrumb}><Link to={{ pathname: routes.studentDiagnosis, search: search.toString() }}>学情诊断 / 学生个人诊断</Link><span>{scopeStudent}</span><b>{String(item.material_id)}</b></div>
    <div className={styles.evidenceContextBar} aria-label="题目证据范围"><span><FileSearch size={16}/><small>题目编号</small><b>{String(item.material_id)}</b></span><span><Layers3 size={16}/><small>关联主题</small><b>{topicName || topicId || '课程主题未提供'}</b></span><span><Target size={16}/><small>观察指标</small><b>{objective}</b></span><span><Users size={16}/><small>涉及学生</small><b>{scopeStudent}</b></span><span><BookOpen size={16}/><small>测验节点</small><b>{scopeNode}</b></span></div>
    <div className={styles.evidenceTopActions}><Link to={studentPath}><ArrowRight size={15}/>返回学生诊断</Link><Link to={{ pathname: routes.studentTeaching, search: search.toString() }}><Sparkles size={15}/>加入个性化建议</Link></div>
    <section className={styles.evidenceStatStrip} aria-label="当前题目证据概况"><div><span>当前学生作答记录</span><b>{rows.length}</b></div><div><span>有效评分记录</span><b>{scoredRows.length}</b></div><div><span>题目满分</span><b>{str(item.maximum, '未提供')}</b></div><div><span>评分点</span><b>{bundle.rubric_definitions.filter(definition => definition.item_id === item.material_id).length || '未提供'}</b></div></section>
    <div className={styles.twoColumns}>
      <Panel title="题目信息" icon={<FileSearch size={18}/> }><div className={styles.evidenceItemPrompt}><span>题目</span><h2>{str(item.prompt, '当前材料没有题干文本')}</h2></div><div className={styles.evidenceMeta}><span><BookOpen size={14}/>主题：{topicName || topicId || '未关联主题'}</span><span><Target size={14}/>指标：{objective}</span></div><h3 className={styles.evidenceSubheading}>评分点定义</h3>{bundle.rubric_definitions.filter(definition => definition.item_id === item.material_id).length ? <div className={styles.rubricDefinitionList}>{bundle.rubric_definitions.filter(definition => definition.item_id === item.material_id).map(definition => <div key={String(definition.point_id)}><span>{String(definition.point_id)}</span><b>{String(definition.description)}</b><small>{String(definition.maximum)} 分</small></div>)}</div> : <p className={styles.muted}>当前数据没有可解析的评分点定义。</p>}<small className={styles.itemMaximumNote}>题目满分：{str(item.maximum, '未提供')}</small></Panel>
      <Panel title="学生作答与评分" icon={<Users size={18}/>}>{rows.length ? <div className={styles.answerStack}>{rows.map((row, index) => <article className={styles.answerCard} key={String(row.evidence_id ?? index)}><header><b>学生作答（{scopeStudent}）</b><span>{String(row.record_id ?? '记录编号未提供')}</span><strong>{str(row.score, '未评分')} / {str(row.maximum, str(item.maximum, '未知满分'))}</strong></header><div className={styles.studentAnswerText}><p>{str(row.raw_response, '学生最终作答未提供')}</p>{Boolean(row.solution_steps) && <small>解答过程：{String(row.solution_steps)}</small>}</div><ResponseRubricObservation response={row} definitions={bundle.rubric_definitions.filter(definition => definition.item_id === item.material_id)}/></article>)}</div> : <EmptyState title="没有该题的学生作答记录" detail="没有记录不代表零分或未掌握。可以返回学生诊断切换学生或测验节点。"/>}</Panel>
    </div>
    <div className={styles.twoColumns}>
      <Panel title="评分数据核查" icon={<CircleHelp size={18}/>}>{issueRows.length ? issueRows.map((issue, index) => <Notice tone="warning" key={`${String(issue.record_id)}-${index}`}>{`${str(issue.code, '数据质量提示')} · ${str(issue.record_id)}：${str(issue.detail)}`}</Notice>) : <p className={styles.evidenceQualityClear}><Check size={15}/>当前题目范围没有关联数据质量提示。未评分、冲突和缺失状态仍按各自原始状态呈现。</p>}<p className={styles.coverage}>当前学生、指标和节点共 {rows.length} 条相关作答记录，其中 {scoredRows.length} 条通过质量口径作为有效评分。覆盖的其他题目：{Array.isArray(bundle.coverage.expected_material_ids) ? (bundle.coverage.expected_material_ids as string[]).filter(id => id !== item.material_id).join('、') || '无' : '未提供'}。</p></Panel>
      <Panel title="相似证据 / 班级表现" icon={<Activity size={18}/>}>{comparison?.status === 'available' ? <><p className={styles.evidenceComparisonNote}>以下为同一观察指标在该节点共同题目上的班级得分率，不代表本题单题正确率。</p><div className={styles.evidenceClassCompare}>{comparison.classes.map(row => <div key={row.class_id} className={row.class_id === classId ? styles.evidenceClassCurrent : ''}><span>{row.class_id}{row.class_id === classId ? '（当前班）' : ''}</span><b>{percent(row.common_ratio)}</b><small>{row.observed_student_count} 人 · {row.common_record_count} 条</small></div>)}</div></> : <EmptyState title="当前没有可比班级依据" detail="当前节点缺少共同作答题目时不展示班级比较，也不补零。"/>}</Panel>
    </div>
    <Panel title="本题关联的诊断观察" icon={<Target size={18}/>}>{studentClaimsPending ? <Loading label="正在核对有依据的跨题观察…"/> : studentClaimsError ? <Notice tone="warning">诊断观察暂时无法读取：{studentClaimsError.message}。题目作答和评分数据仍可查看。</Notice> : relatedClaims.length ? <><p className={styles.evidenceComparisonNote}>仅显示诊断接口返回且明确引用本题的跨题观察；请结合列出的证据和限制条件复核。</p><StudentDiagnosticClaims claims={relatedClaims} evidencePath={routes.itemEvidence} params={search}/></> : <p className={styles.noCrossItemClaim}><CircleHelp size={15}/>当前没有明确引用本题的跨题核验观察；这不代表题目不存在问题。单题表现和评分点事实见上方。</p>}</Panel>
    <Notice>本页只展示当前学生和所选题目的原始作答、评分点及数据质量事实，不从单题推断学生稳定能力或作答原因。<Link to={{ pathname: routes.studentTeaching, search: search.toString() }}>将已核验证据用于个性化建议 <ArrowRight size={14}/></Link></Notice>
  </>;
}

function ResponseRubricObservation({ response, definitions }: { response: Row; definitions: Row[] }) {
  const observation = response.rubric_observation as Row | undefined;
  if (!observation) return <p className={styles.rubricUnknown}>没有返回逐点评分观察；不将未知记为零分。</p>;
  if (observation.state !== 'valid' || !Array.isArray(observation.points)) return <p className={styles.rubricUnknown}>{observation.state === 'conflict' ? `评分点数据存在冲突：${Array.isArray(observation.conflicts) ? observation.conflicts.join('、') : '详见质量提示'}。` : String(observation.reason ?? '逐点评分状态未知。')} 不按零分处理。</p>;
  return <div className={styles.answerRubricList}><b>评分量表</b>{(observation.points as Row[]).map(point => { const definition = definitions.find(item => item.point_id === point.point_id); const earned = finite(point.earned); const maximum = finite(point.maximum); return <div key={String(point.point_id)}><span>{String(definition?.description ?? point.point_id)}</span><strong className={earned !== null && maximum !== null && earned < maximum ? styles.pointPartial : styles.pointComplete}>{earned === null || maximum === null ? '未知' : `${earned} / ${maximum}`}</strong></div>; })}</div>;
}

