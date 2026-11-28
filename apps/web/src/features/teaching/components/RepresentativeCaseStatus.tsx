import { Flag } from 'lucide-react';
import { EmptyState, Panel } from '../../../components/PageBits';
import { str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../pages/StudentTeachingPage.module.css';

/**
 * 三名代表性案例的确认进度。只统计当前运行中"正式确认"的案例，
 * 有作答证据和无作答覆盖证据的合法案例都计入。
 */
export function RepresentativeCaseStatus({ cases, selectedStudent }: {
  cases?: Record<string, Row[]>;
  selectedStudent: string;
}) {
  const confirmed = Object.entries(cases ?? {})
    .map(([studentId, rows]) => ({ studentId, latest: rows.at(-1) }))
    .filter(item => item.latest && item.latest.status === 'confirmed');
  const count = confirmed.length;
  const remaining = Math.max(0, 3 - count);
  return <Panel title="代表性案例确认进度" icon={<Flag size={18}/>}>
    <div className={styles.progressBlock}>
      <div className={styles.progressHeader}>
        <strong className={styles.progressNumber}>{count} / 3</strong>
        <span className={styles.progressCaption}>{remaining ? `还需确认 ${remaining} 例` : '三名案例已确认'}</span>
      </div>
      <div className={styles.progressBar} role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={count} aria-label="代表性案例确认进度">
        <div className={styles.progressFill} style={{ width: `${Math.min(100, (count / 3) * 100)}%` }}/>
      </div>
      {count ? <ul className={styles.caseList}>{confirmed.map(item => <li key={item.studentId}>
        {item.studentId}{item.studentId === selectedStudent ? '（当前）' : ''} · 第 {str(item.latest?.version)} 版
      </li>)}</ul> : <EmptyState compact title="尚无正式确认案例" detail="在当前运行中确认三名代表性学生后，才能进入报告与成果导出。"/>}
      <p className={styles.summaryFoot}>
        按当前运行中的正式确认案例计算；范围正确、通过校验的覆盖证据案例与有作答证据案例同样计入。
      </p>
    </div>
  </Panel>;
}
