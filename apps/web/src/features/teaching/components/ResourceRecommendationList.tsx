import { BadgeCheck, BookOpen, ShieldQuestion } from 'lucide-react';
import { Notice } from '../../../components/PageBits';
import type { ResourceSelection, ResourceSelectionEntry } from '../types';
import styles from '../pages/StudentTeachingPage.module.css';

const BLOCK_REASONS: Record<string, string> = {
  no_verified_node_practice: '当前节点没有已核验的练习题，因此只能展示可用学习材料，不能生成完整方案。',
  no_verified_candidate: '当前范围内没有已核验的候选材料；请先完成来源核验。',
  node_scope_required: '尚未选择单一测验节点。',
};

function EntryCard({ entry }: { entry: ResourceSelectionEntry }) {
  const reasons = entry.reason_details.length
    ? entry.reason_details.map(detail => detail.description || detail.code)
    : [entry.reason];
  return <article className={styles.resourceCard}>
    <div className={styles.resourceCardHeader}>
      <span className={styles.resourceId}>{entry.material_id}</span>
      <span className={styles.resourceType}>{entry.resource_type || '材料'}</span>
      {entry.source_verified
        ? <span className={styles.verifiedBadge}><BadgeCheck size={12}/>已核验 · 正式</span>
        : <span className={styles.unverifiedBadge}><ShieldQuestion size={12}/>待核验 · 候选</span>}
    </div>
    {entry.title && <p className={styles.resourceTitle}>{entry.title}</p>}
    <p className={styles.resourceLocator}>
      {entry.source_file ? `来源：${entry.source_file}` : '来源文件：导入数据未记录'}
      {entry.locator ? ` · 定位：${entry.locator}` : ''}
      {entry.indicator_id ? ` · 指标 ${entry.indicator_id}` : ''}
      {entry.node_ids?.length ? ` · 节点 ${entry.node_ids.join('、')}` : ''}
    </p>
    <ul className={styles.reasonList}>{reasons.filter(Boolean).map((reason, index) => <li key={index}>{reason}</li>)}</ul>
  </article>;
}

/**
 * 推荐材料与练习：只展示后端选择结果、理由和来源定位。
 * 正式材料与待核验候选材料在视觉上分开；没有练习题时明确说明"只能展示材料"。
 */
export function ResourceRecommendationList({ selection, showStatus = true }: { selection?: ResourceSelection | null; showStatus?: boolean }) {
  if (!selection) return <Notice>资源选择结果尚未返回，暂不展示推荐材料。</Notice>;
  const reason = selection.reason_codes.map(code => BLOCK_REASONS[code]).filter(Boolean);
  const noPractice = selection.reason_codes.includes('no_verified_node_practice');
  return <div className={styles.resourcePanel}>
    {showStatus && selection.status === 'blocked' && <Notice tone="warning">
      {reason.length ? reason.join(' ') : '当前没有可生成完整方案的材料组合。'}
      {noPractice && selection.learning_resources.length ? ' 下面列出的学习材料仍可作为教师备课参考。' : ''}
    </Notice>}
    <div className={styles.resourceGrid}>
      <section className={styles.resourceGroup} aria-label="推荐学习材料">
        <div className={styles.resourceGroupHead}><BookOpen size={15}/>推荐学习材料</div>
        {selection.learning_resources.length
          ? <div className={styles.resourceGroupList}>
            {selection.learning_resources.map(entry => <EntryCard key={entry.material_id} entry={entry}/>)}
          </div>
          : <p className={styles.resourceEmpty}>当前范围没有通过来源核验的学习材料。</p>}
      </section>
      <section className={styles.resourceGroup} aria-label="推荐练习">
        <div className={styles.resourceGroupHead}><BookOpen size={15}/>推荐练习</div>
        {selection.practice_items.length
          ? <div className={styles.resourceGroupList}>
            {selection.practice_items.map(entry => <EntryCard key={entry.material_id} entry={entry}/>)}
          </div>
          : <p className={styles.resourceEmpty}>当前节点没有已核验的练习题；方案不会以空练习生成。</p>}
      </section>
    </div>
    {selection.excluded.length > 0 && <details className={styles.excludedList}>
      <summary>排除的候选材料（{selection.excluded.length} 项）</summary>
      <ul>{selection.excluded.map(item => <li key={item.material_id}><b>{item.material_id}</b>：{item.reason}</li>)}</ul>
    </details>}
  </div>;
}
