import { AutoResizeTextarea } from '../../../components/AutoResizeTextarea';
import type { ClassPlanSection } from './ClassPlanReader';
import styles from '../../shared/WorkbenchPages.module.css';

export function ClassPlanEditor({ sections, onChange, resizeKey }: {
  sections: ClassPlanSection[];
  onChange: (key: string, value: string) => void;
  resizeKey: string | number;
}) {
  const requiredKeys = new Set(['teaching_objectives', 'key_problems', 'teaching_actions', 'observation_points', 'adjustment_conditions']);
  return <div className={styles.classPlanEditor} data-testid="class-plan-editor">
    {sections.map(section => {
      const required = requiredKeys.has(section.key);
      return <label key={section.key} data-required={required} data-section={section.key}>
        <span className={styles.classPlanEditorLabel}>{section.label}<small>{required ? '必填' : '选填'}</small></span>
        {section.hint && <small className={styles.classPlanEditorHint}>{section.hint}</small>}
        <AutoResizeTextarea aria-label={section.label} value={section.value} placeholder={section.hint ?? `填写${section.label}`} resizeKey={resizeKey} onChange={event => onChange(section.key, event.target.value)}/>
      </label>;
    })}
  </div>;
}
