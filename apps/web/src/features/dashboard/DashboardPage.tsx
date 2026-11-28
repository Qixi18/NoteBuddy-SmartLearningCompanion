import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, ArrowRight, BookOpen, Bot, CheckCircle2, CircleHelp, ClipboardCheck, FileUp, GraduationCap, Layers3, Lightbulb, RefreshCw, Sparkles, Target, Users, UploadCloud } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, postJson } from '../../api/client';
import { useCases, useClassInsights, useReadiness } from '../../api/queries';
import { useWorkbenchScope } from '../shared/useWorkbenchScope';
import { applyScope } from '../shared/scopeUtils';
import type { ApiProblem, RunData } from '../../types/api';
import { EmptyState, ErrorBox, Loading, Metric, Notice, Panel } from '../../components/PageBits';
import { ReactECharts } from '../../components/ReactECharts';
import { routes } from '../../app/routes';
import { MAX_TOTAL_BYTES, formatBytes, validateImportFiles } from './importValidation';
import { ExportPanel } from './components/ExportPanel';
import { ReleasePanel } from './components/ReleasePanel';
import styles from './DashboardPage.module.css';

function nameOf(row: Record<string, unknown>, fields: string[], fallback: string) {
  for (const field of fields) if (typeof row[field] === 'string' && row[field]) return String(row[field]);
  return fallback;
}
function pct(value: number | null | undefined) { return value == null || !Number.isFinite(value) ? '暂无可比数据' : `${(value * 100).toFixed(1)}%`; }

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { run, runQuery, scope, search, params } = useWorkbenchScope();
  const readiness = useReadiness();
  const { classId, nodeId } = scope;
  const insights = useClassInsights(run?.run_id ?? '', nodeId);
  const cases = useCases(run?.run_id ?? '', nodeId, Boolean(run));
  const importMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const selected = Array.from(files);
      const validation = validateImportFiles(selected);
      if (!validation.ok) throw new Error(validation.errors.join(' '));
      if (validation.selection.pdf.length) setImportMessage(`正在读取 ${formatBytes(validation.selection.totalBytes)} 数据（含 PDF 编码）…`);
      const csv: Record<string, string> = {};
      const pdf: Record<string, string> = {};
      for (const file of selected) {
        if (file.name.toLowerCase().endsWith('.csv')) csv[file.name] = await file.text();
        if (file.name.toLowerCase().endsWith('.pdf')) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = '';
          const chunk = 0x8000;
          for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
          pdf[file.name] = btoa(binary);
        }
      }
      if (!Object.keys(csv).length) throw new Error('请至少选择一份 CSV 数据文件。');
      return api<{ run_id: string; quality: RunData['quality'] }>('/api/import-files', postJson({ files: csv, pdf_files: pdf }));
    },
    onSuccess: async result => {
      setImportMessage(`导入完成，新运行 ${result.run_id.slice(0, 8)} 已建立。`);
      setImportError('');
      await queryClient.invalidateQueries();
    },
    onError: error => { setImportError((error as Error).message); setImportMessage(''); },
  });

  const classStats = insights.data?.classes.find(item => item.class_id === classId);
  const classStudents = useMemo(() => run?.students.filter(row => String(row['模拟班级编号'] ?? '') === classId) ?? [], [run, classId]);
  const classCases = cases.data?.filter(item => item.class_id === classId) ?? [];
  const caseOrderingUnclear = !cases.isPending && !cases.isError && !cases.data?.length && Boolean(run?.node_ordering_ambiguous_ids?.length);
  const comparisons = insights.data?.comparisons ?? [];
  const ratios = comparisons.map(comparison => {
    const classResult = comparison.classes.find(row => row.class_id === classId);
    const objective = run?.objectives.find(row => row['指标编号'] === comparison.indicator_id);
    return {
      indicator: comparison.indicator_id,
      label: nameOf(objective ?? {}, ['观察指标', '指标名称', '名称'], comparison.indicator_id),
      ratio: classResult?.ratio ?? null,
      common: classResult?.common_ratio ?? null,
      comparable: comparison.status === 'available',
    };
  });
  const priority = [...ratios].filter(item => item.ratio != null).sort((a, b) => (a.ratio ?? 1) - (b.ratio ?? 1)).slice(0, 3);
  const quality = run?.quality;
  const chartBar = {
    animationDuration: 500,
    textStyle: { fontFamily: 'Inter, "Microsoft YaHei", "PingFang SC", sans-serif' },
    grid: { left: 172, right: 36, top: 18, bottom: 38 },
    xAxis: { type: 'value', min: 0, max: 1, axisLabel: { color: '#849188', fontSize: 12, hideOverlap: true, formatter: (v: number) => `${Math.round(v * 100)}%` }, splitLine: { lineStyle: { color: '#edf1ed' } } },
    yAxis: { type: 'category', data: ratios.map(item => item.label).slice(0, 6).reverse(), axisLabel: { color: '#52645a', width: 150, overflow: 'break', lineHeight: 18, fontSize: 13 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{ type: 'bar', data: ratios.slice(0, 6).map(item => item.ratio).reverse(), barWidth: 18, showBackground: true, backgroundStyle: { color: '#f0f4f0', borderRadius: 9 }, itemStyle: { color: '#13864a', borderRadius: [0, 8, 8, 0] }, label: { show: true, position: 'right', fontSize: 13, formatter: (p: { value: number | null }) => p.value == null ? '—' : `${(p.value * 100).toFixed(1)}%`, color: '#24352e', fontWeight: 700 } }],
    tooltip: { trigger: 'axis', textStyle: { fontSize: 13 }, valueFormatter: (value: number | null) => pct(value) },
  };
  const distribution = {
    animation: false,
    tooltip: { trigger: 'item', formatter: '{b}: {c} 人（{d}%）' },
    color: ['#11834a', '#68c56b', '#bce9b2', '#dfefdc'],
    series: [{ type: 'pie', radius: ['56%', '78%'], center: ['50%', '50%'], avoidLabelOverlap: true, itemStyle: { borderColor: '#fff', borderWidth: 4 }, label: { show: false }, data: (insights.data?.classes ?? []).map(item => ({ name: item.class_id, value: item.student_count })) }],
  };

  if (runQuery.isPending) return <Loading/>;
  if (!run) {
    const notImported = (runQuery.error as ApiProblem | null)?.status === 400 || (runQuery.error as ApiProblem | null)?.status === 404;
    const requiredFiles = [
      { name: '课程要求.csv', group: 'course' },
      { name: '题目与材料.csv', group: 'course' },
      { name: '字段说明.csv', group: 'course' },
      { name: '模拟学生.csv', group: 'records' },
      { name: '测验节点.csv', group: 'records' },
      { name: '作答记录.csv', group: 'records' },
    ];
    return <div className={styles.firstRun}>
      <section className={styles.onboarding} aria-labelledby="first-run-title">
        <div className={styles.onboardingHeading}><div><span className={styles.kicker}>首次使用</span><h2 id="first-run-title">建立你的教学分析工作台</h2><p>导入课程资料和学生作答数据，开始进行有证据支持的教学分析。</p></div><GraduationCap className={styles.onboardingIcon} size={36} aria-hidden="true"/></div>
        <div className={styles.workflow} aria-label="使用流程">
          <div className={`${styles.workflowStep} ${styles.workflowCurrent}`} aria-current="step"><span>01</span><div><strong>导入数据</strong><small>准备课程与学情资料</small></div></div>
          <div className={styles.workflowStep}><span>02</span><div><strong>分析学情</strong><small>查看班级与学生诊断</small></div></div>
          <div className={styles.workflowStep}><span>03</span><div><strong>制定教学</strong><small>生成建议与实施方案</small></div></div>
        </div>
      </section>
      {!notImported && runQuery.error && <ErrorBox message={(runQuery.error as Error).message} onRetry={() => void runQuery.refetch()}/>}
      <Panel title="导入课程与学情数据" icon={<UploadCloud size={20}/>} className={styles.firstRunImport}>
        <div className={styles.importBody}>
          <div className={styles.importCopy}><div className={styles.uploadPrompt}><FileUp size={34}/><strong>选择数据文件</strong><p>支持 CSV 数据文件，可同时选择教材 PDF</p><span>单次原始文件总量不超过 {formatBytes(MAX_TOTAL_BYTES)}</span></div><button className={styles.importAction} disabled={importMutation.isPending} onClick={() => inputRef.current?.click()}><FileUp size={19}/>{importMutation.isPending ? '正在校验并导入…' : '选择文件并导入'}</button><small className={styles.importSubtext}>文件选择后将自动校验并开始导入；支持同一数据包中的多份文件。</small>
            <input ref={inputRef} hidden type="file" multiple accept=".csv,.pdf" onChange={event => event.currentTarget.files && importMutation.mutate(event.currentTarget.files)}/>
            {importMessage && <p className={styles.successText} role="status"><CheckCircle2 size={16}/>{importMessage}</p>}{importError && <p className={styles.importError} role="alert">{importError}</p>}
          </div>
          <div className={styles.required}><strong>导入前需要准备</strong><section><span>课程基础资料</span>{requiredFiles.filter(file => file.group === 'course').map(file => <div className={styles.requiredFile} key={file.name}><span aria-hidden="true">▦</span>{file.name}</div>)}</section><section><span>学生与测验记录</span>{requiredFiles.filter(file => file.group === 'records').map(file => <div className={styles.requiredFile} key={file.name}><span aria-hidden="true">▦</span>{file.name}</div>)}</section><small>以上六份 CSV 均为当前导入流程要求的文件。</small></div>
        </div>
        {readiness.data && <Notice>本地数据服务已连接。导入会创建新的分析运行；已有运行与复核历史由后端保存。</Notice>}
        {!readiness.data && readiness.isError && <Notice tone="warning">暂时无法确认本地数据服务状态。服务恢复后即可导入数据。</Notice>}
      </Panel>
      <section className={styles.afterImport} aria-labelledby="after-import-title"><div className={styles.afterImportHeading}><div><span className={styles.kicker}>导入之后</span><h2 id="after-import-title">从真实学情到教学行动</h2></div><p>所有分析均依据当前导入运行和可用证据生成。</p></div><div className={styles.afterImportGrid}><article><span className={styles.afterImportIcon}><Activity size={19}/></span><div><strong>班级诊断</strong><p>汇总班级表现与需要优先关注的指标。</p></div><ArrowRight size={16}/></article><article><span className={styles.afterImportIcon}><Users size={19}/></span><div><strong>学生分析</strong><p>查看学生作答证据和个体学习情况。</p></div><ArrowRight size={16}/></article><article><span className={styles.afterImportIcon}><Lightbulb size={19}/></span><div><strong>教学建议</strong><p>结合课程目标与学情制定后续教学行动。</p></div><ArrowRight size={16}/></article></div></section>
      <div className={styles.firstRunHint}><CircleHelp size={17}/>缺失或未评分的数据会保持其真实状态，不会被补成零分或示例统计。</div>
    </div>;
  }

  if (insights.isError) return <ErrorBox message={(insights.error as Error).message} onRetry={() => void insights.refetch()}/>;
  return <div className={styles.dashboard}>
    <input ref={inputRef} hidden type="file" multiple accept=".csv,.pdf" onChange={event => event.currentTarget.files && importMutation.mutate(event.currentTarget.files)}/>
    {importMessage && <Notice>{importMessage}</Notice>}
    {importError && <ErrorBox message={importError}/>}
    <div className={styles.actionRow}><div className={styles.scopePill}><span className={styles.pillDot}/>{classId || '尚无班级'}<span>·</span>{run.nodes.find(item => item['节点编号'] === nodeId)?.['节点名称'] as string ?? nodeId}</div>
      <div className={styles.actions}><button className={styles.secondaryButton} onClick={() => window.print()}><ClipboardCheck size={17}/>打印当前工作台</button><Link className={styles.primaryButton} to={{ pathname: routes.classDiagnosis, search: search }}><Activity size={17}/>查看班级诊断</Link><Link className={styles.secondaryButton} to={{ pathname: routes.studentTeaching, search: search }}><Sparkles size={17}/>生成教学建议</Link></div></div>
    <div className={styles.metrics}>
      <Metric label="班级学生" value={classStats?.student_count ?? classStudents.length} hint={`当前班级 ${classId || '未选择'}`} icon={<Users size={27}/>}/>
      <Metric label="当前班级有效评分" value={classStats?.scored_record_count ?? 0} hint={`本节点 ${classStats?.raw_record_count ?? 0} 条原始作答`} icon={<ClipboardCheck size={27}/>}/>
      <Metric label="当前优先指标" value={priority[0]?.label ?? '暂无可比数据'} hint={priority[0] ? `全题集得分率 ${pct(priority[0].ratio)}` : '当前范围没有有效评分'} icon={<Target size={27}/>} variant="text"/>
      <Metric label="典型学生候选" value={classCases.length} hint="按案例证据类型列出，不代表能力等级" icon={<AlertTriangle size={27}/>} tone="amber"/>
    </div>

    {quality && quality.raw_rows > 0 && <Notice tone={quality.findings.length ? 'warning' : 'info'}>顶部评分统计仅覆盖当前班级与测验节点；下方数据质量面板覆盖当前运行全部班级和节点。未评分、异常或缺失记录不作为零分。</Notice>}
    <div className={styles.contentGrid}>
      <Panel title="主题表现概览" icon={<Activity size={19}/>} action={<span className={styles.panelMeta}>基于当前测验 · 全题集得分率</span>} className={styles.performancePanel}>
        {insights.isFetching ? <Loading label="正在汇总当前班级表现…"/> : ratios.length ? <ReactECharts option={chartBar} notMerge lazyUpdate style={{ height: 340, width: '100%' }}/> : <EmptyState title="暂无可展示的指标表现" detail="当前测验没有可用的指标评分记录。"/>}
        {ratios.some(item => !item.comparable) && <p className={styles.chartFootnote}>部分指标没有共同题目，班级间不可比；图中仅展示当前班级全题集口径。</p>}
      </Panel>

      <Panel title="本周优先处理事项" icon={<ClipboardCheck size={19}/>} action={<Link to={{ pathname: routes.classDiagnosis, search: search }}>查看诊断 <ArrowRight size={14}/></Link>} className={styles.priorityPanel}>
        <div className={styles.priorityList}>{priority.length ? priority.map((item, index) => <div className={styles.priorityItem} key={item.indicator}><span className={`${styles.priorityNumber} ${index === 0 ? styles.priorityHigh : ''}`}>{index + 1}</span><div><strong>{item.label}</strong><small>当前班级全题集得分率 {pct(item.ratio)}{item.comparable ? ` · 共同题目 ${pct(item.common)}` : ' · 班级间不可比较'}</small></div><span className={styles.priorityTag}>{index === 0 ? '优先关注' : '持续观察'}</span></div>) : <EmptyState title="暂无优先项" detail="有效评分记录出现后，将按观察指标汇总表现。"/>}</div>
      </Panel>

      <Panel title="典型学生候选" icon={<Users size={19}/>} action={<Link to={{ pathname: routes.classDiagnosis, search: search }}>全部候选 <ArrowRight size={14}/></Link>} className={styles.candidatePanel}>
        <div className={styles.studentList}>{classCases.length ? classCases.slice(0, 4).map(item => <div className={styles.studentRow} key={`${item.class_id}-${item.student_id}`}><span className={styles.studentCode}>{item.student_id}</span><div><strong>{item.type}</strong><small>{item.reason || '可查看该案例的关联作答证据。'}</small></div><Link aria-label={`查看学生 ${item.student_id}`} to={{ pathname: routes.studentDiagnosis, search: applyScope(params, { student: item.student_id, class: item.class_id }).toString() }}><ArrowRight size={16}/></Link></div>) : <EmptyState title={caseOrderingUnclear ? '案例候选暂不可用' : '当前班级暂无案例候选'} detail={caseOrderingUnclear ? '测验日期缺失、无效或重复，无法确定最新节点。核对日期并重新导入后再查看候选。' : '候选案例由后端按可用证据生成；没有候选不代表表现稳定。'}/>}</div>
      </Panel>

      <Panel title="班级学生分布" icon={<Layers3 size={19}/>} action={<span className={styles.panelMeta}>按导入数据中的班级编号</span>} className={styles.distributionPanel}>
        <div className={styles.distribution}><div className={styles.donut}><ReactECharts option={distribution} notMerge lazyUpdate style={{ height: 190, width: 190 }}/><div><strong>{run.students.length}</strong><small>名学生</small></div></div><div className={styles.classLegend}>{(insights.data?.classes ?? []).map((item, index) => <div key={item.class_id}><i style={{ background: ['#11834a','#68c56b','#bce9b2','#dfefdc'][index % 4] }}/><span>{item.class_id}</span><strong>{item.student_count} 人</strong></div>)}</div></div>
      </Panel>

      <Panel title="AI 教学助手" icon={<Bot size={19}/>} className={`${styles.assistantPanel} ${readiness.data?.model?.configured ? '' : styles.assistantPanelCompact}`}>
        <div className={styles.assistantMessage}><span className={styles.assistantDot}/><p>{readiness.data?.model?.configured ? '模型服务已就绪。生成分析前会展示数据范围并请求确认。' : '本机未配置模型服务，可先使用已有规则分析和教学建议。'}</p></div>
        <small className={styles.assistantFoot}>AI 外部传输需要教师明确确认。生成结果需结合证据核对。</small>
        <Link to={{ pathname: routes.classDiagnosis, search: search }} className={styles.assistantLink}><Lightbulb size={16}/>查看诊断依据<ArrowRight size={15}/></Link>
      </Panel>

      <Panel title="快捷入口" icon={<BookOpen size={19}/>} className={styles.quickLinksPanel}>
        <div className={styles.quickLinks}><Link to={{ pathname: routes.topicOverview, search: search }}><span><BookOpen size={19}/></span><strong>课程知识</strong><ArrowRight size={15}/></Link><Link to={{ pathname: routes.classDiagnosis, search: search }}><span><Activity size={19}/></span><strong>班级诊断</strong><ArrowRight size={15}/></Link><Link to={{ pathname: routes.studentDiagnosis, search: search }}><span><Users size={19}/></span><strong>学生诊断</strong><ArrowRight size={15}/></Link><Link to={{ pathname: routes.studentTeaching, search: search }}><span><Lightbulb size={19}/></span><strong>教学建议</strong><ArrowRight size={15}/></Link><button onClick={() => inputRef.current?.click()}><span><FileUp size={19}/></span><strong>导入新数据</strong><ArrowRight size={15}/></button></div>
      </Panel>
      {quality && quality.raw_rows > 0 && <QualityPanel quality={quality}/>}
      <ExportPanel key={`${run.run_id}:${classId}`} runId={run.run_id} classId={classId} students={classStudents.map(row => String(row['学生编号'] ?? '')).filter(Boolean)}/>
    </div>
    <ReleasePanel runId={run.run_id} nodeId={nodeId} students={run.students.map(row => String(row['学生编号'] ?? '')).filter(Boolean)}/>
    {importMutation.isPending && <div className={styles.importOverlay}><RefreshCw size={20} className={styles.spin}/>正在校验数据并建立新运行…</div>}
    <div className={styles.runFootnote}>当前运行：{run.run_id} · {run.created_at ? new Date(run.created_at).toLocaleString('zh-CN') : '时间未提供'}</div>
  </div>;
}

function QualityPanel({ quality }: { quality: RunData['quality'] }) {
  const counts = quality.disposition_counts ?? {};
  const statusNames: Record<string, string> = { scored: '有效评分', pending: '待评分', unanswered: '未作答', superseded: '已被修订替代', excluded: '排除', unknown: '状态未知' };
  const findings = quality.findings ?? [];
  return <Panel title="当前运行整体数据质量" icon={<AlertTriangle size={19}/>} className={styles.qualityPanel}>
    <div className={styles.qualityMetrics}><span><b>{quality.raw_rows}</b> 原始行</span><span><b>{quality.events}</b> 作答事件</span><span><b>{quality.selected_revisions}</b> 当前修订</span><span><b>{quality.eligible_scored}</b> 有效评分</span><span><b>{quality.excluded_record_ids.length}</b> 排除记录</span></div>
    {Object.keys(counts).length > 0 && <div className={styles.dispositionSummary}>{Object.entries(counts).map(([state, count]) => <span key={state}>{statusNames[state] ?? state} <b>{count}</b></span>)}</div>}
    <p className={styles.qualityHint}>按修订与事件口径核查导入记录。待评分、未作答、已替代、排除和缺失记录均不转换为零分。</p>
    <details className={styles.qualityDetails}><summary>查看数据质量问题（{findings.length}）</summary>{findings.length ? <div className={styles.qualityIssueList}>{findings.map((finding, index) => <article key={`${String(finding.code)}-${String(finding.record_id)}-${index}`}><span className={String(finding.severity) === 'ERROR' ? styles.qualityError : styles.qualityWarning}>{String(finding.severity ?? '提示')}</span><div><b>{String(finding.code ?? '数据问题')}</b><p>{String(finding.detail ?? '未提供详细说明')}</p><small>{String(finding.source_file ?? '来源未知')}{finding.record_id ? ` · 记录 ${String(finding.record_id)}` : ''}{finding.source_line ? ` · 第 ${String(finding.source_line)} 行` : ''}{finding.disposition ? ` · ${statusNames[String(finding.disposition)] ?? String(finding.disposition)}` : ''}</small></div></article>)}</div> : <EmptyState title="没有发现数据质量问题" detail="当前导入快照没有记录需要处理的问题。"/>}</details>
  </Panel>;
}
