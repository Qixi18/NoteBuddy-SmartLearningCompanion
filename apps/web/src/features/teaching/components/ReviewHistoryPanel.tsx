import { History } from 'lucide-react';
import { EmptyState, Notice, Panel } from '../../../components/PageBits';
import { REVIEW_STATUS_LABELS } from '../types';
import { str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../pages/StudentTeachingPage.module.css';

/**
 * 审核历史：按版本展示教师复核结论、理由与证据引用。
 * 旧的 structured_plan 记录仍可读；V2 方案单独标注，便于追溯。
 */
export function ReviewHistoryPanel({ rows, studentId, nodeId }: { rows: Row[]; studentId: string; nodeId: string }) {
  return <Panel title="教师复核历史" icon={<History size={18}/>}>
    <div className={styles.historyHeaderRow}>
      <b>{studentId} · {nodeId}</b>
      <span>{rows.length ? `共 ${rows.length} 个版本` : '暂无版本'}</span>
    </div>
    {rows.length ? <ol className={styles.historyList}>{[...rows].reverse().map(row => {
      const refs = Array.isArray(row.evidence_refs) ? row.evidence_refs as Row[] : [];
      const plan = row.teaching_plan_v2 && typeof row.teaching_plan_v2 === 'object' ? row.teaching_plan_v2 as Row : null;
      return <li key={String(row.version)} className={styles.historyItem}>
        <header>
          <span className={styles.historyStatus}>第 {str(row.version)} 版 · {REVIEW_STATUS_LABELS[String(row.status)] ?? str(row.status)}</span>
          {plan ? <span className={styles.historyMeta}>V2 方案 · 模板 {str(plan.template_version)}</span>
            : row.structured_plan ? <span className={styles.historyMeta}>旧版结构化方案</span> : null}
        </header>
        <span className={styles.historyMeta}>{str(row.reviewer, '未填写教师')} · {str(row.updated_at, '时间未记录')}</span>
        <p className={styles.historyReason}>{str(row.reason, '未填写复核理由')}</p>
        <span className={styles.historyMeta}>证据：{refs.length
          ? refs.map(ref => ref.kind === 'coverage' ? '当前范围覆盖' : str(ref.record_id)).join('、')
          : Array.isArray(row.evidence_record_ids) && row.evidence_record_ids.length
            ? (row.evidence_record_ids as string[]).join('、')
            : '—'}</span>
      </li>;
    })}</ol> : <EmptyState compact title="当前节点暂无教师复核历史" detail="接受或修改方案后，这里会按版本保留复核结论与理由。"/>}
    {rows.some(row => row.status === 'rejected') && <Notice>被驳回的版本仍保留在历史中，不会覆盖已采纳方案。</Notice>}
  </Panel>;
}
