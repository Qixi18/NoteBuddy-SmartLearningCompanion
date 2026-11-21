import { useEffect, useState } from 'react';
import { learningApi } from '../../api/client';
import type { AIAnalysisPreview, AIAnalysisResult, AIAnalysisTask } from '../../api/types';

const citationKindLabel: Record<string, string> = {
  response: '作答记录',
  objective: '学习要求',
  metric: '统计事实',
  quality_coverage: '数据质量',
  source: '来源原文',
};

type Props = {
  task: AIAnalysisTask;
  runId: string;
  node?: string;
  student?: string;
  indicator?: string;
  onEvidence?: (ref: NonNullable<AIAnalysisResult['findings'][number]['evidence_refs'][number]>) => void;
};

const taskTitle: Record<AIAnalysisTask, string> = {
  task01: 'AI 学科依据分析',
  task02: 'AI 班级数据分析',
  task03: 'AI 教学证据与建议',
};

const statusText: Record<AIAnalysisResult['status'], string> = {
  running: '分析中', complete: '分析完成', partial: '部分完成',
  insufficient_evidence: '证据不足', failed: '分析失败',
};
const dataCategories: Record<AIAnalysisTask, string> = {
  task01: '课程指标与关联题目、评分点、已核验课程标准页文本（若可读取）',
  task02: '当前节点确定性统计、评分处置覆盖、去标识化作答与解题过程',
  task03: '所选学生全部指标与测验节点的确定性统计、评分点和去标识化作答证据',
};

export function AIAnalysisPanel({ task, runId, node, student, indicator, onEvidence }: Props) {
  const [preview, setPreview] = useState<AIAnalysisPreview | null>(null);
  const [result, setResult] = useState<AIAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;
    setPreview(null);
    setResult(null);
    setError('');
    setConfirming(false);
    void learningApi.aiAnalysisPreview(task, runId, node, student, indicator)
      .then(value => { if (active) { setPreview(value); setResult(value.analysis); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '读取分析状态失败'); });
    return () => { active = false; };
  }, [task, runId, node, student, indicator]);

  async function generate(action: 'generate' | 'refresh' | 'retry_failed' = 'generate') {
    if (!preview || loading) return;
    setLoading(true);
    setError('');
    try {
      const value = await learningApi.generateAIAnalysis({
        task, run_id: preview.run_id, ...(node ? { node_id: node } : {}),
        ...(student ? { student_id: student } : {}), ...(indicator ? { indicator_id: indicator } : {}),
        action, request_id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        ...(action === 'retry_failed' && result ? { analysis_id: result.analysis_id } : {}),
        transmission_confirmed: true,
      });
      setResult(value);
      setPreview(current => current ? { ...current, analysis: value, stale: false } : current);
      setConfirming(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '分析请求失败');
    } finally { setLoading(false); }
  }

  const summary = preview?.input_summary;
  const category = task === 'task03' && node
    ? '所选学生在当前指标与测验节点的目标、评分点、作答证据及评分处置状态'
    : dataCategories[task];
  const hasRetry = result && ['partial', 'failed'].includes(result.status)
    && Array.isArray(result.coverage.failed_packet_ids) && result.coverage.failed_packet_ids.length > 0;

  return <section className="card ai-analysis" aria-labelledby={`ai-title-${task}`}>
    <header className="ai-analysis-header">
      <div><p className="eyebrow">证据约束的模型解释</p><h2 id={`ai-title-${task}`}>{taskTitle[task]}</h2></div>
      {result && <span className={`ai-status ai-status-${result.status}`}>{statusText[result.status]}</span>}
    </header>
    <p className="ai-description">系统先整理确定性统计、数据质量和可追溯证据，再由 AI 解释证据、归纳分析并起草建议。分析结果生成后直接呈现；每条结论都标明支持程度、限制和引用。</p>
    <p className="ai-data-categories"><strong>本次数据类别：</strong>{category}</p>
    {preview ? <div className="ai-preview" aria-label="发送范围摘要">
      <span>服务 <strong>{preview.provider || '未配置'}</strong></span><span>模型 <strong>{preview.model || '未配置'}</strong></span>
      <span>证据包 <strong>{summary?.packet_count ?? 0}</strong></span>
      <span>作答记录 <strong>{summary?.record_count ?? 0}</strong></span>
      {task === 'task01' && <span>课程指标 <strong>{summary?.objective_count ?? 0}</strong></span>}
    </div> : !error && <p className="muted" role="status">正在读取当前分析范围…</p>}
    {preview && !preview.model_configured && <p className="ai-alert" role="status">后端尚未配置模型 API Key。请在仓库 `.env` 中设置 MODEL_API_KEY，保存后重启后端再生成分析。</p>}
    {preview?.stale && <p className="ai-alert" role="status">数据或来源核验已变化，旧分析已标记为过期。重新生成后将创建新版本。</p>}
    {error && <p className="ai-alert" role="alert">{error}</p>}
    {preview && preview.model_configured && !result && !confirming && <button className="primary" disabled={loading} onClick={() => setConfirming(true)}>生成 AI 分析</button>}
    {preview && preview.model_configured && result && !confirming && <div className="ai-actions">
      <button className="primary" disabled={loading} onClick={() => setConfirming(true)}>{preview.stale ? '更新过期分析' : '重新分析'}</button>
      {hasRetry && <button className="secondary" disabled={loading} onClick={() => void generate('retry_failed')}>重试失败分块</button>}
    </div>}
    {confirming && preview && <div className="ai-confirm" role="group" aria-label="确认 AI 数据传输">
      <p>将把上方所列范围的脱敏证据发送至 <strong>{preview.provider} · {preview.model}</strong>。本机编号会先替换为临时别名；请确认后开始分析。</p>
      <button className="primary" disabled={loading} onClick={() => void generate(preview.stale ? 'refresh' : result ? 'refresh' : 'generate')}>{loading ? '正在分析…' : '确认发送并生成'}</button>
      <button className="secondary" disabled={loading} onClick={() => setConfirming(false)}>取消</button>
    </div>}
    {result && <div className="ai-result" aria-live="polite">
      {result.stale && <p className="ai-alert">当前结果已过期。</p>}
      <p className="ai-coverage">证据包：{String(result.coverage.packet_succeeded ?? 0)}/{String(result.coverage.packet_total ?? 0)} 成功，{String(result.coverage.packet_failed ?? 0)} 失败；原始记录纳入：{String(result.coverage.raw_records_included ?? 0)}/{String(result.coverage.raw_records_total ?? 0)}</p>
      {result.findings.length ? result.findings.map(finding => <article className="ai-finding" key={finding.finding_id}>
        <div className="ai-finding-meta"><span>{finding.category}</span><strong>{finding.support_level === 'supported' ? '证据支持' : finding.support_level === 'limited' ? '有限支持' : finding.support_level === 'conflicting' ? '证据冲突' : '暂无证据'}</strong></div>
        <h3>{finding.claim}</h3><p>{finding.interpretation}</p>
        <p className="ai-limitation"><strong>限制：</strong>{finding.limitations}</p>
        {finding.next_step && <p><strong>建议：</strong>{finding.next_step}</p>}
        {finding.evidence_refs.length > 0 && <div className="ai-citations"><strong>引用证据</strong>{finding.evidence_refs.map((ref, index) => <div className="ai-citation" key={`${ref.alias ?? ref.record_id ?? 'source'}-${index}`}>
          {ref.kind && <span className="ai-citation-kind">{citationKindLabel[ref.kind] ?? '证据'}</span>}
          <span>{ref.record_id ? `记录 ${ref.record_id}${ref.source_line ? ` · 第 ${ref.source_line} 行` : ''}` : ref.kind === 'objective' ? `指标 ${ref.indicator_id ?? ''}` : `${ref.name ?? '来源材料'}${ref.page ? ` · 第 ${ref.page} 页` : ''}`}</span>
          <q>{ref.excerpt}</q>
          {ref.record_id ? <button className="text-action" onClick={() => onEvidence?.(ref)} disabled={!onEvidence}>查看原始记录 ↗</button> : ref.kind === 'source' && ref.name ? <a href={learningApi.sourceUrl(ref.name)} target="_blank" rel="noreferrer">打开来源 PDF ↗</a> : ref.indicator_id ? <button className="text-action" onClick={() => onEvidence?.(ref)} disabled={!onEvidence}>查看指标 ↗</button> : null}
        </div>)}</div>}
      </article>) : <p className="muted">模型没有形成可验证的结论。请查看覆盖信息或补充证据。</p>}
      <small className="ai-provenance">版本 {result.generation} · {result.model} · 更新于 {new Date(result.updated_at).toLocaleString('zh-CN')}</small>
    </div>}
  </section>;
}
