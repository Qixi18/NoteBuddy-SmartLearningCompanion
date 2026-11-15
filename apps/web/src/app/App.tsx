import { useCallback, useEffect, useState } from 'react';
import { learningApi } from '../api/client';
import type { AnalysisRun, CaseSuggestion, Draft, ReviewMap, ReviewPayload, ReviewStatus } from '../api/types';
import { ImportPanel } from '../features/import/ImportPanel';
import { QualityPanel } from '../pages/QualityPanel';
import { ClassPanel } from '../pages/ClassPanel';
import { ObjectivesPanel } from '../pages/ObjectivesPanel';
import { StudentPanel } from '../pages/StudentPanel';
import { EvidencePanel } from '../pages/EvidencePanel';
import { ReviewPanel } from '../pages/ReviewPanel';
import { ExportPanel } from '../features/export/ExportPanel';

export function App() {
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [reviews, setReviews] = useState<ReviewMap>({});
  const [suggestions, setSuggestions] = useState<CaseSuggestion[]>([]);
  const [student, setStudent] = useState('');
  const [indicator, setIndicator] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState('正在连接本地分析服务…');
  const [error, setError] = useState(false);
  const key = `${student}:${indicator}`;
  useEffect(() => { setDraft(null); }, [key]);
  const refresh = useCallback(async () => {
    try {
      const [nextRun, nextReviews, nextCases] = await Promise.all([
        learningApi.run(), learningApi.reviews(), learningApi.cases(),
      ]);
      setRun(nextRun); setReviews(nextReviews); setSuggestions(nextCases);
      setStudent(current => nextRun.students.some(s => s['学生编号'] === current) ? current : nextRun.students[0]?.['学生编号'] ?? '');
      setIndicator(current => nextRun.objectives.some(o => o['指标编号'] === current) ? current : nextRun.objectives[0]?.['指标编号'] ?? '');
      setMessage(`已加载分析运行 ${nextRun.run_id}`); setError(false);
    } catch (reason) { setRun(null); setMessage(reason instanceof Error ? reason.message : String(reason)); setError(true); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const announce = (text: string, failed = false) => { setMessage(text); setError(failed); };
  const makeDraft = async (provider: 'rule' | 'deepseek') => {
    try {
      announce(provider === 'rule' ? '正在生成规则草稿…' : '正在请求 DeepSeek…');
      const result = provider === 'rule'
        ? await learningApi.ruleDraft(student, indicator)
        : await learningApi.modelDraft(student, indicator);
      setDraft(result); announce('草稿已生成，请结合原始记录复核。');
    } catch (reason) { announce(reason instanceof Error ? reason.message : String(reason), true); }
  };
  const saveReview = async (payload: { status: ReviewStatus; diagnosis: string; recommendation: string; adjustment_condition: string; reason: string }) => {
    if (!draft) throw new Error('请先生成诊断草稿');
    const request: ReviewPayload = { student_id: student, indicator_id: indicator, ...payload,
      source: draft.source, model: draft.model, prompt_version: draft.prompt_version,
      evidence_record_ids: draft.evidence_record_ids, original_draft: draft };
    await learningApi.saveReview(request);
    setReviews(await learningApi.reviews());
    announce('复核已保存，历史版本已更新。');
  };
  const exportCases = (ids: string[]) => {
    if (ids.length !== 3 || new Set(ids).size !== 3) { announce('请选择三名不同的学生', true); return; }
    window.location.href = learningApi.exportUrl(ids);
  };
  return <>
    <header><h1>智慧学伴 · 证据工作台</h1><p>课程要求 → 作答证据 → 学情诊断 → 教学建议</p></header>
    <main><ImportPanel onImported={async id => { await refresh(); announce(`导入完成：${id}`); }} onMessage={announce} />
      <p id="message" className={error ? 'error' : ''} role="status">{message}</p>
      {run && <><div className="grid"><QualityPanel run={run} /><ClassPanel run={run} /></div>
        <div className="grid"><ObjectivesPanel run={run} /><StudentPanel run={run} student={student} indicator={indicator} onStudent={setStudent} onIndicator={setIndicator} /></div>
        <EvidencePanel run={run} student={student} indicator={indicator} />
        <ReviewPanel student={student} indicator={indicator} review={reviews[key]?.at(-1)} draft={draft} onDraft={makeDraft} onSave={saveReview} />
        <ExportPanel students={run.students} suggestions={suggestions} onExport={exportCases} />
      </>}
    </main>
  </>;
}
