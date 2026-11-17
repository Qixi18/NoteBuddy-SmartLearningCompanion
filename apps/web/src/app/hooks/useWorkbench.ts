import { useCallback, useEffect, useState } from 'react';
import { learningApi } from '../../api/client';
import type { AnalysisRun, CaseSuggestion, Draft, Review, ReviewMap, ReviewPayload, ReviewStatus } from '../../api/types';

export function reviewForNode(history: Review[], nodeId: string | null): Review | undefined {
  return history
    .filter(item => (item.node_id ?? item.original_draft?.node_id ?? null) === nodeId)
    .at(-1);
}

export function useWorkbench() {
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [reviews, setReviews] = useState<ReviewMap>({});
  const [suggestions, setSuggestions] = useState<CaseSuggestion[]>([]);
  const [student, setStudent] = useState('');
  const [indicator, setIndicator] = useState('');
  const [node, setNode] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState('正在连接本地分析服务…');
  const [error, setError] = useState(false);
  const reviewKey = `${student}:${indicator}`;

  useEffect(() => { setDraft(null); setNode(''); }, [reviewKey, run?.run_id]);

  const refresh = useCallback(async () => {
    try {
      const [nextRun, nextReviews, nextCases] = await Promise.all([
        learningApi.run(), learningApi.reviews(), learningApi.cases(),
      ]);
      setRun(nextRun);
      setReviews(nextReviews);
      setSuggestions(nextCases);
      setStudent(current => nextRun.students.some(item => item['学生编号'] === current)
        ? current : nextRun.students[0]?.['学生编号'] ?? '');
      setIndicator(current => nextRun.objectives.some(item => item['指标编号'] === current)
        ? current : nextRun.objectives[0]?.['指标编号'] ?? '');
      setMessage(`已加载分析运行 ${nextRun.run_id}`);
      setError(false);
    } catch (reason) {
      setRun(null);
      setMessage(reason instanceof Error ? reason.message : String(reason));
      setError(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const announce = (text: string, failed = false) => { setMessage(text); setError(failed); };

  const selectNode = (nodeId: string) => {
    setNode(nodeId);
    setDraft(null);
  };

  const makeDraft = async (provider: 'rule' | 'deepseek', selectedNode = node) => {
    try {
      announce(provider === 'rule' ? '正在生成规则草稿…' : '正在请求 DeepSeek…');
      const result = provider === 'rule'
        ? await learningApi.ruleDraft(student, indicator, selectedNode || undefined)
        : await learningApi.modelDraft(student, indicator, selectedNode || undefined);
      setDraft(result);
      announce('草稿已生成，请结合原始记录复核。');
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : String(reason), true);
    }
  };

  const saveReview = async (payload: {
    status: ReviewStatus; diagnosis: string; recommendation: string;
    adjustment_condition: string; reason: string;
  }) => {
    if (!draft) throw new Error('请先生成诊断草稿');
    const request: ReviewPayload = {
      student_id: student, indicator_id: indicator, ...payload,
      source: draft.source, model: draft.model, prompt_version: draft.prompt_version,
      evidence_record_ids: draft.evidence_record_ids, original_draft: draft,
    };
    await learningApi.saveReview(request);
    setReviews(await learningApi.reviews());
    announce('复核已保存，历史版本已更新。');
  };

  const exportCases = (ids: string[]) => {
    if (ids.length !== 3 || new Set(ids).size !== 3) {
      announce('请选择三名不同的学生', true);
      return;
    }
    window.location.href = learningApi.exportUrl(ids);
  };

  return {
    run, reviews, suggestions, student, indicator, node, draft, message, error, reviewKey,
    setStudent, setIndicator, setNode: selectNode, refresh, announce, makeDraft, saveReview, exportCases,
  };
}
