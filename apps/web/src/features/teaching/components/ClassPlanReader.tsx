import type { ReactNode } from 'react';
import styles from '../../shared/WorkbenchPages.module.css';

export type ClassPlanSection = { key: string; label: string; value: string };

export function ClassPlanReader({ sections, status }: { sections: ClassPlanSection[]; status?: ReactNode }) {
  return <div className={styles.classPlanReader} data-testid="class-plan-reader">
    {status && <div className={styles.classPlanStatus}>{status}</div>}
    <div className={styles.classPlanReadingGrid}>
      {sections.map(section => <article key={section.key}>
        <h3>{section.label}</h3>
        {section.value.trim() ? <p>{section.value}</p> : <p className={styles.classPlanMissing}>当前方案未提供此部分。</p>}
      </article>)}
    </div>
  </div>;
}
