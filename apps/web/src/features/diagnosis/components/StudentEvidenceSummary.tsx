import { finite } from '../../shared/workbenchTypes';
import type { Bundle } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function StudentEvidenceSummary({ bundle, testName, indicatorName }: { bundle: Bundle; testName: string; indicatorName: string }) {
  const scoredRows = bundle.responses.filter(row => row.disposition === 'scored' && finite(row.score) !== null && finite(row.maximum) !== null && finite(row.maximum)! > 0);
  const scored = scoredRows.reduce((sum, row) => sum + finite(row.score)!, 0);
  const maximum = scoredRows.reduce((sum, row) => sum + finite(row.maximum)!, 0);
  const expected = Array.isArray(bundle.coverage.expected_material_ids) ? bundle.coverage.expected_material_ids.length : 0;
  const covered = new Set(scoredRows.map(row => String(row.material_id ?? '')).filter(Boolean)).size;
  return <section className={styles.studentEvidenceSummary} aria-label="当前学生证据概况">
    <div className={styles.studentMetric}><span>当前测验</span><strong>{testName}</strong><small>仅显示所选测验节点</small></div>
    <div className={styles.studentMetric}><span>有效作答题目</span><strong>{covered} / {expected}</strong><small>{scoredRows.length} 条有效评分记录；未评分不计入</small></div>
    <div className={styles.studentMetric}><span>关注观察指标</span><strong>{indicatorName}</strong><small>课程定义的观察指标，不等同于能力等级</small></div>
    <div className={`${styles.studentMetric} ${bundle.issues.length ? styles.studentMetricWarning : ''}`}><span>本次有效评分表现</span><strong>{maximum > 0 ? `${(scored / maximum * 100).toFixed(1)}%` : '暂无数据'}</strong><small>{bundle.issues.length ? `${bundle.issues.length} 项证据数据提示，详见作答记录` : '只汇总当前范围有效评分，不代表整体掌握程度'}</small></div>
  </section>;
}
