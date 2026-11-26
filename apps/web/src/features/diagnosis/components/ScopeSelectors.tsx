import type { RunData } from '../../../types/api';
import styles from '../../shared/WorkbenchPages.module.css';

/**
 * 学生 / 观察指标范围选择器。
 * 学生个人诊断和题目证据页显示学生下拉；个性化建议页只保留指标下拉，避免与页面内的学生快捷切换重复。
 */
export function ScopeSelectors({ run, selectedStudent, selectedIndicator, objectiveName, onStudent, onIndicator, showStudent = false }: {
  run: RunData;
  selectedStudent: string;
  selectedIndicator: string;
  objectiveName: (id: string) => string;
  onStudent: (value: string) => void;
  onIndicator: (value: string) => void;
  showStudent?: boolean;
}) {
  return <div className={styles.selectControls}>
    {showStudent && <label>学生<select aria-label="学生" value={selectedStudent} onChange={event => onStudent(event.target.value)}>{run.students.map((row, index) => <option key={String(row['学生编号'] ?? index)} value={String(row['学生编号'] ?? '')}>{String(row['学生编号'] ?? '未知学生')} · {String(row['模拟班级编号'] ?? '未分班')}</option>)}</select></label>}
    <label>观察指标<select aria-label="观察指标" value={selectedIndicator} onChange={event => onIndicator(event.target.value)}>{run.objectives.map((row, index) => <option key={String(row['指标编号'] ?? index)} value={String(row['指标编号'] ?? '')}>{objectiveName(String(row['指标编号'] ?? ''))}</option>)}</select></label>
  </div>;
}
