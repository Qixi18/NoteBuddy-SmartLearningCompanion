import { Panel } from '../../../components/PageBits';
import type { RunData } from '../../../types/api';
import { finite, objectiveLabel, str } from '../../shared/workbenchTypes';
import { orderedNodeRows } from '../../shared/scopeUtils';
import styles from '../pages/StudentTeachingPage.module.css';

const STATES: Record<string, string> = {
  not_measured: '本次未测量', no_record: '无作答记录', excluded: '记录待核对',
  pending: '等待评分', unanswered: '未作答', scored: '已有评分',
};

/** Node-scoped, eligible-score metrics only; absent metrics remain unknown. */
export function StudentMetricOverview({ run, studentId, nodeId, indicatorId }: { run: RunData; studentId: string; nodeId: string; indicatorId: string }) {
  const metrics = run.metrics.filter(row => row.kind === 'student_indicator' && row.student_id === studentId && row.node_id === nodeId);
  const observations = run.observations.filter(row => row.student_id === studentId && row.node_id === nodeId);
  const indicators = run.objectives.map(row => String(row['指标编号'] ?? '')).filter(Boolean);
  const current = indicators.map(id => ({ id, metric: metrics.find(row => row.indicator_id === id), observation: observations.find(row => row.indicator_id === id) }));
  const selectedNodes = run.metrics.filter(row => row.kind === 'student_indicator' && row.student_id === studentId && row.indicator_id === indicatorId && row.node_id);
  const responseById = new Map(run.responses.map(row => [String(row['记录编号'] ?? ''), row]));
  const itemSet = (row: Record<string, unknown>) => [...new Set((Array.isArray(row.record_ids) ? row.record_ids : []).map(id => String(responseById.get(String(id))?.['材料编号'] ?? '')).filter(Boolean))].sort().join('|');
  const baseline = selectedNodes.find(row => row.node_id === nodeId);
  const baselineItems = baseline ? itemSet(baseline) : '';
  const comparable = baselineItems ? selectedNodes.filter(row => itemSet(row) === baselineItems) : [];
  const nodeOrder = new Map(orderedNodeRows(run.nodes).map((row, index) => [String(row['节点编号'] ?? ''), index]));
  const orderedComparable = [...comparable].sort((left, right) => (nodeOrder.get(String(left.node_id)) ?? 0) - (nodeOrder.get(String(right.node_id)) ?? 0));
  const ratio = (row?: Record<string, unknown>) => finite(row?.ratio);
  return <Panel title="知识指标表现与复测" action={<span className={styles.metricCaption}>仅呈现有效评分 · 当前指标已标记</span>}>
    <div className={styles.metricList}>{current.map(({ id, metric, observation }) => {
      const value = ratio(metric);
      const isCurrent = id === indicatorId;
      return <div className={`${styles.metricRow} ${isCurrent ? styles.metricCurrent : ''}`} key={id}>
        <span title={objectiveLabel(run.objectives, id)}>{objectiveLabel(run.objectives, id)}{isCurrent && <em className={styles.metricCurrentTag}>当前指标</em>}</span>
        {value == null ? <span className={styles.metricUnknown}>暂无可展示得分率</span> : <progress max={1} value={value} aria-label={`${id} 得分率`}/>}
        <strong>{value == null ? STATES[str(observation?.state, '')] ?? '待观察' : `${(value * 100).toFixed(0)}%`}</strong>
      </div>;
    })}</div>
    <div className={styles.metricTrend}><strong>同题组复测</strong>
      {orderedComparable.length > 1 ? <div className={styles.metricPoints}>{orderedComparable.map(row => <span key={String(row.node_id)}>{str(row.node_id)} <b>{ratio(row) == null ? '待评分' : `${(ratio(row)! * 100).toFixed(0)}%`}</b></span>)}</div>
        : <p>当前尚无另一测验节点使用相同题组且有有效评分；暂不绘制趋势。</p>}
    </div>
    <p className={styles.metricCaption}>指标得分率来自当前节点的有效评分；只有相同题组且日期明确的复测才按时间排列；不同题组或缺失评分不连成趋势，也不代表稳定掌握程度。</p>
  </Panel>;
}
