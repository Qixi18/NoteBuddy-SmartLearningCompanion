import { History } from 'lucide-react';
import { Notice, Panel } from '../../../components/PageBits';
import { REVIEW_STATUS_LABELS } from '../types';
import { str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../pages/StudentTeachingPage.module.css';

function versionTone(row: Row, effectiveVersion?: unknown): 'current' | 'history' | 'inactive' {
  if (effectiveVersion != null && Number(row.version) === Number(effectiveVersion)) return 'current';
  if (row.status === 'accepted' || row.status === 'edited') return 'history';
  return 'inactive';
}

/**
 * 教师复核历史：紧凑时间线。
 * 当前有效、历史版本、未生效版本分开标识；每条记录可展开查看方案与证据引用。
 */
export function ReviewHistoryPanel({ rows, studentId, nodeId, effectiveVersion }: {
  rows: Row[];
  studentId: string;
  nodeId: string;
  effectiveVersion?: unknown;
}) {
  const ordered = [...rows].reverse();
  return <Panel title="教师复核历史" icon={<History size={18}/>} action={<span className={styles.historyCount}>{rows.length ? `共 ${rows.length} 个版本` : '暂无版本'}</span>}>
    <div className={styles.historyHeaderRow}><b>{studentId} · {nodeId}</b><span>按版本倒序 · 当前有效版本单独标识</span></div>
    {rows.length ? <ol className={styles.historyTimeline}>{ordered.map(row => {
      const refs = Array.isArray(row.evidence_refs) ? row.evidence_refs as Row[] : [];
      const plan = row.teaching_plan_v2 && typeof row.teaching_plan_v2 === 'object' ? row.teaching_plan_v2 as Row : null;
      const structured = row.structured_plan && typeof row.structured_plan === 'object' ? row.structured_plan as Row : null;
      const tone = versionTone(row, effectiveVersion);
      return <li key={String(row.version)} className={styles.historyItem} data-tone={tone}>
        <span className={styles.historyDot} aria-hidden="true"/>
        <div className={styles.historyBody}>
          <header className={styles.historyItemHead}>
            <b>第 {str(row.version)} 版 · {REVIEW_STATUS_LABELS[String(row.status)] ?? str(row.status)}</b>
            {tone === 'current' && <span className={styles.historyCurrent}>当前有效</span>}
            {tone === 'history' && <span className={styles.historyTag}>历史版本</span>}
            {tone === 'inactive' && <span className={styles.historyTag} data-tone="inactive">未生效</span>}
            {plan ? <span className={styles.historyMeta}>V2 方案 · 模板 {str(plan.template_version)}</span> : structured ? <span className={styles.historyMeta}>旧版结构化方案</span> : null}
          </header>
          <span className={styles.historyMeta}>{str(row.reviewer, '未填写教师')} · {str(row.updated_at, '时间未记录')}</span>
          <p className={styles.historyReason}>{str(row.reason, '未填写复核理由')}</p>
          <span className={styles.historyMeta}>证据：{refs.length
            ? refs.map(ref => ref.kind === 'coverage' ? '当前范围覆盖' : str(ref.record_id)).join('、')
            : Array.isArray(row.evidence_record_ids) && row.evidence_record_ids.length
              ? (row.evidence_record_ids as string[]).join('、')
              : '—'}</span>
          {(plan || structured) && <details className={styles.historyDetails}>
            <summary>展开方案内容</summary>
            <div className={styles.historyPlan}>
              {plan ? <>
                <p><b>学习目标：</b>{str(plan.goal)}</p>
                {Array.isArray(plan.steps) && <div><b>学习步骤：</b><ol>{(plan.steps as unknown[]).map((step, index) => <li key={index}>{str(step)}</li>)}</ol></div>}
                {Array.isArray(plan.material_ids) && <p><b>推荐材料：</b>{(plan.material_ids as unknown[]).map(item => str(item)).join('、') || '无'}</p>}
                {Array.isArray(plan.observation_points) && <p><b>观察点：</b>{(plan.observation_points as unknown[]).map(item => str(item)).join('；')}</p>}
                <p className={styles.historyMeta}>证据指纹：{str(plan.evidence_fingerprint).slice(0, 16)}…</p>
              </> : <>
                <p><b>学习活动：</b>{str(structured?.activity)}</p>
                {Array.isArray(structured?.steps) && <div><b>学习步骤：</b><ol>{(structured!.steps as unknown[]).map((step, index) => <li key={index}>{str(step)}</li>)}</ol></div>}
                {Array.isArray(structured?.material_ids) && <p><b>材料：</b>{(structured!.material_ids as unknown[]).map(item => str(item)).join('、') || '无'}</p>}
              </>}
            </div>
          </details>}
        </div>
      </li>;
    })}</ol> : <p className={styles.historyEmpty}>当前节点暂无教师复核历史。接受或修改方案后，这里会按版本保留复核结论、理由与方案内容。</p>}
    {rows.some(row => row.status === 'rejected') && <Notice>被驳回的版本仍保留在历史中，不会覆盖已采纳方案。</Notice>}
  </Panel>;
}
