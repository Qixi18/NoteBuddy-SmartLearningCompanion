import type { AnalysisRun } from '../api/types';
import type { AIAnalysisFinding } from '../api/types';
import { ObjectivesPanel } from '../features/task01/components/ObjectivesPanel';
import { AIAnalysisPanel } from '../features/ai-analysis/AIAnalysisPanel';

export function RequirementsPage({ run, indicator, onIndicator, onEvidence, onDataChanged, onDirtyChange }: {
  run: AnalysisRun;
  indicator: string;
  onIndicator: (id: string) => void;
  onEvidence: (ref: AIAnalysisFinding['evidence_refs'][number]) => void;
  onDataChanged?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const topics = new Set(run.objectives.map(item => item['主题'] || item['主题编号']));
  const [mappings, setMappings] = useState<Record<string, Array<{ status: string; mappings: Array<{ material_id: string; relation: string; status: string; explanation: string; evidence: Array<{ source: string; page?: number; line?: number; excerpt: string }> }>; validation_errors: string[] }>>>({});
  const [mappingMessage, setMappingMessage] = useState('');
  const [mappingBusy, setMappingBusy] = useState(false);
  useEffect(() => { let active = true; learningApi.aiSourceMappings().then(value => { if (active) setMappings(value); }).catch(() => undefined); return () => { active = false; }; }, [run.run_id]);
  const generateMappings = async (all = false) => {
    setMappingBusy(true); setMappingMessage('正在生成本次模型发送清单…');
    try {
      const preview = await learningApi.aiSourceMappingPreview(all ? undefined : indicator);
      const sourceFiles = preview.source_files.map(file => `${file.name}${file.pages?.length ? ` 第 ${file.pages.join('、')} 页` : ''}${file.lines?.length ? ` 第 ${file.lines.join('、')} 行` : ''}`).join('；');
      const accepted = window.confirm(`模型服务：${preview.provider} · ${preview.model}\n指标范围：${preview.indicator_ids.join('、')}\n发送来源：${sourceFiles || '无可用来源'}\n本次输入约 ${preview.input_bytes} 字节；费用单位：输入和输出 tokens。映射结果不缓存，每次请求均可能计费；失败项可单独重试，重试会再次调用模型。确认发送？`);
      if (!accepted) return;
      setMappingMessage(all ? '正在逐项分析所有指标…' : '正在分析当前指标…');
      const result = await learningApi.generateAISourceMappings(all ? undefined : indicator, preview.fingerprint);
      const updated = await learningApi.aiSourceMappings(); setMappings(updated); const successes = result.results.filter(row => row.status === 'usable').length; setMappingMessage(`处理完成：${successes}/${result.results.length} 项映射通过校验；其余项目显示具体失败或待处理原因。`); onDataChanged?.();
    }
    catch (error) { setMappingMessage(error instanceof Error ? error.message : String(error)); }
    finally { setMappingBusy(false); }
  };
  const currentMapping = mappings[indicator]?.at(-1);
  return <>
    <p className="scope-summary">当前运行 {run.run_id} · {topics.size} 个主题 · {run.objectives.length} 项指标。来源 PDF 需由你单独启动 OCR；AI 映射先作为候选，校验通过后可进入相应推荐。</p>
    <ObjectivesPanel run={run} indicatorId={indicator} onIndicatorChange={onIndicator} onSaved={onDataChanged} onDirtyChange={onDirtyChange} />
    <section className="card" aria-label="AI指标映射"><h2>AI 指标与材料映射</h2><p className="muted">AI 会读取已解析的课标页、题目与评分点；每条关系必须带可追溯原文。通过引用和编号校验后进入推荐候选，关系解释仍保留供复核。</p><button type="button" disabled={mappingBusy} onClick={() => void generateMappings()}>{mappingBusy ? '正在分析…' : `分析当前指标 ${indicator}`}</button> <button type="button" disabled={mappingBusy} onClick={() => void generateMappings(true)}>分析全部 {run.objectives.length} 项指标</button>{mappingMessage && <p role="status">{mappingMessage}</p>}{currentMapping && <><p>当前结果：{currentMapping.status} · {currentMapping.mappings.length} 条映射</p>{currentMapping.mappings.map((row, index) => <details key={`${row.material_id}-${index}`}><summary>{row.material_id} · {row.relation} · {row.status}</summary><p>{row.explanation}</p>{row.evidence.map((ref, refIndex) => <blockquote key={refIndex}>{ref.source}{ref.page ? ` · 第 ${ref.page} 页` : ''}{ref.line ? ` · 第 ${ref.line} 行` : ''}：{ref.excerpt}</blockquote>)}</details>)}{currentMapping.validation_errors.map(error => <p className="warn" key={error}>{error}</p>)}</> }</section>
    <details className="ai-analysis-disclosure"><summary>辅助分析</summary><AIAnalysisPanel task="task01" runId={run.run_id} onEvidence={onEvidence} /></details>
  </>;
}
import { useEffect, useState } from 'react';
import { learningApi } from '../api/client';
