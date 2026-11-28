import { Flag } from 'lucide-react';
import { Panel } from '../../../components/PageBits';
import { str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../pages/StudentTeachingPage.module.css';

/**
 * 三名代表性案例的确认进度。只统计当前运行中"正式确认"的案例，
 * 有作答证据和无作答覆盖证据的合法案例都计入；空状态压缩为一行摘要，不占大块空间。
 */
export function RepresentativeCaseStatus({ cases, selectedStudent, currentCase, reviewCurrent = false }: {
  cases?: Record<string, Row[]>;
  selectedStudent: string;
  currentCase?: Row;
  reviewCurrent?: boolean;
}) {
  const confirmed = Object.entries(cases ?? {})
    .map(([studentId, rows]) => ({ studentId, latest: rows.at(-1) }))
    .filter(item => item.latest && item.latest.status === 'confirmed');
  const count = confirmed.length;
  const remaining = Math.max(0, 3 - count);
  const currentStatus = currentCase?.status === 'confirmed'
    ? (reviewCurrent ? `已确认 · 第 ${str(currentCase.version)} 版` : '待复核 · 原审核已失效')
    : currentCase ? '已归档 · 待确认' : '尚未确认';
  return <Panel title="代表性案例确认进度" icon={<Flag size={18}/>}>
    <div className={styles.caseProgress}>
      <div className={styles.caseProgressHead}>
        <strong className={styles.progressNumber}>{count} / 3</strong>
        <span className={styles.progressCaption}>{remaining ? `已确认 ${count} 例 · 待确认 ${remaining} 例` : '三名案例已确认'}</span>
        <span className={styles.caseCurrent}>{selectedStudent} · {currentStatus}</span>
      </div>
      <div className={styles.progressBar} role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={count} aria-label="代表性案例确认进度">
        <div className={styles.progressFill} style={{ width: `${Math.min(100, (count / 3) * 100)}%` }}/>
      </div>
      {confirmed.length > 0 ? <details className={styles.caseDetails}>
        <summary>展开已确认案例（{confirmed.length}）</summary>
        <ul className={styles.caseList}>{confirmed.map(item => <li key={item.studentId}>
          {item.studentId}{item.studentId === selectedStudent ? '（当前）' : ''} · 第 {str(item.latest?.version)} 版
        </li>)}</ul>
      </details> : <p className={styles.caseHint}>尚未确认正式案例。确认三名代表性学生后，才能进入成果导出；当前学生可在下方归档。</p>}
      <p className={styles.summaryFoot}>按当前运行中的正式确认案例计算；通过校验的覆盖证据案例与有作答证据案例同样计入。</p>
    </div>
  </Panel>;
}
