import { useEffect, useState } from 'react';
import { learningApi } from '../../api/client';
import type { ReleasePreflight, Student } from '../../api/types';
import type { RoutePath } from '../../app/navigation';
import { Panel } from '../../components/Panel';

const checkActions: Record<string, { label: string } & ({ target: string } | { route: RoutePath })> = {
  confirmed_cases: { label: '前往案例确认', target: 'teacher-cases' },
  evidence_references: { label: '前往案例证据签核', target: 'teacher-cases' },
  teacher_reviews: { label: '前往建议复核', route: '/plan/reviews' },
  source_signoffs: { label: '前往来源核验', route: '/knowledge/indicators' },
  case_report: { label: '查看案例报告', target: 'case-report' },
  class_report: { label: '查看班级报告', target: 'class-report' },
};

type ExportProps = {
  students: Student[];
  runId: string;
  ids: string[];
  node: string;
  onNavigate: (path: RoutePath) => void;
  onExport: (ids: string[]) => void;
};

export function ExportPanel({ students, runId, ids, node, onNavigate, onExport }: ExportProps) {
  const [reviewer, setReviewer] = useState('');
  const [contentReviewed, setContentReviewed] = useState(false);
  const [result, setResult] = useState<{ scope: string; preflight?: ReleasePreflight; error?: string }>();
  const [downloadError, setDownloadError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [retry, setRetry] = useState(0);
  const uniqueReady = ids.length === 3 && new Set(ids).size === 3
    && ids.every(id => id && students.some(student => student['学生编号'] === id));
  const signer = contentReviewed ? reviewer.trim() : '';
  const scope = JSON.stringify([runId, ids, node, signer, contentReviewed, retry]);
  const current = result?.scope === scope ? result : undefined;
  const preflight = current?.preflight;

  useEffect(() => {
    if (!uniqueReady || !node) return;
    let active = true;
    learningApi.releaseChecks(ids, node, signer, contentReviewed).then(value => {
      if (!active) return;
      if (value.run_id !== runId || value.node_id !== node || value.case_ids.length !== ids.length || ids.some(id => !value.case_ids.includes(id))) {
        setResult({ scope, error: '预检返回的范围已变化，请刷新当前数据批次。' });
      } else {
        setResult({ scope, preflight: value });
      }
    }).catch(reason => {
      if (active) setResult({ scope, error: reason instanceof Error ? reason.message : String(reason) });
    });
    return () => { active = false; };
  }, [uniqueReady, ids, node, signer, contentReviewed, runId, scope]);

  const canExportFormal = Boolean(preflight && preflight.release_status !== 'blocked'
    && !preflight.checks.some(check => check.status === 'blocked') && contentReviewed && signer);

  const exportFormal = async () => {
    if (!preflight || !canExportFormal || exporting) return;
    setExporting(true);
    setDownloadError('');
    try {
      const archive = await learningApi.exportSubmission({
        run_id: runId, case_ids: ids, node_id: node, preflight_fingerprint: preflight.fingerprint,
        reviewer: signer, content_reviewed: contentReviewed,
      });
      const url = URL.createObjectURL(archive);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'smart-learning-submission.zip';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setDownloadError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setExporting(false);
    }
  };

  return <Panel id="release-checks" title="成果包与发布预检" className="export-panel">
    <dl className="release-scope">
      <div><dt>案例学生</dt><dd>{ids.filter(Boolean).join('、') || '尚未选择'}</dd></div>
      <div><dt>班级报告节点</dt><dd>{node || '尚未选择'}</dd></div>
      <div><dt>数据批次</dt><dd><code>{runId}</code></dd></div>
    </dl>
    <div className="report-links">
      <button className="text-action" onClick={() => document.getElementById('case-report')?.focus()}>选择报告学生</button>
      <button className="text-action" onClick={() => document.getElementById('class-report')?.focus()}>选择班级报告节点</button>
    </div>
    <p className="muted">草稿包收录所选三人的个人记录及其班级汇总，不包含完整运行审计数据。正式包还需完成服务端预检和内容签核。</p>
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
    <button className="secondary" disabled={!uniqueReady} onClick={() => onExport(ids)}>下载草稿成果包</button>
    <section className="release-preflight" aria-label="正式提交发布预检">
      <h3>正式提交发布预检</h3>
      {(!uniqueReady || !node) && <p className="muted" role="status">请先在报告中选择三名不同学生和一个班级报告节点。</p>}
      {uniqueReady && node && !current && <p className="muted" role="status">正在校验当前发布范围…</p>}
      {current?.error && <div className="actions">
        <p role="alert" className="error">预检失败：{current.error}</p>
        <button className="secondary" onClick={() => setRetry(attempt => attempt + 1)}>重试预检</button>
      </div>}
      {preflight && <>
        <p className={`release-status release-${preflight.release_status}`} role="status">
          {preflight.release_status === 'blocked' ? '存在阻断项，不能生成正式成果包。'
            : preflight.release_status === 'ready_with_open_checks' ? '机器检查通过；仍有未完成的人工验收项，包内会明确保留。'
              : '发布检查全部通过。'}
        </p>
        <ul className="release-check-list">{preflight.checks.map(check => {
          const action = checkActions[check.id];
          return <li className={`release-check status-${check.status}`} key={check.id}>
            <strong>{check.status === 'passed' ? '通过' : check.status === 'blocked' ? '阻断' : '待检查'} · {check.label}</strong>
            <p>{check.detail}</p>
            {check.status === 'blocked' && action && <button className="text-action" onClick={() => {
              if ('route' in action) onNavigate(action.route);
              else document.getElementById(action.target)?.focus();
            }}>{action.label} <span aria-hidden="true">↗</span></button>}
          </li>;
        })}</ul>
      </>}
      <div className="release-signoff" id="release-signoff">
        <label>内容负责人<input aria-label="内容负责人姓名" value={reviewer} onChange={event => {
          setReviewer(event.target.value);
          setContentReviewed(false);
          setDownloadError('');
        }} placeholder="填写审阅报告的负责人" /></label>
        <label className="check-row"><input type="checkbox" checked={contentReviewed}
          disabled={!uniqueReady || !node || !reviewer.trim()}
          onChange={event => { setContentReviewed(event.target.checked); setDownloadError(''); }} />
          我已逐页审阅三案例和班级报告，确认事实、解释及限制
        </label>
      </div>
      {downloadError && <p role="alert" className="error">{downloadError}</p>}
      <button disabled={!canExportFormal || exporting} onClick={() => void exportFormal()}>
        {exporting ? '正在生成正式成果包…' : '下载正式提交包'}
      </button>
    </section>
  </Panel>;
}
