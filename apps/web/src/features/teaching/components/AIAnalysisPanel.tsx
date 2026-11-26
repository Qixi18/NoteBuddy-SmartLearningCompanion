import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { EmptyState, ErrorBox, Loading, Notice, Panel } from '../../../components/PageBits';
import { api, postJson } from '../api';
import { str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function AIAnalysisPanel({ runId, studentId, indicatorId, nodeId }: { runId: string; studentId: string; indicatorId: string; nodeId: string }) {
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
