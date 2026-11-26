import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import { finite, str } from '../../shared/workbenchTypes';
import type { Bundle, Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function RubricPointSummary({ bundle, params }: { bundle: Bundle; params: URLSearchParams }) {
  const definitions = new Map(bundle.rubric_definitions.map(row => [`${String(row.item_id)}:${String(row.point_id)}`, row]));
  const points = bundle.responses.flatMap(response => {
    const observation = response.rubric_observation as Row | undefined;
    if (response.disposition !== 'scored' || observation?.state !== 'valid' || !Array.isArray(observation.points)) return [];
    return (observation.points as Row[]).map(point => ({ response, point, definition: definitions.get(`${String(response.material_id)}:${String(point.point_id)}`) }));
  });
  return points.length ? <div className={styles.rubricPointList}>{points.map(({ response, point, definition }, index) => {
    const earned = finite(point.earned); const maximum = finite(point.maximum);
    return <article key={`${String(response.record_id)}-${String(point.point_id)}-${index}`}><div><b>{str(definition?.description, String(point.point_id ?? '评分点'))}</b><small>{str(response.material_id)} · {str(response.record_id)}</small></div><strong className={earned !== null && maximum !== null && earned < maximum ? styles.pointPartial : styles.pointComplete}>{earned === null || maximum === null ? '未知' : `${earned} / ${maximum}`}</strong><Link aria-label={`查看 ${str(response.material_id)} 作答证据`} to={{ pathname: `${routes.itemEvidence}/${encodeURIComponent(String(response.material_id))}`, search: params.toString() }}><ArrowRight size={14}/></Link></article>;
  })}<small>仅反映本次作答中的评分点记录；冲突或未知评分点不推断为零分。</small></div> : <EmptyState title="没有可汇总的评分点观察" detail="当前数据未提供有效且一致的逐点评分。可在题目证据中查看原始作答与评分状态。"/>;
}
