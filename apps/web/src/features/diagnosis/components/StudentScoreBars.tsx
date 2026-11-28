import { EmptyState } from '../../../components/PageBits';
import { finite, str } from '../../shared/workbenchTypes';
import type { Bundle } from '../../shared/workbenchTypes';
import { DISPOSITION_LABELS } from './EvidenceRows';
import styles from '../../shared/WorkbenchPages.module.css';

/**
 * 逐题显示当前范围记录：有效评分显示得分条，待评分/未作答/已排除保持状态文字。
 * 没有评分不等于零分；缺失记录也不补零。
 */
export function StudentScoreBars({ bundle }: { bundle: Bundle }) {
  const rows = bundle.responses;
  if (!rows.length) return <EmptyState title="当前范围没有作答记录" detail="没有记录不代表零分或未掌握。"/>;
  return <div className={styles.studentScoreList}>
    <p>逐题显示当前有效评分；待评分、未作答与已排除记录保持状态，不折算成零分。</p>
    {rows.map((row, index) => {
      const score = finite(row.score);
      const maximum = finite(row.maximum);
      const scored = row.disposition === 'scored' && score !== null && maximum !== null && maximum > 0;
      const disposition = str(row.disposition, '');
      const stateLabel = DISPOSITION_LABELS[disposition] ?? (disposition || '状态未知');
      return <div className={styles.studentScoreRow} key={`${String(row.record_id)}-${index}`}>
        <span>{str(row.material_id)} · {str(row.record_id)}</span>
        {scored
          ? <progress aria-label={`${str(row.record_id)} 得分`} max={maximum!} value={Math.max(0, Math.min(score!, maximum!))}/>
          : <span className={styles.muted}>{stateLabel}</span>}
        <strong>{scored ? `${score} / ${maximum}` : stateLabel}</strong>
      </div>;
    })}
  </div>;
}
