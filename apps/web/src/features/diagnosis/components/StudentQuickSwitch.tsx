import { FileSearch, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { routes } from '../../../app/routes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function StudentQuickSwitch({ students, classId, selectedStudent, search, onSearch, onSelect, showCurrent = false, showActions = true }: { students: Row[]; classId: string; selectedStudent: string; search: string; onSearch: (value: string) => void; onSelect: (value: string) => void; showCurrent?: boolean; showActions?: boolean }) {
  const classmates = students.filter(row => String(row['模拟班级编号'] ?? '') === classId && String(row['学生编号'] ?? '') !== selectedStudent);
  const matches = search.trim() ? students.filter(row => String(row['学生编号'] ?? '').toLowerCase().includes(search.trim().toLowerCase())) : [];
  return <section className={styles.studentQuickRow} aria-label="学生快速切换"><div className={styles.studentQuickGroup}><span>选择学生</span>{showCurrent && <b className={styles.studentCurrentChip} aria-current="true">{selectedStudent} · 当前学生</b>}{classmates.slice(0, 3).map(row => { const id = String(row['学生编号'] ?? ''); return <button key={id} type="button" onClick={() => onSelect(id)}>{id}</button>; })}{!classmates.length && <small>当前班级暂无其他学生</small>}</div><label className={styles.studentSearch}>查找学生<input value={search} onChange={event => onSearch(event.target.value)} placeholder="输入学号"/></label>{matches.length > 0 && <div className={styles.studentSearchResults}>{matches.slice(0, 5).map(row => { const id = String(row['学生编号'] ?? ''); return <button key={id} type="button" onClick={() => { onSelect(id); onSearch(''); }}>{id} · {String(row['模拟班级编号'] ?? '未分班')}</button>; })}</div>}{showActions && <div className={styles.studentQuickActions}><Link to={{ pathname: routes.itemEvidence, search: new URLSearchParams({ student: selectedStudent, class: classId }).toString() }}><FileSearch size={14}/>完整证据</Link><Link to={{ pathname: routes.studentTeaching, search: new URLSearchParams({ student: selectedStudent, class: classId }).toString() }}><Sparkles size={14}/>个性化建议</Link></div>}</section>;
}
