import { useEffect, useState } from 'react';
import { learningApi } from '../../api/client';
import type { CaseSuggestion, Student } from '../../api/types';
import { Panel } from '../../components/Panel';
export function ExportPanel({ students, suggestions, runId = '', nodes = [], onExport }: { students: Student[]; suggestions: CaseSuggestion[]; runId?: string; nodes?: Array<{ '节点编号': string }>; onExport: (ids: string[]) => void }) {
  const [ids, setIds] = useState<string[]>(['', '', '']);
  const [node, setNode] = useState(nodes[0]?.['节点编号'] ?? '');
  const [reviewer, setReviewer] = useState('');
  const [contentReviewed, setContentReviewed] = useState(false);
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof learningApi.releaseChecks>> | null>(null);
  const [releaseError, setReleaseError] = useState('');
  const [exporting, setExporting] = useState(false);
  const options = students.map(item => item['学生编号']);
  const choose = (index: number, value: string) => setIds(old => { const next = [...old]; next[index] = value; return next; });
  const selected = [0, 1, 2].map(index => ids[index] || '');
  const uniqueReady = selected.every(id => Boolean(id) && options.includes(id)) && new Set(selected).size === 3;
  useEffect(() => {
    let active = true;
    setPreflight(null);
    setReleaseError('');
    if (!uniqueReady || !node) return () => { active = false; };
    learningApi.releaseChecks(selected, node, reviewer, contentReviewed)
      .then(value => { if (active) setPreflight(value); })
      .catch(reason => { if (active) setReleaseError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [uniqueReady, selected.join('|'), node, reviewer, contentReviewed, runId]);
  const exportFormal = async () => {
    if (!preflight || !contentReviewed || !reviewer.trim() || preflight.run_id !== runId) return;
    setExporting(true); setReleaseError('');
    try {
      const archive = await learningApi.exportSubmission({ run_id: runId, case_ids: selected, node_id: node, preflight_fingerprint: preflight.fingerprint, reviewer, content_reviewed: contentReviewed });
      const url = URL.createObjectURL(archive);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'smart-learning-submission.zip'; anchor.click(); URL.revokeObjectURL(url);
    } catch (reason) { setReleaseError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setExporting(false); }
  };
  const canExportFormal = Boolean(preflight && preflight.run_id === runId && !preflight.checks.some(check => check.status === 'blocked') && contentReviewed && reviewer.trim());
  return <Panel title="三名案例与成果导出" className="export-panel"><p className="muted">上方可查看 {suggestions.length} 位系统候选及其证据。旧案例包保留为草稿导出；正式提交包须通过服务端预检并由内容负责人签核。</p>
    <div className="export-slots">{[0, 1, 2].map(index => <label className="export-slot" key={index}>案例{['一', '二', '三'][index]}<select value={selected[index]} onChange={event => choose(index, event.target.value)}><option value="">请选择学生</option>{options.map(id => <option key={id} value={id}>{id}</option>)}</select></label>)}</div>
    {!uniqueReady && <p className="muted" role="status">请选择三名不同的学生。重复选择会阻止导出。</p>}
    <p className="muted">下载的是三名所选学生的案例包：学生作答与指标数据仅含这三人；班级统计列出其所属班级的整班汇总，可能包含其他同学的聚合贡献，不包含其个人作答。成果包不包含完整运行审计数据，也不自动生成完整案例叙述。</p>
    <details className="export-preview"><summary>查看成果包内容与字段口径</summary>
      <ul>
        <li><strong>运行与质量：</strong><code>manifest.json</code>、<code>data_quality.json</code>、<code>field_dictionary.json</code></li>
        <li><strong>目标与来源：</strong><code>learning_objectives.json/csv</code>、<code>items.json</code>、<code>source_index.json</code>、<code>course_relations.json/csv</code></li>
        <li><strong>所选案例的班级、学生与节点统计：</strong><code>class_summary.json</code>、<code>student_summary.json</code>、<code>all_metrics.json</code>、<code>node_scoped_metrics.json</code>、<code>observations.json</code>、<code>node_observations.json</code></li>
        <li><strong>案例与作答证据：</strong><code>student_cases.json</code>、<code>responses.json</code>、<code>raw_responses.json</code>、<code>evidence_index.json</code>、<code>rubric_observations.json</code></li>
        <li><strong>建议与复核历史：</strong><code>recommendations.json</code>、<code>pending_review.json</code>、<code>teacher_review_history.json</code></li>
        <li><strong>表格和说明：</strong><code>metrics.csv</code>、<code>字段与口径说明.md</code></li>
      </ul>
      <p className="muted">案例叙述仍需人工补充背景、证据解释和课堂反思；字段口径文件说明有效评分分母、节点统计及待复核状态。</p>
    </details>
    <button disabled={!uniqueReady} onClick={() => onExport(selected)}>下载成果包</button>
    <section className="release-preflight" aria-label="正式提交发布预检"><h3>正式提交发布预检</h3><label>班级报告节点<select aria-label="正式提交班级报告节点" value={node} onChange={event => setNode(event.target.value)}>{nodes.map(item => <option key={item['节点编号']} value={item['节点编号']}>{item['节点编号']}</option>)}</select></label><label>内容负责人<input aria-label="内容负责人姓名" value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="填写逐页审阅报告的负责人" /></label><label className="check-row"><input type="checkbox" checked={contentReviewed} onChange={event => setContentReviewed(event.target.checked)} />我已逐页审阅三案例和班级报告，确认事实、解释及限制</label>
      {!uniqueReady && <p className="muted">先选择三名不同学生，再运行发布预检。</p>}
      {releaseError && <p role="alert" className="error">{releaseError}</p>}
      {preflight && <><p className={`release-status release-${preflight.release_status}`} role="status">{preflight.release_status === 'blocked' ? '存在阻断项，不能生成正式成果包。' : preflight.release_status === 'ready_with_open_checks' ? '机器检查通过；仍有未完成的人工验收项，包内会明确保留。' : '发布检查全部通过。'}</p><ul className="release-check-list">{preflight.checks.map(check => <li className={`release-check status-${check.status}`} key={check.id}><strong>{check.status === 'passed' ? '通过' : check.status === 'blocked' ? '阻断' : '待检查'} · {check.label}</strong><p>{check.detail}</p></li>)}</ul><button disabled={!canExportFormal || exporting} onClick={() => void exportFormal()}>{exporting ? '正在生成正式成果包…' : '下载正式提交包'}</button></>}
    </section>
  </Panel>;
}
