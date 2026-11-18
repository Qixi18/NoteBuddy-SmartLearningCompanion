import { useCallback, useEffect, useRef, useState } from 'react';
import { learningApi } from '../../api/client';
import type { AnalysisRun, CaseSuggestion, Draft, Review, ReviewMap, ReviewPayload, ReviewStatus, StructuredPlan } from '../../api/types';

export function reviewForNode(history: Review[], nodeId: string | null): Review | undefined {
  return history
    .filter(item => (item.node_id ?? item.original_draft?.node_id ?? null) === nodeId)
    .at(-1);
}

export function useWorkbench() {
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [reviews, setReviews] = useState<ReviewMap>({});
  const [suggestions, setSuggestions] = useState<CaseSuggestion[]>([]);
  const [student, setStudentState] = useState('');
  const [indicator, setIndicatorState] = useState('');
  const [node, setNode] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState('正在连接本地分析服务…');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const draftRequest = useRef(0);
  const refreshRequest = useRef(0);
  const currentRun = useRef<AnalysisRun | null>(null);
  const reviewKey = `${student}:${indicator}`;

  useEffect(() => { draftRequest.current += 1; setDraft(null); }, [reviewKey, run?.run_id]);

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequest.current;
    setLoading(true);
    try {
      const nextRun = await learningApi.run();
      if (requestId !== refreshRequest.current) return true;
      const [reviewsResult, casesResult] = await Promise.allSettled([
        learningApi.reviews(), learningApi.cases(),
      ]);
      if (requestId === refreshRequest.current) {
        if (currentRun.current?.run_id !== nextRun.run_id) {
          draftRequest.current += 1;
          setDraft(null);
          setNode('');
        }
        setRun(nextRun);
        currentRun.current = nextRun;
        setReviews(reviewsResult.status === 'fulfilled' ? reviewsResult.value : {});
        setSuggestions(casesResult.status === 'fulfilled' ? casesResult.value : []);
        setStudentState(current => nextRun.students.some(item => item['学生编号'] === current)
          ? current : nextRun.students[0]?.['学生编号'] ?? '');
        setIndicatorState(current => nextRun.objectives.some(item => item['指标编号'] === current)
          ? current : nextRun.objectives[0]?.['指标编号'] ?? '');
        const failed = [reviewsResult.status === 'rejected' ? '复核历史' : '', casesResult.status === 'rejected' ? '案例候选' : ''].filter(Boolean);
        setMessage(failed.length ? `已加载分析运行 ${nextRun.run_id}；${failed.join('、')}读取失败，可重试读取。` : `已加载分析运行 ${nextRun.run_id}`);
        setError(failed.length > 0);
        if (failed.length) return `${failed.join('、')}读取失败`;
      }
      return true;
    } catch (reason) {
      const failure = reason instanceof Error ? reason.message : String(reason);
      if (requestId === refreshRequest.current) {
        setMessage(failure);
        setError(true);
        return failure;
      }
      return true;
    } finally {
      if (requestId === refreshRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const announce = (text: string, failed = false) => { setMessage(text); setError(failed); };

  const setStudent = (studentId: string) => {
    if (studentId !== student) { draftRequest.current += 1; setDraft(null); }
    setStudentState(studentId);
  };
  const setIndicator = (indicatorId: string) => {
    if (indicatorId !== indicator) { draftRequest.current += 1; setDraft(null); }
    setIndicatorState(indicatorId);
  };
  const selectNode = (nodeId: string) => {
    if (nodeId !== node) draftRequest.current += 1;
    setNode(nodeId);
    setDraft(null);
  };

  const makeDraft = async (provider: 'rule' | 'deepseek', selectedNode = node) => {
    const requestId = ++draftRequest.current;
    const scope = `${student}:${indicator}:${selectedNode}`;
    try {
      announce(provider === 'rule' ? '正在生成规则草稿…' : '正在请求模型服务…');
      const result = provider === 'rule'
        ? await learningApi.ruleDraft(student, indicator, selectedNode || undefined)
        : await learningApi.modelDraft(student, indicator, selectedNode || undefined);
      if (requestId === draftRequest.current && scope === `${student}:${indicator}:${node}`) {
        setDraft(result);
        announce('草稿已生成，请结合原始记录复核。');
      }
    } catch (reason) {
      if (requestId === draftRequest.current && scope === `${student}:${indicator}:${node}`) {
        announce(reason instanceof Error ? reason.message : String(reason), true);
      }
    }
  };

  const saveReview = async (payload: {
    status: ReviewStatus; diagnosis: string; recommendation: string;
    adjustment_condition: string; reason: string;
    reviewer: string; structured_plan: StructuredPlan | null;
  }) => {
    if (!draft) throw new Error('请先生成诊断草稿');
    if (draft.scope_required || (draft.node_id && draft.node_id !== node)) throw new Error('当前草稿范围不匹配，请重新选择单一测验节点并生成草稿。');
    const savingRunId = currentRun.current?.run_id;
    const savingScope = `${student}:${indicator}:${node}`;
    const request: ReviewPayload = {
      student_id: student, indicator_id: indicator, ...payload,
      source: draft.source, model: draft.model, prompt_version: draft.prompt_version,
      evidence_record_ids: draft.evidence_record_ids, original_draft: draft,
    };
    await learningApi.saveReview(request);
    const nextReviews = await learningApi.reviews();
    if (currentRun.current?.run_id !== savingRunId || savingScope !== `${student}:${indicator}:${node}`) return;
    setReviews(nextReviews);
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
    run, reviews, suggestions, student, indicator, node, draft, message, error, loading, reviewKey,
    setStudent, setIndicator, setNode: selectNode, refresh, announce, makeDraft, saveReview, exportCases,
  };
}
