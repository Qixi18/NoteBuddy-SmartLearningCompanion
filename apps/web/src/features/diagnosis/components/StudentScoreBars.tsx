import { EmptyState } from '../../../components/PageBits';
import { finite, str } from '../../shared/workbenchTypes';
import type { Bundle } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function StudentScoreBars({ bundle }: { bundle: Bundle }) {
  const rows = bundle.responses.filter(row => row.disposition === 'scored' && finite(row.score) !== null && finite(row.maximum) !== null && finite(row.maximum)! > 0);
  return rows.length ? <div className={styles.studentScoreList}><p>逐题显示当前有效评分；缺失记录不作为零分。</p>{rows.map((row, index) => { const score = finite(row.score)!; const maximum = finite(row.maximum)!; return <div className={styles.studentScoreRow} key={`${String(row.record_id)}-${index}`}><span>{str(row.material_id)} · {str(row.record_id)}</span><progress aria-label={`${str(row.record_id)} 得分`} max={maximum} value={Math.max(0, Math.min(score, maximum))}/><strong>{score} / {maximum}</strong></div>; })}</div> : <EmptyState title="当前范围没有有效评分" detail="有作答记录不一定代表已经评分；未评分状态保持未知。"/>;
}
