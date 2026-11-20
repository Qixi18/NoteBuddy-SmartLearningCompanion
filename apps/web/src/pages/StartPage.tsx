import type { AnalysisRun, Draft, Review, WorkbenchReadiness } from '../api/types';
import { NavIcon } from '../components/NavIcon';
import { findingLabel, severityLabel } from '../features/task02/qualityLabels';

export function StartPage({ run, readiness, student, node, draft, review, onNavigate }: { run: AnalysisRun; readiness?: WorkbenchReadiness; student?: string; node?: string; draft?: Draft | null; review?: Review; onNavigate: (path: string) => void }) {
  const classCount = new Set(run.students.map(student => student['模拟班级编号'])).size;
  const summary = [
    ['学生', run.students.length, '当前批次'],
    ['班级', classCount, '按班级编号统计'],
    ['作答记录', run.quality.raw_rows, '含版本与待处理记录'],
    ['有效评分', run.quality.eligible_scored, '计入得分统计'],
  ];
  const tasks = [
    { path: '/requirements', title: '学习要求', icon: 'subject', description: '本次要学什么，题目和材料依据在哪里。' },
    { path: '/performance', title: '已有表现', icon: 'insights', description: '学生的记录说明什么，还有哪些限制。' },
    { path: '/recommendations', title: '学习建议', icon: 'teaching', description: '接下来做什么，如何根据证据复核。' },
  ] as const;
  const attention = run.quality.findings.filter(item => item.severity === 'WARN' || item.severity === 'ERROR');
  const exposedFindings = attention.slice(0, 3);
  const nextStep = review?.status === 'needs_observation'
    ? { path: '/recommendations?view=observe', title: '继续补充观察', action: '查看观察与调整', detail: '已有建议要求补充观察；记录实施和后续证据后再判断。' }
    : review?.status === 'rejected'
      ? { path: '/recommendations', title: '查看被驳回的建议', action: '查看教师复核', detail: '核对驳回原因和当前范围，再决定是否重新生成建议。' }
      : review
        ? { path: '/recommendations', title: '查看已保存的教师复核', action: '打开学习建议', detail: '继续阅读已保存版本、适用范围和来源状态。' }
        : draft
          ? { path: '/recommendations', title: '继续复核建议草稿', action: '继续教师复核', detail: '草稿已生成；核对证据和来源边界后再保存复核。' }
          : student && node
            ? { path: '/performance?view=student', title: '先核对当前表现', action: '查看已有表现', detail: `${student} · ${node} · 确认评分记录和限制后再形成建议。` }
            : { path: '/requirements', title: '从学习要求开始', action: '查看学习要求', detail: '先找到本次指标、题目联系和来源核验状态。' };
  return <>
    <section className="next-step-card" aria-labelledby="next-step-title">
      <div><span className="eyebrow">建议的下一步</span><h2 id="next-step-title">{nextStep.title}</h2><p>{nextStep.detail}</p></div>
      <button onClick={() => onNavigate(nextStep.path)}>{nextStep.action}<span aria-hidden="true"> →</span></button>
    </section>
    <section className="stat-grid" aria-label="当前运行摘要">{summary.map(([label, value, note]) => <article className="stat-block" key={label}><span className="stat-label">{label}</span><strong>{value}</strong><small>{note}</small></article>)}</section>
    <section className="overview-routes" aria-labelledby="overview-routes-title"><header className="section-heading"><h2 id="overview-routes-title">从这里继续</h2></header><div className="entry-list">{tasks.map(task => <button className="entry-link" key={task.path} onClick={() => onNavigate(task.path)}><span className="entry-icon"><NavIcon name={task.icon} /></span><span className="entry-copy"><strong>{task.title}</strong><span>{task.description}</span></span><span className="entry-arrow" aria-hidden="true" /></button>)}</div></section>
    <section className="overview-detail-grid"><article className="overview-panel attention-panel"><header className="overview-panel-header"><h2>需要留意</h2><span className={`attention-count${attention.length ? ' has-attention' : ''}`}>{attention.length ? `${attention.length} 项` : '无异常'}</span></header>
      {exposedFindings.length ? <ul className="attention-list">{exposedFindings.map((finding, index) => <li key={`${finding.code}:${finding.record_id}:${finding.source_line}:${index}`}><span className={`severity-dot severity-${finding.severity?.toLowerCase() ?? 'info'}`} aria-hidden="true" /><div><strong>{findingLabel(finding.code)} <span>{severityLabel(finding.severity)}</span></strong><p>{finding.detail}{finding.record_id ? ` · 记录 ${finding.record_id}` : ''}{finding.source_line ? ` · 第 ${finding.source_line} 行` : ''}</p></div></li>)}</ul> : <p className="empty-inline">当前快照没有需要人工处理的质量异常。</p>}
      <button className="text-action" onClick={() => onNavigate('/performance?view=quality')}>查看详情 <span aria-hidden="true">↗</span></button></article>
      <article className="overview-panel scope-panel"><header className="overview-panel-header"><h2>分析范围与来源</h2></header><p>覆盖 {run.nodes.length} 个测验节点。统计依据通过校验的作答；没有有效记录的范围不代表学生未掌握。</p>
        {readiness && <div className={`source-status-row ${readiness.sources.status === 'missing' ? 'needs-source' : ''}`}><div><strong>来源 PDF</strong><span>{readiness.sources.status === 'missing' ? '当前未找到来源文件' : `找到 ${readiness.sources.pdf_count} 份，按指标核验`}</span></div><button className="text-action" onClick={() => onNavigate('/requirements')}>查看来源 <span aria-hidden="true">↗</span></button></div>}
        <p className="scope-footnote">规则版本 {run.rule_version} · 原始行与事件按不同口径统计</p></article></section>
  </>;
}
