import { AutoResizeTextarea } from '../../../components/AutoResizeTextarea';
import type { ClassPlanSection } from './ClassPlanReader';
import styles from '../../shared/WorkbenchPages.module.css';

export function ClassPlanEditor({ sections, onChange, resizeKey }: {
  sections: ClassPlanSection[];
  onChange: (key: string, value: string) => void;
  resizeKey: string | number;
}) {
  return <div className={styles.classPlanEditor} data-testid="class-plan-editor">
    {sections.map(section => <label key={section.key}>
      {section.label}
      <AutoResizeTextarea value={section.value} placeholder="当前方案未提供此部分" resizeKey={resizeKey} onChange={event => onChange(section.key, event.target.value)}/>
    </label>)}
  </div>;
}
