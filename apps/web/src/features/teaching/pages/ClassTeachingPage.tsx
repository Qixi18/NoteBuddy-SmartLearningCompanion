import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight, ArrowRight, Bot, CheckCircle2, ClipboardCheck, History,
  Layers3, ShieldCheck, Sparkles, Users, XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorBox, Loading, Notice, Panel } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import {
  api, postJson, useClassReport, useClassTeachingPlans,
} from '../api';
import { ClassAdjustmentWorkflow } from '../components/ClassAdjustmentWorkflow';
import { ClassTeachingReport } from '../components/ClassTeachingReport';
import { useWorkbenchScope } from '../../shared/useWorkbenchScope';
import { str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

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
  const [reviewer, setReviewer] = useState('教师');
  const [reason, setReason] = useState('已核对班级诊断证据与方案内容。');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    // 方案版本变化时只同步编辑区内容；成功/失败提示保留到下一次操作，避免刚显示就被清空。
    setText(bodyToText(latestPlan?.plan as Row | undefined));
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
          reviewer: reviewer.trim() || '教师',
          reason: reason.trim() || '教师已核对班级诊断证据与方案内容。',
          plan: body,
        }),
      );
    },
    onSuccess: async data => {
      setError('');
      setMessage(`已保存第 ${str(data.version)} 版：${STATUS_LABELS[str(data.status)] ?? str(data.status)}。`);
      await queryClient.invalidateQueries({ queryKey: ['class-teaching-plans'] });
    },
    onError: cause => { setMessage(''); setError((cause as Error).message); },
  });

  const aiPreview = useQuery({
    queryKey: ['class-ai-analysis', runId, nodeId, classId],
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
      await queryClient.invalidateQueries({ queryKey: ['class-ai-analysis'] });
      await queryClient.invalidateQueries({ queryKey: ['class-teaching-plans'] });
    },
    onError: cause => { setMessage(''); setError((cause as Error).message); },
  });

  const canReview = Boolean(latestPlan) && Boolean(reviewer.trim()) && !latestPlan?.stale;
  const busy = draft.isPending || review.isPending;
  const findings = useMemo(() => {
    const analysis = aiPreview.data?.analysis;
    if (!analysis || typeof analysis !== 'object') return [];
    const list = (analysis as Row).findings;
    return Array.isArray(list) ? list as Row[] : [];
  }, [aiPreview.data]);
  const modelConfigured = Boolean((aiPreview.data as Row | undefined)?.model_configured);
  const aiAnalysis = (aiPreview.data?.analysis ?? aiRun.data) as Row | undefined;

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

  return <div className={styles.pageStack}>
    <Notice>
      班级教学方案绑定当前班级与测验节点：系统生成的是<b>规则草稿</b>，必须由教师核对证据后采纳或修改才生效。
      历史版本只增不改，来源或数据变化后旧方案会被标记为过期。
    </Notice>

    <div className={styles.classScopeBar} aria-label="班级教学方案范围">
      <span><Users size={15}/><b>班级</b> {classId}</span>
      <span><Layers3 size={15}/><b>测验节点</b> {nodeId || '未选择'}</span>
      <span><History size={15}/><b>版本</b> {history.data?.plans.length ?? 0} 个</span>
    </div>

    <div className={styles.twoColumns}>
      <Panel
        title="班级教学分析报告"
        icon={<Users size={18}/>}
        action={<button className={styles.textButton} onClick={() => window.print()}>打印报告</button>}
      >
        {report.isPending ? <Loading label="读取班级教学分析依据…"/>
          : report.isError ? <ErrorBox message={(report.error as Error).message} onRetry={() => void report.refetch()}/>
          : report.data ? <ClassTeachingReport value={report.data}/>
          : <EmptyState title="班级报告暂不可用" detail="当前班级与测验节点没有可展示的教学分析依据。"/>}
      </Panel>

      <Panel
        title="班级教学方案"
        icon={<ClipboardCheck size={18}/>}
        action={<button
          className={styles.textButton}
          disabled={draft.isPending || !nodeId}
          onClick={() => { setError(''); draft.mutate(); }}
        >
          <Sparkles size={15}/>{draft.isPending ? '正在生成…' : latestPlan ? '按当前证据重新生成' : '生成规则方案'}
        </button>}
      >
        {history.isPending ? <Loading label="读取方案历史…"/>
          : history.isError ? <ErrorBox message={(history.error as Error).message}/>
          : !latestPlan ? <EmptyState
              title="尚无班级教学方案"
              detail="根据当前班级在该测验节点的有效评分记录生成规则草稿；没有有效证据时系统不会生成空话方案。"
            />
          : <>
              <div className={styles.draftFields}>
                <label>当前版本
                  <p>第 {str(latestPlan.version)} 版 · {STATUS_LABELS[str(latestPlan.status)] ?? str(latestPlan.status)}
                    {' · '}{latestPlan.reviewer ? `审核人 ${str(latestPlan.reviewer)}` : '尚未审核'}
                    {' · '}{formatTime(latestPlan.updated_at)}</p>
                </label>
                {Boolean(latestPlan.stale) && <Notice tone="warning">
                  来源核验或作答数据已变化，该版本已过期。请重新生成方案后再采纳。
                </Notice>}
              </div>

              <div className={styles.caseForm} data-testid="class-plan-editor">
                {SECTIONS.map(section => <label key={section.key}>
                  {section.label}
                  <textarea
                    rows={3}
                    value={text[section.key]}
                    placeholder={section.hint}
                    onChange={event => setText(current => ({ ...current, [section.key]: event.target.value }))}
                  />
                </label>)}
                <div className={styles.adjustmentFormGrid}>
                  <label>审核人<input value={reviewer} maxLength={200} onChange={event => setReviewer(event.target.value)} placeholder="填写审核人姓名"/></label>
                  <label>审核说明<input value={reason} maxLength={200} onChange={event => setReason(event.target.value)} placeholder="说明核对依据"/></label>
                </div>
              </div>

              <div className={styles.reviewActions}>
                <button
                  type="button"
                  disabled={!canReview || busy}
                  onClick={() => { setError(''); review.mutate({ status: 'accepted', withPlan: true }); }}
                ><CheckCircle2 size={15}/>采纳并保存</button>
                <button
                  type="button"
                  disabled={!canReview || busy}
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

    <Panel title="方案版本历史" icon={<History size={18}/>}>
      {history.isPending ? <Loading label="读取版本历史…"/>
        : !history.data?.plans.length ? <EmptyState title="暂无历史版本" detail="生成或审核方案后，每个版本都会保留在这里。"/>
        : <div className={styles.adjustmentList}>{[...(history.data?.plans ?? [])].reverse().map(plan => <details className={styles.adjustmentRecord} key={str(plan.plan_id)}>
            <summary>
              <b>第 {str(plan.version)} 版 · {STATUS_LABELS[str(plan.status)] ?? str(plan.status)}</b>
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
    </Panel>

    <ClassAdjustmentWorkflow runId={runId} classId={classId} nodeId={nodeId} plan={latestPlan}/>

    <Panel
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
            {!modelConfigured && <Notice tone="warning">未配置模型服务：本页不会调用外部模型，规则方案仍可正常生成与审核。</Notice>}
            {aiAnalysis && <p className={styles.limitation}>分析状态：{aiAnalysis.status === 'complete' ? '已完成' : aiAnalysis.status === 'partial' ? '部分完成' : aiAnalysis.status === 'failed' ? '失败' : str(aiAnalysis.status)} · 第 {str(aiAnalysis.generation, '1')} 次 · 模型 {str(aiAnalysis.model)}</p>}
            {findings.length ? <div className={styles.issueList}>{findings.map((finding, index) => <article key={`${str(finding.category, 'finding')}-${index}`}>
              <span className={styles.issueRank}>{index + 1}</span>
              <div>
                <strong>{str(finding.claim, '模型观察')}</strong>
                <p>{str(finding.interpretation, '')}</p>
                <small>{str(finding.next_step, '')}{finding.support_level ? ` · 支持程度 ${str(finding.support_level)}` : ''}</small>
              </div>
            </article>)}</div>
              : <EmptyState title="当前还没有班级 AI 分析结果" detail="生成后会在这里显示带证据引用的教师向观察。"/>}
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

    <Panel title="教师教学流程" icon={<ArrowDownRight size={18}/>}>
      <ol className={styles.flow}>
        <li><b>查看班级诊断</b><span>确认共同题目范围、有效记录与数据质量。</span></li>
        <li><b>生成并核对方案</b><span>规则草稿基于当前证据；可用 AI 分析作参考，但不能替代教师判断。</span></li>
        <li><b>采纳或修改</b><span>保存后形成新版本；来源变化后旧版本会被标记为过期。</span></li>
      </ol>
    </Panel>
  </div>;
}
