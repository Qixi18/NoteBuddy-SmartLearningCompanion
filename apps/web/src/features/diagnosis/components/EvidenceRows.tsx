import { EmptyState } from '../../../components/PageBits';
import { finite, str } from '../../shared/workbenchTypes';
import type { Bundle, Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export const DISPOSITION_LABELS: Record<string, string> = {
  scored: '已评分',
  pending: '待评分',
  unanswered: '未作答',
  excluded: '已排除',
  no_record: '无记录',
  not_measured: '未测量',
};

function JsonSummary({ value }: { value: unknown }) {
  if (value == null) return <EmptyState title="暂无数据" detail="接口没有返回数据。"/>;
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index + 1), item] as const) : typeof value === 'object' ? Object.entries(value as Row) : [['内容', value] as const];
  return <div className={styles.jsonSummary}>{entries.length ? entries.slice(0, 18).map(([key, item]) => <div key={key}><b>{key}</b><span>{typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item ?? '—')}</span></div>) : <EmptyState title="列表为空" detail="当前运行没有相应目录条目。"/>}</div>;
}

function scoreLabel(row: Row): string {
  const score = finite(row.score);
  const maximum = finite(row.maximum);
  if (score == null) return '无评分';
  if (maximum == null || maximum <= 0) return `${score} 分`;
  return `${score} / ${maximum} 分`;
}

/** 原始作答列表：默认折叠，每条记录展开后显示作答、过程、得分与评分点。 */
export function EvidenceRows({ bundle, selectedItem }: { bundle: Bundle; selectedItem?: string }) {
  const rows = bundle.responses.filter(row => !selectedItem || row.material_id === selectedItem);
  return rows.length ? <div className={styles.evidenceRows}>{rows.map((row, index) => {
    const disposition = str(row.disposition, '状态未知');
    const dispositionLabel = DISPOSITION_LABELS[disposition] ?? disposition;
    const scored = disposition === 'scored';
    return <details key={String(row.evidence_id ?? index)}>
      <summary>
        <b>{str(row.record_id, '作答记录')} · {str(row.material_id)}</b>
        <span className={styles.responseScore}>{scoreLabel(row)}</span>
        <span className={styles.disposition} data-state={disposition}>{dispositionLabel}</span>
      </summary>
      <div className={styles.responseBody}>
        <p><b>最终作答：</b>{str(row.raw_response, '未提供')}</p>
        <p><b>解答过程：</b>{str(row.solution_steps, '未提供')}</p>
        <p><b>得分：</b>{scoreLabel(row)}</p>
        {!scored && <p className={styles.responseNote}>当前记录没有形成有效评分，不能作为得分依据，也不等同于零分。</p>}
        {Boolean(row.rubric_observation) && <JsonSummary value={row.rubric_observation}/>}
      </div>
    </details>;
  })}</div> : <EmptyState compact title="当前范围没有作答记录" detail="没有记录不代表零分或未掌握。"/>;
}
