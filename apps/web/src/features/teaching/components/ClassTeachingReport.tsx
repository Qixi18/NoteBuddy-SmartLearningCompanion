import { CircleHelp, Layers3, Target, Users } from 'lucide-react';
import { DataTable, EmptyState } from '../../../components/PageBits';
import { percent, str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function ClassTeachingReport({ value }: { value: Row }) {
  const classes = Array.isArray(value.classes) ? value.classes as Row[] : [];
  const comparisons = Array.isArray(value.comparisons) ? value.comparisons as Row[] : [];
  const observations = Array.isArray(value.common_observations) ? value.common_observations as Row[] : [];
  const mappings = value.source_mappings && typeof value.source_mappings === 'object' ? value.source_mappings as Row : {};
  const ratio = (raw: unknown) => typeof raw === 'number' ? percent(raw) : '不可比较';
  return <div className={styles.reportStack}>
    <div className={styles.statStrip}><span><Users size={16}/><b>{classes.length}</b> 个班级</span><span><Target size={16}/><b>{comparisons.filter(row => row.status === 'available').length}</b> 项有共同题目比较</span><span><Layers3 size={16}/><b>{observations.length}</b> 项跨班共性观察</span><span>节点 {str(value.node_id)} · {value.status === 'ready' ? '报告就绪' : '数据不完整'}</span></div>
    <section className={styles.reportSection}>
      <div className={styles.reportSectionHeading}><div><h3>共同题目班级对照</h3><p>只比较各班都作答的题目；得分率不代表单题正确率或班级整体能力。</p></div></div>
      {comparisons.length ? <div className={styles.classComparisonList}>{comparisons.map((comparison, index) => {
        const classRows = Array.isArray(comparison.classes) ? comparison.classes as Row[] : [];
        const available = comparison.status === 'available';
        const materialIds = Array.isArray(comparison.common_material_ids) ? comparison.common_material_ids.map(String) : [];
        return <article className={styles.classComparisonCard} key={String(comparison.indicator_id ?? index)}>
          <header className={styles.classComparisonHeader}>
            <div><b>{str(comparison.indicator_id, '观察指标未命名')}</b><span>{available ? `${materialIds.length} 道共同题目` : '当前不可比较'}</span></div>
            <strong className={available ? styles.classComparisonDelta : styles.classComparisonUnavailable}>{typeof comparison.difference === 'number' ? `相差 ${(comparison.difference * 100).toFixed(1)} 个百分点` : '没有可用差异值'}</strong>
          </header>
          {available ? <>
            {materialIds.length > 0 && <div className={styles.commonMaterialTags} aria-label="共同题目">{materialIds.map(id => <span key={id}>{id}</span>)}</div>}
            <div className={styles.classComparisonRows}>{classRows.map((row, rowIndex) => {
              const rawRatio = typeof row.common_ratio === 'number' ? row.common_ratio : null;
              const safeRatio = rawRatio == null ? 0 : Math.max(0, Math.min(1, rawRatio));
              return <div className={styles.classComparisonRow} key={String(row.class_id ?? rowIndex)}>
                <div className={styles.classComparisonLabel}><b>{str(row.class_id, '未命名班级')}</b><span>{str(row.observed_student_count, '0')} 人 · {str(row.common_record_count, '0')} 条有效记录</span></div>
                <div className={styles.classComparisonTrack} role="img" aria-label={`${str(row.class_id)}共同题目得分率 ${ratio(rawRatio)}`}><span style={{ width: `${safeRatio * 100}%` }}/></div>
                <strong>{ratio(rawRatio)}</strong>
              </div>;
            })}</div>
          </> : <EmptyState title="共同题目不足，暂不可比" detail="补充各班都作答的观察题目后，才能计算同口径结果。"/>}
        </article>;
      })}</div> : <EmptyState title="没有班级比较数据" detail="当前节点没有可展示的指标比较。"/>}
    </section>
    <div className={styles.twoColumns}>
      <section className={styles.reportSection}><h3>已核验共性观察</h3>{observations.length ? <div className={styles.reportCards}>{observations.map((item, index) => <article key={String(item.issue_id ?? index)}><b>{str(item.label, str(item.indicator_id, '共性观察'))}</b><p>{str(item.indicator_id)}</p><small>{Array.isArray(item.by_class) ? (item.by_class as Row[]).filter(row => Number(row.affected_count) > 0).map(row => `${str(row.class_id)}：${str(row.affected_count)} / ${str(row.observed_student_count)} 人`).join('；') : '没有班级明细'}</small></article>)}</div> : <EmptyState title="暂无跨班共性观察" detail="需要多个班级均出现有已核验评分点证据支持的问题；缺少证据时不会推断。"/>}</section>
      <section className={styles.reportSection}><h3>课程来源映射状态</h3>{Object.keys(mappings).length ? <DataTable columns={[{ key: 'indicator', title: '观察指标' }, { key: 'status', title: '状态', render: row => row.status === 'verified' ? '已核验' : row.status === 'not_generated' ? '尚未生成' : str(row.status) }, { key: 'usable_count', title: '可用映射' }, { key: 'needs_resolution_count', title: '待处理' }]} rows={Object.entries(mappings).map(([indicator, summary]) => ({ indicator, ...(summary as Row) }))}/> : <EmptyState title="没有来源映射摘要" detail="当前报告未返回课程映射状态。"/>}</section>
    </div>
    {Array.isArray(value.limitations) && value.limitations.map((limitation, index) => <p className={styles.limitation} key={index}><CircleHelp size={14}/>{String(limitation)}</p>)}
  </div>;
}
