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
        const sameRun = currentRun.current?.run_id === nextRun.run_id;
        if (!sameRun) {
          draftRequest.current += 1;
          setDraft(null);
          setNode('');
          setStudentState('');
          setIndicatorState(nextRun.objectives[0]?.['指标编号'] ?? '');
        }
        setRun(nextRun);
        currentRun.current = nextRun;
        setReviews(current => reviewsResult.status === 'fulfilled' ? reviewsResult.value : sameRun ? current : {});
        setSuggestions(current => casesResult.status === 'fulfilled' ? casesResult.value : sameRun ? current : []);
        setStudentState(current => sameRun && nextRun.students.some(item => item['学生编号'] === current) ? current : '');
        setIndicatorState(current => sameRun && nextRun.objectives.some(item => item['指标编号'] === current)
          ? current : nextRun.objectives[0]?.['指标编号'] ?? '');
        const failed = [reviewsResult.status === 'rejected' ? '复核历史' : '', casesResult.status === 'rejected' ? '案例候选' : ''].filter(Boolean);
        setMessage(failed.length ? `当前运行已加载；${failed.join('、')}读取失败，可重试读取。` : '');
        setError(failed.length > 0);
        if (failed.length) return `${failed.join('、')}读取失败`;
      }
      return true;
    } catch (reason) {
      const failure = reason instanceof Error ? reason.message : String(reason);
      if (requestId === refreshRequest.current) {
        const noImportedRun = failure === '尚未导入赛事数据';
        setMessage(noImportedRun ? '' : failure);
        setError(!noImportedRun);
        return noImportedRun ? true : failure;
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
    reviewer: string; structured_plan: StructuredPlan | null; teaching_plan_v2: import('../../api/types').TeachingPlanV2 | null; evidence_refs?: import('../../api/types').EvidenceReference[];
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

  const exportCases = async (ids: string[]) => {
    if (ids.length !== 3 || new Set(ids).size !== 3) {
      announce('请选择三名不同的学生', true);
      return;
    }
    announce('正在生成成果包…');
    try {
      const response = await fetch(learningApi.exportUrl(ids));
      if (!response.ok) {
        const body = await response.text();
        let detail = body;
        try {
          const parsed: unknown = JSON.parse(body);
          if (parsed && typeof parsed === 'object' && 'error' in parsed) {
            detail = String(parsed.error);
          }
        } catch {
          // Keep a readable plain-text server message when the error is not JSON.
        }
        throw new Error(detail || `请求失败（${response.status}）`);
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('服务返回了空成果包');
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '智慧学伴成果包.zip';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      announce('成果包下载已开始。');
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : '请检查本地服务后重试';
      announce(`成果包下载失败：${detail}`, true);
    }
  };

  return {
    run, reviews, suggestions, student, indicator, node, draft, message, error, loading, reviewKey,
    setStudent, setIndicator, setNode: selectNode, refresh, announce, makeDraft, saveReview, exportCases,
  };
}
