import type { ReactNode } from 'react';
import styles from '../../shared/WorkbenchPages.module.css';

export type ClassPlanSection = { key: string; label: string; hint?: string; value: string };

export function ClassPlanReader({ sections, status }: { sections: ClassPlanSection[]; status?: ReactNode }) {
  return <div className={styles.classPlanReader} data-testid="class-plan-reader">
    {status && <div className={styles.classPlanStatus}>{status}</div>}
    <div className={styles.classPlanReadingGrid}>
      {sections.map(section => <article key={section.key} data-section={section.key} data-testid={`class-plan-section-${section.key.replaceAll('_', '-')}`} data-required={['teaching_objectives', 'key_problems', 'teaching_actions', 'observation_points', 'adjustment_conditions'].includes(section.key)}>
        <h3>{section.label}</h3>
        {section.value.trim() ? <ul>{section.value.split('\n').map((line, index) => line.trim() ? <li key={`${index}-${line}`}>{line}</li> : null)}</ul>
          : <p className={styles.classPlanMissing}>{section.key === 'differentiated_actions'
            ? '当前方案未包含额外分层行动。'
            : section.key === 'resource_recommendations'
              ? '当前方案未提供额外资源与题目建议。'
              : '必填内容缺失，当前方案不完整，请编辑补充后再提交审核。'}</p>}
      </article>)}
    </div>
  </div>;
}
