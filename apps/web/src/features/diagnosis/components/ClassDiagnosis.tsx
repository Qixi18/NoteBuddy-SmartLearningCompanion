import { Activity, AlertTriangle, ArrowRight, BookOpen, CircleHelp, ClipboardCheck, FileSearch, Layers3, Target, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataTable, EmptyState, Loading, Panel } from '../../../components/PageBits';
import { ReactECharts } from '../../../components/ReactECharts';
import { routes } from '../../../app/routes';
import type { CaseCandidate, ClassInsights, RunData } from '../../../types/api';
import { label, percent } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

function heatmapTone(value: number | null) { return value === null ? styles.heatmapUnavailable : value >= 0.9 ? styles.heatmapHigh : value >= 0.8 ? styles.heatmapGood : value >= 0.7 ? styles.heatmapMid : value >= 0.6 ? styles.heatmapLow : styles.heatmapWeak; }
export function ClassDiagnosis({ insights, cases, caseOrderingUnclear, classId, nodeId, run, objectiveName }: { insights?: ClassInsights; cases: CaseCandidate[]; caseOrderingUnclear: boolean; classId: string; nodeId: string; run: RunData; objectiveName: (id: string) => string }) {
  if (!insights) return <Loading label="正在分析班级比较与共性问题…"/>;
  const selected = insights.classes.find(item => item.class_id === classId);
  const graph = {
    animation: false,
    color: ['#16864a', '#80cb6d', '#b5e9a7'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: number | null) => percent(value) },
    legend: { bottom: 0, textStyle: { color: '#77847a', fontSize: 13 } },
    grid: { left: 168, right: 24, top: 18, bottom: 44 },
    xAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: (value: number) => `${Math.round(value * 100)}%`, color: '#87928a', fontSize: 12, hideOverlap: true }, splitLine: { lineStyle: { color: '#edf1ed' } } },
    yAxis: { type: 'category', data: insights.comparisons.map(item => objectiveName(item.indicator_id)).slice(0, 8).reverse(), axisLabel: { color: '#53645a', width: 150, overflow: 'break', lineHeight: 18, fontSize: 13 } },
    series: insights.classes.map(summary => ({ name: summary.class_id, type: 'bar', data: insights.comparisons.map(item => item.classes.find(row => row.class_id === summary.class_id)?.common_ratio ?? null).slice(0, 8).reverse(), barMaxWidth: 18, itemStyle: { borderRadius: [0, 6, 6, 0] }, connectNulls: false })),
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
      {insights.comparisons.some(item => item.status === 'available') ? <ReactECharts option={graph} notMerge lazyUpdate style={{ height: 340, width: '100%' }}/> : <EmptyState title="当前测验没有共同题目" detail="不能比较班级表现。页面保留不可比较状态，不绘制排名或零值。"/>}
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
      <div className={styles.classComparisonTable}><DataTable columns={[{ key: 'indicator_id', title: '观察指标', render: row => `${objectiveName(String(row.indicator_id))} (${String(row.indicator_id)})` }, { key: 'common_material_ids', title: '共同题目' }, ...insights.classes.map(summary => ({ key: summary.class_id, title: summary.class_id, render: (row: Row) => { const comp = insights.comparisons.find(item => item.indicator_id === row.indicator_id); const val = comp?.classes.find(item => item.class_id === summary.class_id); return comp?.status === 'available' ? `${percent(val?.common_ratio ?? null)} · ${val?.observed_student_count ?? 0} 人` : '不可比较'; } }))]} rows={insights.comparisons.map(item => ({ ...item }))}/></div>
    </Panel>
    <Panel title="观察指标得分热力图" icon={<Layers3 size={18}/>} action={<div className={styles.heatmapLegend}>{heatmapLegend.map(item => <span key={item.label}><i className={item.tone}/>{item.label}</span>)}</div>}>
      <p className={styles.heatmapNote}>仅按各班共同题目计算；不可比单元格不填色，也不以缺失记录补零。</p>
      {insights.comparisons.length ? <div className={styles.heatmapScroll}><table className={styles.heatmapTable}><thead><tr><th>观察指标</th>{insights.classes.map(summary => <th key={summary.class_id}>{summary.class_id}</th>)}</tr></thead><tbody>{insights.comparisons.map(comparison => <tr key={comparison.indicator_id}><th><span>{objectiveName(comparison.indicator_id)}</span><small>{comparison.indicator_id}</small></th>{insights.classes.map(summary => {
        const classScore = comparison.classes.find(item => item.class_id === summary.class_id);
        const ratio = comparison.status === 'available' ? classScore?.common_ratio ?? null : null;
        return <td key={`${comparison.indicator_id}-${summary.class_id}`} className={heatmapTone(ratio)} aria-label={`${summary.class_id} ${objectiveName(comparison.indicator_id)} ${comparison.status === 'available' ? percent(ratio) : '不可比较'}`}><span>{comparison.status === 'available' ? percent(ratio) : '不可比'}</span><small>{comparison.status === 'available' ? `${classScore?.observed_student_count ?? 0} 人 · ${classScore?.common_record_count ?? 0} 条` : '无共同题目'}</small></td>;
      })}</tr>)}</tbody></table></div> : <EmptyState title="没有可展示的指标热力图" detail="当前节点没有观察指标比较数据。"/>}
    </Panel>
    <div className={styles.classDiagnosisSections}>
      <div data-testid="class-candidate-panel"><Panel title="代表性学生候选" icon={<Users size={18}/>}>{classCases.length ? <div className={styles.classCandidateGrid} data-testid="class-candidate-grid">{classCases.map(item => <Link className={styles.caseCard} key={item.student_id} to={{ pathname: routes.studentDiagnosis, search: new URLSearchParams({ node: nodeId, class: item.class_id, student: item.student_id }).toString() }}><span>{item.student_id}</span><b>{item.type}</b><p>{item.reason}</p><small>{item.evidence_record_ids.length} 条关联证据 · 查看学生诊断</small></Link>)}</div> : <EmptyState compact title={caseOrderingUnclear ? '测验节点先后待确认' : '没有案例候选'} detail={caseOrderingUnclear ? '当前运行存在日期缺失、无效或重复的测验节点，系统不会猜测最新节点。请核对日期并重新导入后再生成案例候选。' : '案例分类仅用于选择证据样本，不代表能力等级。'}/>}</Panel></div>
      <div data-testid="class-evidence-panel"><Panel title="关键题目证据" icon={<FileSearch size={18}/>}>{evidenceItems.length ? <div className={styles.classKeyEvidenceGrid} data-testid="class-key-evidence-grid">{evidenceItems.map(({ comparison, materialId, item }) => <article key={`${comparison.indicator_id}-${materialId}`}><header><b>{materialId}</b><span>{objectiveName(comparison.indicator_id)}</span></header><p>{label(item ?? {}, ['题干或内容', '题目内容', '材料名称'], '当前数据没有题目内容')}</p><small className={styles.evidenceScopeLabel}>所属指标共同题目口径（非单题得分）</small><div>{comparison.classes.map(score => <span key={score.class_id}>{score.class_id}：{comparison.status === 'available' ? `${percent(score.common_ratio)} · ${score.observed_student_count} 人` : '不可比较'}</span>)}</div><Link to={{ pathname: `${routes.itemEvidence}/${encodeURIComponent(materialId)}`, search: new URLSearchParams({ node: nodeId, class: classId, indicator: comparison.indicator_id }).toString() }}>查看作答证据 <ArrowRight size={13}/></Link></article>)}</div> : <EmptyState compact title="当前没有可列出的共同题目证据" detail="需要在班级间至少存在一题共同作答题目；未覆盖的题目不会列作可比证据。"/>}</Panel></div>
    </div>
    <Panel title="测验与课程范围" icon={<BookOpen size={18}/>}><div className={styles.contextLine}><span>运行 {run.run_id}</span><span>节点 {insights.node_id}</span><span>{run.objectives.length} 项观察指标</span><span>{run.items.length} 道题目材料</span></div></Panel>
  </>;
}
