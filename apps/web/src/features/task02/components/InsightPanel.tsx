import { useEffect, useState } from 'react';
import { learningApi } from '../../../api/client';
import type { InsightClaim, StudentInsights } from '../../../api/types';
import { Panel } from '../../../components/Panel';

const claimKind: Record<InsightClaim['kind'], string> = {
  fact: '观察事实',
  rule_observation: '已核验规则观察',
  hypothesis: '待验证假设',
};

export function InsightPanel({ student, indicator, node, onOpenEvidence }: {
  student: string;
  indicator: string;
  node: string;
  onOpenEvidence?: (recordId?: string, sourceLine?: number) => void;
}) {
  const [result, setResult] = useState<StudentInsights | null>(null);
  const [message, setMessage] = useState('正在整理范围内的证据…');
  useEffect(() => {
    let active = true;
    setResult(null);
    if (!student || !indicator || !node) {
      setMessage('选择学生、指标和测验节点后查看证据解释。');
      return () => { active = false; };
    }
    setMessage('正在整理范围内的证据…');
    learningApi.studentInsights(student, indicator, node).then(value => {
      if (!active) return;
      setResult(value);
      setMessage(value.claims.length ? '' : '当前范围没有可生成解释的有效评分点证据。');
    }).catch(error => {
      if (active) setMessage(`证据解释读取失败：${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { active = false; };
  }, [student, indicator, node]);

  return <Panel title="证据解释">
    {message && <p className="muted" role="status">{message}</p>}
    {result?.claims.map(claim => <article className="row insight-claim" key={claim.claim_id}>
      <strong>{claimKind[claim.kind]}</strong><p>{claim.text}</p>
      {claim.evidence_refs.length > 0 && <p>引用证据：{claim.evidence_refs.map(ref => `${ref.record_id ? `${ref.record_id} · ` : ''}${ref.material_id || '覆盖情况'}${ref.source_line ? ` · CSV第${ref.source_line}行` : ''}`).join('；')}</p>}
      {claim.limitations.length > 0 && <ul>{claim.limitations.map((limitation, index) => <li key={`${claim.claim_id}-${index}`}>{limitation}</li>)}</ul>}
      {claim.review_status !== 'teacher_reviewed' && <small>尚未由教师复核</small>}
      {claim.evidence_refs.some(ref => ref.record_id) && onOpenEvidence && <button className="secondary" onClick={() => { const ref = claim.evidence_refs.find(item => item.record_id); onOpenEvidence(ref?.record_id ?? undefined, ref?.source_line ?? undefined); }}>在作答证据中定位引用</button>}
    </article>)}
  </Panel>;
}
