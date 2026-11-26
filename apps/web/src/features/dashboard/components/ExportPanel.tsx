import { useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../../../api/client';
import { EmptyState, Panel } from '../../../components/PageBits';
import styles from '../DashboardPage.module.css';

export function ExportPanel({ runId, classId, students }: { runId: string; classId: string; students: string[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const toggle = (studentId: string) => setSelected(current => current.includes(studentId) ? current.filter(id => id !== studentId) : current.length < 3 ? [...current, studentId] : current);
  const download = async () => {
    setPending(true); setMessage(''); setError('');
    try {
      const archive = await api<Blob>(`/api/export?${new URLSearchParams({ cases: selected.join(',') }).toString()}`);
      const url = URL.createObjectURL(archive);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `智慧学伴案例资料包-${classId}-${runId.slice(0, 8)}.zip`;
      document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setMessage('案例资料包已生成并开始下载。');
    } catch (cause) { setError((cause as Error).message); }
    finally { setPending(false); }
  };
  return <Panel title="案例资料包导出" icon={<Download size={19}/>} className={styles.exportPanel}>
    <p className={styles.exportHint}>选择当前班级中的 3 名学生，导出包含相关学习记录、复核和证据索引的 ZIP。该资料包不代表赛事发布审核已通过。</p>
    {students.length ? <div className={styles.exportStudents}>{students.map(studentId => <label key={studentId}><input type="checkbox" checked={selected.includes(studentId)} disabled={!selected.includes(studentId) && selected.length >= 3} onChange={() => toggle(studentId)}/><span>{studentId}</span></label>)}</div> : <EmptyState title="当前班级没有学生" detail="选择包含学生的班级后可导出案例资料包。"/>}
    <div className={styles.exportActions}><span>已选 {selected.length} / 3</span><button className={styles.primaryButton} disabled={selected.length !== 3 || pending} onClick={() => void download()}><Download size={15}/>{pending ? '正在打包…' : '导出所选案例'}</button></div>
    {message && <p className={styles.exportSuccess} role="status">{message}</p>}{error && <p className={styles.exportError} role="alert">{error}</p>}
  </Panel>;
}
