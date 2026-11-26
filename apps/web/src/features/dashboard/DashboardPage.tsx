import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, ArrowRight, BookOpen, Bot, CheckCircle2, CircleHelp, ClipboardCheck, Download, FileUp, GraduationCap, Layers3, Lightbulb, RefreshCw, Sparkles, Target, Users } from 'lucide-react';
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
  const cases = useCases(run?.run_id ?? '', Boolean(run));
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
    grid: { left: 112, right: 28, top: 12, bottom: 30 },
    xAxis: { type: 'value', min: 0, max: 1, axisLabel: { color: '#849188', formatter: (v: number) => `${Math.round(v * 100)}%` }, splitLine: { lineStyle: { color: '#edf1ed' } } },
    yAxis: { type: 'category', data: ratios.map(item => item.label).slice(0, 6).reverse(), axisLabel: { color: '#52645a', width: 100, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{ type: 'bar', data: ratios.slice(0, 6).map(item => item.ratio).reverse(), barWidth: 16, showBackground: true, backgroundStyle: { color: '#f0f4f0', borderRadius: 9 }, itemStyle: { color: '#13864a', borderRadius: [0, 8, 8, 0] }, label: { show: true, position: 'right', formatter: (p: { value: number | null }) => p.value == null ? '—' : `${(p.value * 100).toFixed(1)}%`, color: '#24352e', fontWeight: 700 } }],
    tooltip: { trigger: 'axis', valueFormatter: (value: number | null) => pct(value) },
  };
  const distribution = {
    tooltip: { trigger: 'item', formatter: '{b}: {c} 人（{d}%）' },
    color: ['#11834a', '#68c56b', '#bce9b2', '#dfefdc'],
    series: [{ type: 'pie', radius: ['56%', '78%'], center: ['50%', '50%'], avoidLabelOverlap: true, itemStyle: { borderColor: '#fff', borderWidth: 4 }, label: { show: false }, data: (insights.data?.classes ?? []).map(item => ({ name: item.class_id, value: item.student_count })) }],
  };

  if (runQuery.isPending) return <Loading/>;
  if (!run) {
    const notImported = (runQuery.error as ApiProblem | null)?.status === 400 || (runQuery.error as ApiProblem | null)?.status === 404;
    return <div className={styles.firstRun}>
      <section className={styles.welcome}><div className={styles.welcomeIcon}><GraduationCap size={30}/></div><div><span className={styles.kicker}>开始使用</span><h2>先导入一份学情数据</h2><p>导入课程要求、题目材料、学生、测验节点和作答记录，开始查看真实的教学分析。</p></div></section>
      {!notImported && runQuery.error && <ErrorBox message={(runQuery.error as Error).message} onRetry={() => void runQuery.refetch()}/>}
      <Panel title="选择数据文件" icon={<FileUp size={19}/> }>
        <div className={styles.importBody}>
          <div className={styles.importCopy}><strong>导入 CSV 数据包</strong><p>选择同一数据包中的 CSV 文件。若同时有教材 PDF，可一并选择；单次导入原始文件总量不超过 {formatBytes(MAX_TOTAL_BYTES)}（PDF 会按 Base64 计入请求体）。</p><button className={styles.primaryButton} disabled={importMutation.isPending} onClick={() => inputRef.current?.click()}><FileUp size={17}/>{importMutation.isPending ? '正在校验并导入…' : '选择 CSV / PDF 文件'}</button>
            <input ref={inputRef} hidden type="file" multiple accept=".csv,.pdf" onChange={event => event.currentTarget.files && importMutation.mutate(event.currentTarget.files)}/>
            {importMessage && <p className={styles.successText} role="status"><CheckCircle2 size={16}/>{importMessage}</p>}{importError && <p className={styles.importError} role="alert">{importError}</p>}
          </div>
          <div className={styles.required}><span>常见必需表</span><div>{['课程要求.csv', '题目与材料.csv', '模拟学生.csv', '测验节点.csv', '字段说明.csv', '作答记录.csv'].map(file => <code key={file}>{file}</code>)}</div></div>
        </div>
        {readiness.data && <Notice>本地数据服务已连接。导入会创建新的分析运行；已有运行与复核历史由后端保存。</Notice>}
      </Panel>
      <div className={styles.firstRunHint}><CircleHelp size={17}/>导入后的统计、图表与教学建议都基于本次运行数据；这里不会填入设计稿中的示例数字。</div>
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
      <Metric label="有效评分记录" value={quality?.eligible_scored ?? 0} hint={`共 ${quality?.raw_rows ?? 0} 条原始记录`} icon={<ClipboardCheck size={27}/>}/>
      <Metric label="当前优先指标" value={priority[0]?.label ?? '暂无可比数据'} hint={priority[0] ? `全题集得分率 ${pct(priority[0].ratio)}` : '当前范围没有有效评分'} icon={<Target size={27}/>}/>
      <Metric label="典型学生候选" value={classCases.length} hint="按案例证据类型列出，不代表能力等级" icon={<AlertTriangle size={27}/>} tone="amber"/>
    </div>

    {quality && quality.raw_rows > 0 && <Notice tone={quality.findings.length ? 'warning' : 'info'}>口径说明：有效评分 {quality.eligible_scored} 条 / 原始作答记录 {quality.raw_rows} 条。未评分、异常或缺失记录不作为零分。</Notice>}
    <div className={styles.contentGrid}>
      <Panel title="主题表现概览" icon={<Activity size={19}/>} action={<span className={styles.panelMeta}>基于当前测验 · 全题集得分率</span>} className={styles.performancePanel}>
        {insights.isFetching ? <Loading label="正在汇总当前班级表现…"/> : ratios.length ? <ReactECharts option={chartBar} notMerge lazyUpdate style={{ height: 245, width: '100%' }}/> : <EmptyState title="暂无可展示的指标表现" detail="当前测验没有可用的指标评分记录。"/>}
        {ratios.some(item => !item.comparable) && <p className={styles.chartFootnote}>部分指标没有共同题目，班级间不可比；图中仅展示当前班级全题集口径。</p>}
      </Panel>

      <Panel title="本周优先处理事项" icon={<ClipboardCheck size={19}/>} action={<Link to={{ pathname: routes.classDiagnosis, search: search }}>查看诊断 <ArrowRight size={14}/></Link>}>
        <div className={styles.priorityList}>{priority.length ? priority.map((item, index) => <div className={styles.priorityItem} key={item.indicator}><span className={`${styles.priorityNumber} ${index === 0 ? styles.priorityHigh : ''}`}>{index + 1}</span><div><strong>{item.label}</strong><small>当前班级全题集得分率 {pct(item.ratio)}{item.comparable ? ` · 共同题目 ${pct(item.common)}` : ' · 班级间不可比较'}</small></div><span className={styles.priorityTag}>{index === 0 ? '优先关注' : '持续观察'}</span></div>) : <EmptyState title="暂无优先项" detail="有效评分记录出现后，将按观察指标汇总表现。"/>}</div>
      </Panel>

      <Panel title="AI 教学助手" icon={<Bot size={19}/>} className={styles.assistantPanel}>
        <div className={styles.assistantMessage}><span className={styles.assistantDot}/><p>{readiness.data?.model?.configured ? '模型服务已就绪。生成分析前会展示数据范围并请求确认。' : '本机未配置模型服务，可先使用已有规则分析和教学建议。'}</p></div>
        <small className={styles.assistantFoot}>AI 外部传输需要教师明确确认。生成结果需结合证据核对。</small>
        <Link to={{ pathname: routes.classDiagnosis, search: search }} className={styles.assistantLink}><Lightbulb size={16}/>查看诊断依据<ArrowRight size={15}/></Link>
      </Panel>

      <Panel title="典型学生候选" icon={<Users size={19}/>} action={<Link to={{ pathname: routes.classDiagnosis, search: search }}>全部候选 <ArrowRight size={14}/></Link>}>
        <div className={styles.studentList}>{classCases.length ? classCases.slice(0, 4).map(item => <div className={styles.studentRow} key={`${item.class_id}-${item.student_id}`}><span className={styles.studentCode}>{item.student_id}</span><div><strong>{item.type}</strong><small>{item.reason || '可查看该案例的关联作答证据。'}</small></div><Link aria-label={`查看学生 ${item.student_id}`} to={{ pathname: routes.studentDiagnosis, search: applyScope(params, { student: item.student_id, class: item.class_id }).toString() }}><ArrowRight size={16}/></Link></div>) : <EmptyState title="当前班级暂无案例候选" detail="候选案例由后端按可用证据生成；没有候选不代表表现稳定。"/>}</div>
      </Panel>

      <Panel title="班级学生分布" icon={<Layers3 size={19}/>} action={<span className={styles.panelMeta}>按导入数据中的班级编号</span>}>
        <div className={styles.distribution}><div className={styles.donut}><ReactECharts option={distribution} notMerge lazyUpdate style={{ height: 180, width: 180 }}/><div><strong>{run.students.length}</strong><small>名学生</small></div></div><div className={styles.classLegend}>{(insights.data?.classes ?? []).map((item, index) => <div key={item.class_id}><i style={{ background: ['#11834a','#68c56b','#bce9b2','#dfefdc'][index % 4] }}/><span>{item.class_id}</span><strong>{item.student_count} 人</strong></div>)}</div></div>
      </Panel>

      <Panel title="快捷入口" icon={<BookOpen size={19}/>}>
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

function ExportPanel({ runId, classId, students }: { runId: string; classId: string; students: string[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const toggle = (studentId: string) => setSelected(current => current.includes(studentId) ? current.filter(id => id !== studentId) : current.length < 3 ? [...current, studentId] : current);
  const download = async () => {
    setPending(true); setMessage(''); setError('');
    try {
      const archive = await api<Blob>(`/api/export?${new URLSearchParams({ cases: selected.join(',') }).toString()}`);
      const url = URL.createObjectURL(archive);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `智慧学伴案例资料包-${classId}-${runId.slice(0, 8)}.zip`;
      document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setMessage('案例资料包已生成并开始下载。');
    } catch (cause) { setError((cause as Error).message); }
    finally { setPending(false); }
  };
  return <Panel title="案例资料包导出" icon={<Download size={19}/>} className={styles.exportPanel}>
    <p className={styles.exportHint}>选择当前班级中的 3 名学生，导出包含相关学习记录、复核和证据索引的 ZIP。该资料包不代表赛事发布审核已通过。</p>
    {students.length ? <div className={styles.exportStudents}>{students.map(studentId => <label key={studentId}><input type="checkbox" checked={selected.includes(studentId)} disabled={!selected.includes(studentId) && selected.length >= 3} onChange={() => toggle(studentId)}/><span>{studentId}</span></label>)}</div> : <EmptyState title="当前班级没有学生" detail="选择包含学生的班级后可导出案例资料包。"/>}
    <div className={styles.exportActions}><span>已选 {selected.length} / 3</span><button className={styles.primaryButton} disabled={selected.length !== 3 || pending} onClick={() => void download()}><Download size={15}/>{pending ? '正在打包…' : '导出所选案例'}</button></div>
    {message && <p className={styles.exportSuccess} role="status">{message}</p>}{error && <p className={styles.exportError} role="alert">{error}</p>}
  </Panel>;
}

function ReleasePanel({ runId, nodeId, students }: { runId: string; nodeId: string; students: string[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewer, setReviewer] = useState('');
  const [contentReviewed, setContentReviewed] = useState(false);
  const [preparedKey, setPreparedKey] = useState('');
  const [preparedBaseKey, setPreparedBaseKey] = useState('');
  const [downloadMessage, setDownloadMessage] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const histories = useQuery({ queryKey: ['teacher-cases', runId], queryFn: () => api<Record<string, Array<Record<string, unknown>>>>('/api/teacher-cases') });
  const confirmedStudents = students.filter(studentId => {
    const latest = histories.data?.[studentId]?.at(-1);
    return latest?.status === 'confirmed' && latest.run_id === runId;
  });
  const preflight = useMutation({
    mutationFn: (input: { ids: string[]; reviewer: string; contentReviewed: boolean }) => {
      const query = new URLSearchParams({ node: nodeId, reviewer: input.reviewer, content_reviewed: String(input.contentReviewed) });
      input.ids.forEach(id => query.append('case_ids', id));
      return api<Record<string, unknown>>(`/api/release-checks?${query.toString()}`);
    },
    onSuccess: (_data, input) => {
      setDownloadMessage('');
      setPreparedBaseKey(JSON.stringify([runId, nodeId, [...input.ids].sort(), input.reviewer.trim()]));
      setPreparedKey(JSON.stringify([runId, nodeId, [...input.ids].sort(), input.reviewer.trim(), input.contentReviewed]));
    },
  });
  const baseKey = JSON.stringify([runId, nodeId, [...selected].sort(), reviewer.trim()]);
  const selectionKey = JSON.stringify([runId, nodeId, [...selected].sort(), reviewer.trim(), contentReviewed]);
  const preflightMatchesSelection = preparedBaseKey === baseKey;
  const checks = Array.isArray(preflight.data?.checks) ? preflight.data.checks as Array<Record<string, unknown>> : [];
  const blockers = checks.some(check => check.status === 'blocked');
  const reports = preflight.data?.reports && typeof preflight.data.reports === 'object' ? preflight.data.reports as Record<string, unknown> : {};
  const caseReport = reports.cases && typeof reports.cases === 'object' ? reports.cases as Record<string, unknown> : {};
  const classReport = reports.class && typeof reports.class === 'object' ? reports.class as Record<string, unknown> : {};
  const canExport = selected.length === 3 && reviewer.trim() && contentReviewed && preparedKey === selectionKey && !blockers && typeof preflight.data?.fingerprint === 'string';
  const toggle = (studentId: string) => { setContentReviewed(false); setSelected(current => current.includes(studentId) ? current.filter(id => id !== studentId) : current.length < 3 ? [...current, studentId] : current); };
  const changeReviewer = (value: string) => { setContentReviewed(false); setReviewer(value); };
  const download = async () => {
    if (!canExport) return;
    setDownloadError(''); setDownloadMessage('');
    try {
      const archive = await api<Blob>('/api/export-submission', postJson({ run_id: runId, case_ids: selected, node_id: nodeId, preflight_fingerprint: preflight.data?.fingerprint, reviewer: reviewer.trim(), content_reviewed: true }));
      const url = URL.createObjectURL(archive);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `智慧学伴赛事材料-${runId.slice(0, 8)}-${nodeId}.zip`;
      document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadMessage('赛事材料包已生成并开始下载。');
    } catch (cause) { setDownloadError((cause as Error).message); }
  };
  return <Panel title="赛事发布预检与材料导出" icon={<ClipboardCheck size={19}/>} className={styles.releasePanel}>
    <p className={styles.exportHint}>从当前运行中选择 3 名已确认案例的学生。预检会重算教师复核、来源签核和案例报告；报告内容经人工确认后才可导出正式材料包。</p>
    {histories.isPending ? <Loading label="读取已确认案例…"/> : histories.isError ? <ErrorBox message={(histories.error as Error).message}/> : confirmedStudents.length ? <div className={styles.exportStudents}>{confirmedStudents.map(studentId => <label key={studentId}><input type="checkbox" checked={selected.includes(studentId)} disabled={!selected.includes(studentId) && selected.length >= 3} onChange={() => toggle(studentId)}/><span>{studentId}</span></label>)}</div> : <EmptyState title="尚无已确认案例" detail="请在学生教学建议页完成教师复核和案例确认后，再进行赛事发布预检。"/>}
    <div className={styles.releaseFields}><label>内容负责人<input value={reviewer} onChange={event => changeReviewer(event.target.value)} maxLength={200} placeholder="填写人工审阅人姓名"/></label><label className={styles.releaseConsent}><input type="checkbox" checked={contentReviewed} disabled={!preflightMatchesSelection} onChange={event => { setContentReviewed(event.target.checked); setPreparedKey(''); }}/><span>先查看下方当前案例与班级报告，再完成内容重点风险人工复核。更改案例或姓名后需重新预检。</span></label></div>
    <div className={styles.exportActions}><span>已选 {selected.length} / 3 · 节点 {nodeId}</span><button className={styles.secondaryButton} disabled={selected.length !== 3 || preflight.isPending || !reviewer.trim()} onClick={() => { setPreparedKey(''); setDownloadError(''); preflight.mutate({ ids: selected, reviewer: reviewer.trim(), contentReviewed }); }}><ClipboardCheck size={15}/>{preflight.isPending ? '正在预检…' : contentReviewed ? '按人工复核状态更新预检' : '运行预检 / 查看报告'}</button><button className={styles.primaryButton} disabled={!canExport} onClick={() => void download()}><Download size={15}/>导出赛事材料</button></div>
    {preflight.isSuccess && !preflightMatchesSelection && <Notice>选择或负责人已变化。请重新预检以查看当前范围的报告。</Notice>}
    {preflight.isSuccess && preflightMatchesSelection && <>
      <div className={styles.releaseReportSummary}><span>案例报告：{String(caseReport.status ?? '未知')} · {Array.isArray(caseReport.cases) ? caseReport.cases.length : 0} 份</span><span>班级报告：{String(classReport.status ?? '未知')} · 节点 {String(classReport.node_id ?? '—')}</span></div>
      <div className={styles.releaseChecks}>{checks.map((check, index) => <article key={`${String(check.id)}-${index}`}><b>{String(check.label ?? check.id)}</b><span className={check.status === 'passed' ? styles.checkPassed : check.status === 'blocked' ? styles.checkBlocked : styles.checkOpen}>{check.status === 'passed' ? '通过' : check.status === 'blocked' ? '阻断' : '待人工确认'}</span><p>{String(check.detail ?? '')}</p></article>)}</div>
      {Array.isArray(classReport.limitations) && classReport.limitations.length > 0 && <p className={styles.exportHint}>班级报告限制：{(classReport.limitations as unknown[]).map(String).join('；')}</p>}
      {blockers && <Notice tone="warning">当前存在阻断项。请按上方检查结果补齐案例、复核、来源或报告后，重新运行预检。</Notice>}
      {!blockers && checks.some(check => check.status === 'not_checked') && <Notice tone="warning">机器阻断项已清除，但仍有开放的人工验收项；导出包会保留该状态，不能视为赛事最终验收通过。</Notice>}
    </>}
    {preflight.isError && <ErrorBox message={(preflight.error as Error).message}/>}{downloadMessage && <p className={styles.exportSuccess} role="status">{downloadMessage}</p>}{downloadError && <p className={styles.exportError} role="alert">{downloadError}</p>}
  </Panel>;
}

function QualityPanel({ quality }: { quality: RunData['quality'] }) {
  const counts = quality.disposition_counts ?? {};
  const statusNames: Record<string, string> = { scored: '有效评分', pending: '待评分', unanswered: '未作答', superseded: '已被修订替代', excluded: '排除', unknown: '状态未知' };
  const findings = quality.findings ?? [];
  return <Panel title="数据质量与导入核查" icon={<AlertTriangle size={19}/>} className={styles.qualityPanel}>
    <div className={styles.qualityMetrics}><span><b>{quality.raw_rows}</b> 原始行</span><span><b>{quality.events}</b> 作答事件</span><span><b>{quality.selected_revisions}</b> 当前修订</span><span><b>{quality.eligible_scored}</b> 有效评分</span><span><b>{quality.excluded_record_ids.length}</b> 排除记录</span></div>
    {Object.keys(counts).length > 0 && <div className={styles.dispositionSummary}>{Object.entries(counts).map(([state, count]) => <span key={state}>{statusNames[state] ?? state} <b>{count}</b></span>)}</div>}
    <p className={styles.qualityHint}>按修订与事件口径核查导入记录。待评分、未作答、已替代、排除和缺失记录均不转换为零分。</p>
    <details className={styles.qualityDetails}><summary>查看数据质量问题（{findings.length}）</summary>{findings.length ? <div className={styles.qualityIssueList}>{findings.map((finding, index) => <article key={`${String(finding.code)}-${String(finding.record_id)}-${index}`}><span className={String(finding.severity) === 'ERROR' ? styles.qualityError : styles.qualityWarning}>{String(finding.severity ?? '提示')}</span><div><b>{String(finding.code ?? '数据问题')}</b><p>{String(finding.detail ?? '未提供详细说明')}</p><small>{String(finding.source_file ?? '来源未知')}{finding.record_id ? ` · 记录 ${String(finding.record_id)}` : ''}{finding.source_line ? ` · 第 ${String(finding.source_line)} 行` : ''}{finding.disposition ? ` · ${statusNames[String(finding.disposition)] ?? String(finding.disposition)}` : ''}</small></div></article>)}</div> : <EmptyState title="没有发现数据质量问题" detail="当前导入快照没有记录需要处理的问题。"/>}</details>
  </Panel>;
}
