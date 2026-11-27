import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, History } from 'lucide-react';
import { EmptyState, ErrorBox, Loading, Notice, Panel } from '../../../components/PageBits';
import { api, patchJson, postJson } from '../api';
import { str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';
import { compareNodeChronology, orderedNodeRows } from '../../shared/scopeUtils';

const STATUS_LABELS: Record<string, string> = {
  not_completed: '尚未完成',
  partial: '部分完成',
  completed: '已完成',
};

interface EvidenceRecord {
  record_id: string;
  student_id: string;
  material_id: string;
  score: string | number | null;
  maximum: string | number | null;
  score_status: string;
}

export function ClassAdjustmentWorkflow({
  runId, classId, nodeId, plan, nodes,
}: { runId: string; classId: string; nodeId: string; plan: Row | undefined; nodes: Row[] }) {
  const queryClient = useQueryClient();
  const planAccepted = Boolean(plan) && ['accepted', 'edited'].includes(str(plan?.status));
  const canCreate = planAccepted && !plan?.stale;
  const [activity, setActivity] = useState('');
  const [practice, setPractice] = useState('');
  const [observations, setObservations] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const adjustments = useQuery({
    queryKey: ['class-adjustments', runId, classId, nodeId],
    queryFn: () => api<Row[]>(`/api/class-teaching-adjustments?class=${encodeURIComponent(classId)}&node=${encodeURIComponent(nodeId)}`),
    enabled: Boolean(runId && classId && nodeId),
  });
  const nodeLabels = useMemo(() => new Map(nodes.map(item => [
    str(item['节点编号']), str(item['节点名称'], str(item['节点编号'])),
  ])), [nodes]);
  const create = useMutation({
    mutationFn: () => api<Row>('/api/class-teaching-adjustments', postJson({
      run_id: runId,
      class_id: classId,
      node_id: nodeId,
      plan_id: plan?.plan_id,
      planned_activity: activity.trim(),
      planned_practice: practice.split('\n').map(line => line.trim()).filter(Boolean),
      observation_points: observations.split('\n').map(line => line.trim()).filter(Boolean),
      teacher: '',
    })),
    onSuccess: async () => {
      setError('');
      setMessage('班级教学实施计划已保存，并绑定当前已采纳的方案版本。');
      setActivity(''); setPractice(''); setObservations('');
      await queryClient.invalidateQueries({ queryKey: ['class-adjustments'] });
    },
    onError: cause => { setMessage(''); setError((cause as Error).message); },
  });

  return <Panel title="班级教学实施与复测" icon={<ClipboardCheck size={18}/>}>
    <Notice>
      实施记录只属于当前班级与测验节点，与学生级教学调整相互独立。后续效果必须引用本班该测验节点的实际作答记录。
    </Notice>
    {!planAccepted && <EmptyState compact title="需要先采纳当前班级方案" detail="仅采纳或教师修改后的班级方案，才能登记实施与复测记录。"/>}
    {planAccepted && Boolean(plan?.stale) && <Notice tone="warning">当前方案已过期，请重新生成并采纳后再登记实施记录。</Notice>}

    {canCreate && <div className={styles.caseForm}>
      <label>实施活动<textarea rows={2} value={activity} onChange={event => setActivity(event.target.value)} placeholder="例如：集中处理方程类共同问题，按四步推进"/></label>
      <div className={styles.adjustmentFormGrid}>
        <label>练习安排（每行一条）<textarea rows={3} value={practice} onChange={event => setPractice(event.target.value)} placeholder="Q001 同型题重练"/></label>
        <label>观察点（每行一条）<textarea rows={3} value={observations} onChange={event => setObservations(event.target.value)} placeholder="复测时比较方程指标得分率"/></label>
      </div>
      <div className={styles.reviewActions}>
        <button
          type="button"
          className={styles.adjustmentSubmit}
          disabled={create.isPending || !activity.trim()}
          onClick={() => { setMessage(''); create.mutate(); }}
        >{create.isPending ? '正在保存…' : '保存班级实施计划'}</button>
      </div>
    </div>}

    {adjustments.isPending ? <Loading label="读取班级实施记录…"/>
      : adjustments.isError ? <ErrorBox message={(adjustments.error as Error).message}/>
      : !adjustments.data?.length ? <EmptyState compact title="暂无班级实施记录" detail="采纳方案后可登记一次班级教学实施与复测。"/>
      : <div className={styles.adjustmentList}>{adjustments.data.map(record => <ClassAdjustmentRecord
            key={str(record.adjustment_id)}
            record={record}
            nodes={nodes}
            nodeLabels={nodeLabels}
          />)}</div>}

    {message && <p role="status" className={styles.limitation}>{message}</p>}
    {error && <Notice tone="error">{error}</Notice>}
  </Panel>;
}

function ClassAdjustmentRecord({
  record, nodes, nodeLabels,
}: { record: Row; nodes: Row[]; nodeLabels: Map<string, string> }) {
  const queryClient = useQueryClient();
  const [implementation, setImplementation] = useState(str(record.implementation, ''));
  const [outcome, setOutcome] = useState(str(record.outcome_observations, ''));
  const [status, setStatus] = useState(str(record.implementation_status, 'not_completed'));
  const [conclusion, setConclusion] = useState(str(record.teacher_conclusion, ''));
  const [followupNode, setFollowupNode] = useState(str(record.followup_node_id, str(record.node_id)));
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(record.followup_evidence_record_ids)
      ? record.followup_evidence_record_ids.map(String)
      : [],
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setImplementation(str(record.implementation, ''));
    setOutcome(str(record.outcome_observations, ''));
    setStatus(str(record.implementation_status, 'not_completed'));
    setConclusion(str(record.teacher_conclusion, ''));
    setFollowupNode(str(record.followup_node_id, str(record.node_id)));
    setSelected(Array.isArray(record.followup_evidence_record_ids) ? record.followup_evidence_record_ids.map(String) : []);
  }, [record.adjustment_id, record.updated_at]);

  const evidence = useQuery({
    queryKey: ['class-evidence', str(record.run_id), str(record.class_id), followupNode],
    queryFn: () => api<Row>(`/api/class-evidence?class=${encodeURIComponent(str(record.class_id))}&node=${encodeURIComponent(followupNode)}`),
    enabled: Boolean(record.run_id && record.class_id && followupNode),
  });
  const records = (evidence.data?.records as EvidenceRecord[] | undefined) ?? [];
  const comparisons = Array.isArray(record.followup_comparison)
    ? record.followup_comparison as Row[]
    : [];
  const eligibleNodes = orderedNodeRows(nodes);
  const followupOrder = compareNodeChronology(nodes, str(record.node_id), followupNode);
  const hasLaterFollowupNode = eligibleNodes.some(item =>
    compareNodeChronology(nodes, str(record.node_id), str(item['节点编号'])) === -1,
  );
  const hasOtherIneligibleNode = eligibleNodes.some(item => {
    const id = str(item['节点编号']);
    return id !== str(record.node_id) && compareNodeChronology(nodes, str(record.node_id), id) !== -1;
  });

  const update = useMutation({
    mutationFn: () => api<Row>(`/api/class-teaching-adjustments/${encodeURIComponent(str(record.adjustment_id))}`, patchJson({
      implementation: implementation.trim(),
      implementation_status: status,
      outcome_observations: outcome.trim(),
      followup_node_id: followupNode,
      followup_evidence_record_ids: selected,
      teacher_conclusion: conclusion.trim(),
    })),
    onSuccess: async () => {
      setError('');
      setMessage('实施情况与复测证据已保存，先前记录保留在历史中。');
      await queryClient.invalidateQueries({ queryKey: ['class-adjustments'] });
    },
    onError: cause => { setMessage(''); setError((cause as Error).message); },
  });

  const disabled = update.isPending
    || !implementation.trim()
    || !selected.length
    || followupOrder !== -1
    || (status === 'completed' && !conclusion.trim());
  const evidenceOptions = useMemo(
    () => records.filter(item => item.student_id),
    [records],
  );

  return <details className={styles.adjustmentRecord} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>
      <b>{str(record.planned_activity, '未填写活动')}</b>
      <span>{STATUS_LABELS[str(record.implementation_status)] ?? str(record.implementation_status)}</span>
      <span>方案第 {str(record.plan_version)} 版</span>
      <span>{record.concluded_at ? `已更新 ${str(record.updated_at)}` : '待记录实施与复测'}</span>
    </summary>
    <div className={styles.adjustmentRecordBody}>
      {Array.isArray(record.planned_practice) && record.planned_practice.length > 0 && <p><strong>练习安排：</strong>{record.planned_practice.map(String).join('；')}</p>}
      {Array.isArray(record.observation_points) && record.observation_points.length > 0 && <p><strong>观察点：</strong>{record.observation_points.map(String).join('；')}</p>}
      <div className={styles.adjustmentFormGrid}>
        <label>实施记录<textarea rows={3} value={implementation} onChange={event => setImplementation(event.target.value)} placeholder="记录实际开展的教学活动"/></label>
        <label>效果观察<textarea rows={3} value={outcome} onChange={event => setOutcome(event.target.value)} placeholder="只写有证据支持的观察"/></label>
      </div>
      <div className={styles.adjustmentFormGrid}>
        <label>实施状态<select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="not_completed">尚未完成</option>
          <option value="partial">部分完成</option>
          <option value="completed">已完成</option>
        </select></label>
        <label>复测节点<select value={followupNode} onChange={event => { setFollowupNode(event.target.value); setSelected([]); }}>
          {eligibleNodes.map(item => {
            const id = str(item['节点编号']);
            const comparison = compareNodeChronology(nodes, str(record.node_id), id);
            const eligible = comparison === -1;
            return <option key={id} value={id} disabled={!eligible}>{id} · {nodeLabels.get(id) ?? id}{comparison === 0 ? ' · 实施节点不可复测' : comparison === null ? ' · 日期待确认' : comparison === 1 ? ' · 早于实施节点' : ''}</option>;
          })}
        </select></label>
        {(hasOtherIneligibleNode || !hasLaterFollowupNode) && <small className={styles.limitation}>复测只允许使用日期明确且晚于实施节点的测验；不能复用实施节点、同日节点或日期不明的节点。</small>}
      </div>
      <fieldset className={styles.followupEvidence}>
        <legend>复测作答证据（必选，{selected.length} 条）</legend>
        {evidence.isPending ? <small>正在读取所选复测节点的作答证据…</small>
          : evidenceOptions.length ? evidenceOptions.map(option => <label key={option.record_id}>
          <input
            type="checkbox"
            checked={selected.includes(option.record_id)}
            onChange={event => setSelected(current => event.target.checked
              ? [...new Set([...current, option.record_id])]
              : current.filter(id => id !== option.record_id))}
          />
          <span>{option.record_id} · {option.student_id} · {option.material_id} · {str(option.score)}/{str(option.maximum)}</span>
        </label>) : <small>该节点没有本班有效作答记录；不能填写基于空证据的效果结论。</small>}
      </fieldset>
      {comparisons.length > 0 && <section className={styles.retestComparison} aria-label="班级复测指标对照">
        <header><b>同指标、共同题组复测对照</b><span>描述性统计</span></header>
        {comparisons.map(comparison => {
          const before = comparison.baseline as Row | undefined;
          const after = comparison.followup as Row | undefined;
          const formatRatio = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '不可比较';
          const coverage = (value: Row | undefined) => `${str(value?.observed_student_count, '0')} / ${str(value?.student_count, '0')} 人`;
          return <article key={str(comparison.indicator_id)}>
            <strong>{str(comparison.indicator_id)} · {comparison.status === 'comparable' ? `变化 ${typeof comparison.delta_ratio === 'number' ? `${comparison.delta_ratio > 0 ? '+' : ''}${(comparison.delta_ratio * 100).toFixed(1)} 个百分点` : '不可计算'}` : '当前不可比较'}</strong>
            {comparison.status === 'comparable' ? <>
              <div><span>实施前 {formatRatio(before?.ratio)} · {str(before?.record_count, '0')} 条有效评分 · 覆盖 {coverage(before)}</span><span>复测 {formatRatio(after?.ratio)} · {str(after?.record_count, '0')} 条有效评分 · 覆盖 {coverage(after)}</span></div>
              <small>共同题目：{Array.isArray(comparison.common_material_ids) ? comparison.common_material_ids.map(String).join('、') : '—'}</small>
            </> : <small>{str(comparison.reason, '缺少可比较的共同题目或有效评分。')}</small>}
            <small>{str(comparison.interpretation, '描述性分数变化不证明变化由教学实施导致。')}</small>
          </article>;
        })}
      </section>}
      <label className={styles.adjustmentWideField}>教师结论<textarea rows={2} value={conclusion} onChange={event => setConclusion(event.target.value)} placeholder="结合所选复测证据记录结论与下一步"/></label>
      <div className={styles.reviewActions}>
        <button type="button" className={styles.adjustmentSubmit} disabled={disabled} onClick={() => { setMessage(''); update.mutate(); }}>
          <History size={14}/>{update.isPending ? '正在保存…' : '保存实施与复测'}
        </button>
      </div>
      {message && <p role="status" className={styles.limitation}>{message}</p>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  </details>;
}
