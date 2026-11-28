import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, Bot, CheckCircle2, ClipboardCheck, History,
  Layers3, ShieldCheck, Sparkles, Users, XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorBox, Loading, Notice, Panel } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import {
  api, postJson, useClassReport, useClassTeachingPlans,
} from '../api';
import { queryKeys } from '../../../api/queries';
import { ClassAdjustmentWorkflow } from '../components/ClassAdjustmentWorkflow';
import { ClassTeachingReport } from '../components/ClassTeachingReport';
import { ClassPlanEditor } from '../components/ClassPlanEditor';
import { ClassPlanReader } from '../components/ClassPlanReader';
import { useWorkbenchScope } from '../../shared/useWorkbenchScope';
import { str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';
import pageStyles from './ClassTeachingPage.module.css';

const SECTIONS = [
  { key: 'teaching_objectives', label: '教学目标', hint: '每行一条：本次要解决的教学问题' },
  { key: 'key_problems', label: '关键问题', hint: '每行一条：来自班级诊断的具体证据' },
  { key: 'teaching_actions', label: '教学行动', hint: '每行一条：课堂上的实施步骤' },
  { key: 'differentiated_actions', label: '分层行动', hint: '每行一条：对记录不足或差异学生的安排' },
  { key: 'resource_recommendations', label: '资源与题目', hint: '每行一条：使用的共同题目或材料' },
  { key: 'observation_points', label: '观察点', hint: '每行一条：复测时看什么' },
  { key: 'adjustment_conditions', label: '调整条件', hint: '每行一条：达到什么条件就调整教学' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];
type PlanText = Record<SectionKey, string>;

const REQUIRED: SectionKey[] = [
  'teaching_objectives', 'key_problems', 'teaching_actions', 'observation_points', 'adjustment_conditions',
];

const STATUS_LABELS: Record<string, string> = {
  draft: '规则草稿',
  accepted: '已采纳',
  edited: '教师修改后保存',
  rejected: '已驳回',
  needs_observation: '继续观察',
};

function emptyText(): PlanText {
  return SECTIONS.reduce((acc, section) => ({ ...acc, [section.key]: '' }), {} as PlanText);
}

function bodyToText(body: Row | undefined): PlanText {
  const text = emptyText();
  for (const section of SECTIONS) {
    const value = body?.[section.key];
    text[section.key] = Array.isArray(value) ? value.map(String).join('\n') : '';
  }
  return text;
}

function textToBody(text: PlanText): Record<string, string[]> {
  const body: Record<string, string[]> = {};
  for (const section of SECTIONS) {
    body[section.key] = text[section.key]
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  }
  return body;
}

function missingSections(text: PlanText): string[] {
  return REQUIRED.filter(key => !text[key].split('\n').some(line => line.trim()))
    .map(key => SECTIONS.find(section => section.key === key)?.label ?? key);
}

function formatTime(value: unknown): string {
  const raw = str(value, '');
  if (!raw) return '时间未提供';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString('zh-CN');
}

export function ClassTeachingPage() {
  const queryClient = useQueryClient();
  const { run, runQuery, scope } = useWorkbenchScope();
  const runId = run?.run_id ?? '';
  const classId = scope.classId;
  const nodeId = scope.nodeId;

  const report = useClassReport(runId, nodeId, classId);
  const history = useClassTeachingPlans(runId, classId, nodeId);
  const latestPlan = history.data?.plans.at(-1);
  const latestPlanId = str(latestPlan?.plan_id, '');

  const [text, setText] = useState<PlanText>(emptyText);
  const [reviewBaseline, setReviewBaseline] = useState<PlanText>(emptyText);
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);

  useEffect(() => {
    // 方案版本变化时只同步编辑区内容；成功/失败提示保留到下一次操作，避免刚显示就被清空。
    setText(bodyToText(latestPlan?.plan as Row | undefined));
    setReviewBaseline(bodyToText(latestPlan?.plan as Row | undefined));
    setEditingPlan(false);
  }, [latestPlanId]);

  const draft = useMutation({
    mutationFn: () => api<Row>('/api/class-teaching-plans/draft', postJson({
      class_id: classId, node_id: nodeId, reviewer: reviewer.trim(),
    })),
    onSuccess: async data => {
      setError('');
      setMessage(data.reused
        ? '当前证据下已存在同一版草稿，已直接复用。'
        : `已生成第 ${str(data.version)} 版规则草稿。请核对后采纳或修改。`);
      await queryClient.invalidateQueries({ queryKey: ['class-teaching-plans'] });
    },
    onError: cause => { setMessage(''); setError((cause as Error).message); },
  });

  const review = useMutation({
    mutationFn: (input: { status: string; withPlan: boolean }) => {
      if (!latestPlan) throw new Error('请先生成班级教学方案草稿。');
      const body = input.withPlan ? textToBody(text) : undefined;
      if (input.withPlan) {
        const missing = missingSections(text);
        if (missing.length) throw new Error(`请补齐必填部分：${missing.join('、')}`);
      }
      return api<Row>(
        `/api/class-teaching-plans/${encodeURIComponent(String(latestPlan.plan_id))}/review`,
        postJson({
          run_id: runId,
          status: input.status,
          reviewer: reviewer.trim(),
          reason: reason.trim(),
          plan: body,
        }),
      );
    },
    onSuccess: async data => {
      setError('');
      setMessage(`已保存第 ${str(data.version)} 版：${STATUS_LABELS[str(data.status)] ?? str(data.status)}。`);
      setEditingPlan(false);
      await queryClient.invalidateQueries({ queryKey: ['class-teaching-plans'] });
    },
    onError: cause => { setMessage(''); setError((cause as Error).message); },
  });

  const aiPreview = useQuery({
    queryKey: queryKeys.classAiAnalysis(runId, nodeId, classId),
    queryFn: () => api<Row>(
      `/api/ai-analysis?task=task02&node_id=${encodeURIComponent(nodeId)}&class=${encodeURIComponent(classId)}`,
    ),
    enabled: Boolean(runId && nodeId && classId),
  });

  const aiRun = useMutation({
    mutationFn: () => api<Row>('/api/ai-analysis', postJson({
      task: 'task02',
      action: aiPreview.data?.analysis ? 'refresh' : 'generate',
      node_id: nodeId,
      class_id: classId,
      preview_fingerprint: aiPreview.data?.source_fingerprint,
      request_id: `${runId}-${classId}-${nodeId}-${Date.now()}`,
      transmission_confirmed: true,
    })),
    onSuccess: async () => {
      setError('');
      setMessage('班级 AI 分析已生成。它只作为方案参考，仍需教师核对证据后采纳。');
      await queryClient.invalidateQueries({ queryKey: queryKeys.classAiAnalysis(runId, nodeId, classId) });
      await queryClient.invalidateQueries({ queryKey: ['class-teaching-plans'] });
    },
    onError: cause => { setMessage(''); setError((cause as Error).message); },
  });

  const normalizeText = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean).join('\n');
  const bodyChanged = SECTIONS.some(section => normalizeText(text[section.key]) !== normalizeText(reviewBaseline[section.key]));
  const canReview = Boolean(latestPlan) && Boolean(latestPlanId)
    && Boolean(reviewer.trim()) && Boolean(reason.trim()) && !latestPlan?.stale;
  const busy = draft.isPending || review.isPending;
  const generatedAnalysis = aiRun.data as Row | undefined;
  const generatedAnalysisIsCurrent = Boolean(generatedAnalysis
    && !generatedAnalysis.stale
    && String(generatedAnalysis.source_fingerprint ?? '')
      === String(aiPreview.data?.source_fingerprint ?? ''));
  const aiAnalysis = (aiPreview.data?.analysis ?? (generatedAnalysisIsCurrent ? generatedAnalysis : undefined)) as Row | undefined;
  const findings = useMemo(() => {
    const analysis = aiAnalysis;
    if (!analysis || typeof analysis !== 'object') return [];
    const list = analysis.findings;
    return Array.isArray(list) ? list as Row[] : [];
  }, [aiAnalysis]);
  const modelConfigured = Boolean((aiPreview.data as Row | undefined)?.model_configured);
  const sections = [
    { id: 'class-overview', label: '班级总览' }, { id: 'class-evidence', label: '诊断证据' },
    { id: 'class-plan', label: '教学方案' }, { id: 'class-plan-history', label: '版本历史' },
    { id: 'class-implementation', label: '实施复测' }, { id: 'class-ai-analysis', label: 'AI 分析' },
  ];
  const navigateToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (runQuery.isPending) return <Loading/>;
  if (!run) {
    return <EmptyState
      title="当前没有分析运行"
      detail="请先在教学工作台导入课程与学情数据。"
      action={<Link className={styles.linkButton} to={routes.dashboard}>前往教学工作台 <ArrowRight size={15}/></Link>}
    />;
  }
  if (!classId) {
    return <EmptyState title="请选择班级" detail="班级教学方案必须绑定一个明确的班级与测验节点。"/>;
  }

  return <div className={`${styles.pageStack} ${pageStyles.page}`} data-testid="class-teaching-page">
    <Notice>流程：核对诊断证据 → 生成规则草稿 → 教师采纳或修改 → 登记实施并复测；历史版本只增不改，来源变化后标记过期。AI 仅作辅助参考。</Notice>

    <div className={styles.classScopeBar} aria-label="班级教学方案范围">
      <span><Users size={15}/><b>班级</b> {classId}</span>
      <span><Layers3 size={15}/><b>测验节点</b> {nodeId || '未选择'}</span>
      <span><History size={15}/><b>版本</b> {history.data?.plans.length ?? 0} 个</span>
    </div>

    <nav className={pageStyles.sectionNav} aria-label="班级教学建议页面导航">
      {sections.map(section => <button key={section.id} type="button" onClick={() => navigateToSection(section.id)}>{section.label}</button>)}
    </nav>

    <div id="class-overview" className={`${styles.classTeachingReport} ${pageStyles.overviewGrid}`}>
      <Panel
        id="class-overview-card"
        title="班级教学分析报告"
        icon={<Users size={18}/>}
        action={<button className={styles.textButton} onClick={() => window.print()}>打印报告</button>}
      >
        {report.isPending ? <Loading label="读取班级教学分析依据…"/>
          : report.isError ? <ErrorBox message={(report.error as Error).message} onRetry={() => void report.refetch()}/>
          : report.data ? <div id="class-evidence" className={pageStyles.evidenceArea} data-testid="class-evidence-area"><ClassTeachingReport value={report.data}/></div>
          : <EmptyState title="班级报告暂不可用" detail="当前班级与测验节点没有可展示的教学分析依据。"/>}
      </Panel>

      <Panel
        id="class-plan"
        title="班级教学方案"
        icon={<ClipboardCheck size={18}/>}
        action={<div className={styles.classPlanActions}>
          {latestPlan && !editingPlan && <button className={styles.textButton} onClick={() => setEditingPlan(true)}>{['accepted', 'edited'].includes(str(latestPlan.status)) ? '创建修订版本' : '编辑方案'}</button>}
          <button className={styles.textButton} disabled={draft.isPending || !nodeId} onClick={() => { setError(''); draft.mutate(); }}>
            <Sparkles size={15}/>{draft.isPending ? '正在生成…' : latestPlan ? '按当前证据重新生成' : '生成规则方案'}
          </button>
        </div>}
      >
        {history.isPending ? <Loading label="读取方案历史…"/>
          : history.isError ? <ErrorBox message={(history.error as Error).message}/>
          : !latestPlan ? <EmptyState
              compact
              title="尚无班级教学方案"
              detail="根据当前班级在该测验节点的有效评分记录生成规则草稿；没有有效证据时系统不会生成空话方案。"
            />
          : <>
              {Boolean(latestPlan.stale) && <Notice tone="warning">
                来源核验或作答数据已变化，该版本已过期。请重新生成方案后再采纳。
              </Notice>}
              <div className={pageStyles.planState} data-status={str(latestPlan.status)}>
                <strong>{STATUS_LABELS[str(latestPlan.status)] ?? str(latestPlan.status)}</strong>
                <span>第 {str(latestPlan.version)} 版 · {latestPlan.generation_source === 'ai' ? 'AI 参考生成' : '规则生成'}</span>
                {Boolean(latestPlan.stale) && <span>来源或数据已变化</span>}
              </div>

              {editingPlan ? <>
                <ClassPlanEditor sections={SECTIONS.map(section => ({ ...section, value: text[section.key] }))} resizeKey={latestPlanId} onChange={(key, value) => setText(current => ({ ...current, [key]: value }))}/>
                {missingSections(text).length > 0 && <p className={pageStyles.validationHint} role="status">请补齐必填部分：{missingSections(text).join('、')}。两个选填部分可以留空。</p>}
                <div className={styles.adjustmentFormGrid}>
                  <label>审核人<input value={reviewer} maxLength={200} onChange={event => setReviewer(event.target.value)} placeholder="填写审核人姓名"/></label>
                  <label>审核说明<textarea rows={2} value={reason} maxLength={4000} onChange={event => setReason(event.target.value)} placeholder="说明核对依据与处理意见（最多 4000 字）"/></label>
                </div>
              </> : <ClassPlanReader sections={SECTIONS.map(section => ({ ...section, value: text[section.key] }))} status={<>第 {str(latestPlan.version)} 版 · {STATUS_LABELS[str(latestPlan.status)] ?? str(latestPlan.status)} · {latestPlan.reviewer ? `审核人 ${str(latestPlan.reviewer)}` : '尚未审核'} · {formatTime(latestPlan.updated_at)}</>}/>}

              <div className={styles.reviewActions}>
                <button
                  type="button"
                  disabled={!canReview || bodyChanged || missingSections(text).length > 0 || busy}
                  onClick={() => { setError(''); review.mutate({ status: 'accepted', withPlan: true }); }}
                ><CheckCircle2 size={15}/>采纳并保存</button>
                <button
                  type="button"
                  disabled={!canReview || !bodyChanged || missingSections(text).length > 0 || busy}
                  onClick={() => { setError(''); review.mutate({ status: 'edited', withPlan: true }); }}
                ><ShieldCheck size={15}/>保存教师修改</button>
                <button
                  type="button"
                  disabled={!canReview || busy}
                  onClick={() => { setError(''); review.mutate({ status: 'needs_observation', withPlan: false }); }}
                ><ClipboardCheck size={15}/>继续观察</button>
                <button
                  type="button"
                  className={styles.rejectButton}
                  disabled={!canReview || busy}
                  onClick={() => { setError(''); review.mutate({ status: 'rejected', withPlan: false }); }}
                ><XCircle size={15}/>驳回方案</button>
              </div>
              {message && <p role="status" className={styles.limitation}>{message}</p>}
              {error && <Notice tone="error">{error}</Notice>}
            </>}
      </Panel>
    </div>

    <Panel id="class-plan-history" title="方案版本历史" icon={<History size={18}/>}>
      <details className={styles.versionHistory} data-testid="class-plan-history-details">
        <summary>查看版本历史（{history.data?.plans.length ?? 0} 个版本）</summary>
        {history.isPending ? <Loading label="读取版本历史…" compact/>
        : !history.data?.plans.length ? <EmptyState compact title="暂无历史版本" detail="生成或审核方案后，每个版本都会保留在这里。"/>
        : <div className={styles.adjustmentList}>{[...(history.data?.plans ?? [])].reverse().map((plan, index) => <details className={`${styles.adjustmentRecord} ${index === 0 ? pageStyles.latestHistoryItem : ''}`} key={str(plan.plan_id)}>
            <summary>
              <b>第 {str(plan.version)} 版 · {STATUS_LABELS[str(plan.status)] ?? str(plan.status)}</b>
              <span>{plan.generation_source === "ai" ? "AI 参考生成" : "规则生成"}</span>
              <span>{plan.reviewer ? `审核人 ${str(plan.reviewer)}` : '未审核'}</span>
              <span>{formatTime(plan.updated_at)}</span>
              {Boolean(plan.stale) && <span>已过期</span>}
            </summary>
            <div className={styles.adjustmentRecordBody}>
              {plan.review_reason ? <p><strong>审核说明：</strong>{str(plan.review_reason)}</p> : null}
              {SECTIONS.map(section => {
                const values = (plan.plan as Row | undefined)?.[section.key];
                const lines = Array.isArray(values) ? values.map(String) : [];
                if (!lines.length) return null;
                return <p key={section.key}><strong>{section.label}：</strong>{lines.join('；')}</p>;
              })}
            </div>
          </details>)}</div>}
      </details>
    </Panel>

    <div id="class-implementation" className={pageStyles.anchor}><ClassAdjustmentWorkflow runId={runId} classId={classId} nodeId={nodeId} plan={latestPlan} nodes={run?.nodes ?? []}/></div>

    <Panel
        id="class-ai-analysis"
      title="班级 AI 分析（可选）"
      icon={<Bot size={18}/>}
      action={<span className={styles.topicFocusMeta}>{modelConfigured ? '模型服务已配置' : '未配置模型服务'}</span>}
    >
      {aiPreview.isPending ? <Loading label="读取班级 AI 分析状态…"/>
        : aiPreview.isError ? <ErrorBox message={(aiPreview.error as Error).message} onRetry={() => void aiPreview.refetch()}/>
        : <>
            <p className={styles.limitation}>
              外部模型只接收当前班级、当前测验节点的脱敏证据；传输前需要教师明确确认。
              没有配置模型时，规则方案与审核流程仍可完整演示。
            </p>
            {Boolean(aiPreview.data?.stale) && <Notice tone="warning">已有 AI 分析对应旧证据或来源版本，当前不会作为有效分析展示；确认范围后可重新生成。</Notice>}
            {!modelConfigured && <Notice tone="warning">未配置模型服务：本页不会调用外部模型，规则方案仍可正常生成与审核。</Notice>}
            {aiAnalysis && <p className={styles.limitation}>分析状态：{aiAnalysis.status === 'complete' ? '已完成' : aiAnalysis.status === 'partial' ? '部分完成' : aiAnalysis.status === 'failed' ? '失败' : str(aiAnalysis.status)} · 第 {str(aiAnalysis.generation, '1')} 次 · 模型 {str(aiAnalysis.model)}</p>}
            {!aiAnalysis && <p className={styles.limitation}>尚无当前范围的分析结果 · 发现数量 {findings.length}</p>}
            <details className={pageStyles.aiDetails} data-testid="class-ai-findings">
              <summary>查看详细发现（{findings.length}）</summary>
              {findings.length ? <div className={styles.issueList}>{findings.map((finding, index) => <article key={`${str(finding.category, 'finding')}-${index}`}>
                <span className={styles.issueRank}>{index + 1}</span><div>
                  {Boolean(finding.category) && <small>{str(finding.category)}</small>}
                  <strong>{str(finding.claim, '模型观察')}</strong>
                  {Boolean(finding.interpretation) && <p>{str(finding.interpretation)}</p>}
                  {Boolean(finding.next_step) && <p><b>教学参考：</b>{str(finding.next_step)}</p>}
                  {Boolean(finding.support_level) && <small>证据支持程度：{str(finding.support_level)}</small>}
                </div>
              </article>)}</div> : <EmptyState compact title="当前还没有班级 AI 分析结果" detail="生成后会在这里显示带证据引用的教师向观察。"/>}
            </details>
            <div className={styles.aiConsent}>
              <label>
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={!modelConfigured || aiRun.isPending}
                  onChange={event => setConsent(event.target.checked)}
                />
                <span>我已确认传输范围：当前班级、当前节点、脱敏证据。</span>
              </label>
              <button
                type="button"
                className={styles.textButton}
                disabled={!modelConfigured || !consent || aiRun.isPending}
                onClick={() => { setError(''); aiRun.mutate(); }}
              ><Bot size={15}/>{aiRun.isPending ? '正在请求模型分析…' : aiPreview.data?.analysis ? '重新生成班级 AI 分析' : '确认传输并生成班级 AI 分析'}</button>
            </div>
            {aiRun.isError && <ErrorBox message={(aiRun.error as Error).message}/>}
          </>}
    </Panel>


  </div>;
}
