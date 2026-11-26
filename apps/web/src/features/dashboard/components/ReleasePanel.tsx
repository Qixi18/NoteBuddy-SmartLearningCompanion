import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Download } from 'lucide-react';
import { api, postJson } from '../../../api/client';
import { EmptyState, ErrorBox, Loading, Notice, Panel } from '../../../components/PageBits';
import styles from '../DashboardPage.module.css';

export function ReleasePanel({ runId, nodeId, students }: { runId: string; nodeId: string; students: string[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewer, setReviewer] = useState('');
  const [contentReviewed, setContentReviewed] = useState(false);
  const [preparedKey, setPreparedKey] = useState('');
  const [preparedBaseKey, setPreparedBaseKey] = useState('');
  const [downloadMessage, setDownloadMessage] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const histories = useQuery({ queryKey: ['teacher-cases', runId], queryFn: () => api<Record<string, Array<Record<string, unknown>>>>('/api/teacher-cases') });
  const confirmedStudents = students.filter(studentId => {
    const latest = histories.data?.[studentId]?.at(-1);
    return latest?.status === 'confirmed' && latest.run_id === runId;
  });
  const preflight = useMutation({
    mutationFn: (input: { ids: string[]; reviewer: string; contentReviewed: boolean }) => {
      const query = new URLSearchParams({ node: nodeId, reviewer: input.reviewer, content_reviewed: String(input.contentReviewed) });
      input.ids.forEach(id => query.append('case_ids', id));
      return api<Record<string, unknown>>(`/api/release-checks?${query.toString()}`);
    },
    onSuccess: (_data, input) => {
      setDownloadMessage('');
      setPreparedBaseKey(JSON.stringify([runId, nodeId, [...input.ids].sort(), input.reviewer.trim()]));
      setPreparedKey(JSON.stringify([runId, nodeId, [...input.ids].sort(), input.reviewer.trim(), input.contentReviewed]));
    },
  });
  const baseKey = JSON.stringify([runId, nodeId, [...selected].sort(), reviewer.trim()]);
  const selectionKey = JSON.stringify([runId, nodeId, [...selected].sort(), reviewer.trim(), contentReviewed]);
  const preflightMatchesSelection = preparedBaseKey === baseKey;
  const checks = Array.isArray(preflight.data?.checks) ? preflight.data.checks as Array<Record<string, unknown>> : [];
  const blockers = checks.some(check => check.status === 'blocked');
  const reports = preflight.data?.reports && typeof preflight.data.reports === 'object' ? preflight.data.reports as Record<string, unknown> : {};
  const caseReport = reports.cases && typeof reports.cases === 'object' ? reports.cases as Record<string, unknown> : {};
  const classReport = reports.class && typeof reports.class === 'object' ? reports.class as Record<string, unknown> : {};
  const canExport = selected.length === 3 && reviewer.trim() && contentReviewed && preparedKey === selectionKey && !blockers && typeof preflight.data?.fingerprint === 'string';
  const toggle = (studentId: string) => { setContentReviewed(false); setSelected(current => current.includes(studentId) ? current.filter(id => id !== studentId) : current.length < 3 ? [...current, studentId] : current); };
  const changeReviewer = (value: string) => { setContentReviewed(false); setReviewer(value); };
  const download = async () => {
    if (!canExport) return;
    setDownloadError(''); setDownloadMessage('');
    try {
      const archive = await api<Blob>('/api/export-submission', postJson({ run_id: runId, case_ids: selected, node_id: nodeId, preflight_fingerprint: preflight.data?.fingerprint, reviewer: reviewer.trim(), content_reviewed: true }));
      const url = URL.createObjectURL(archive);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `智慧学伴赛事材料-${runId.slice(0, 8)}-${nodeId}.zip`;
      document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadMessage('赛事材料包已生成并开始下载。');
    } catch (cause) { setDownloadError((cause as Error).message); }
  };
  return <Panel title="赛事发布预检与材料导出" icon={<ClipboardCheck size={19}/>} className={styles.releasePanel}>
    <p className={styles.exportHint}>从当前运行中选择 3 名已确认案例的学生。预检会重算教师复核、来源签核和案例报告；报告内容经人工确认后才可导出正式材料包。</p>
    {histories.isPending ? <Loading label="读取已确认案例…"/> : histories.isError ? <ErrorBox message={(histories.error as Error).message}/> : confirmedStudents.length ? <div className={styles.exportStudents}>{confirmedStudents.map(studentId => <label key={studentId}><input type="checkbox" checked={selected.includes(studentId)} disabled={!selected.includes(studentId) && selected.length >= 3} onChange={() => toggle(studentId)}/><span>{studentId}</span></label>)}</div> : <EmptyState title="尚无已确认案例" detail="请在学生教学建议页完成教师复核和案例确认后，再进行赛事发布预检。"/>}
    <div className={styles.releaseFields}><label>内容负责人<input value={reviewer} onChange={event => changeReviewer(event.target.value)} maxLength={200} placeholder="填写人工审阅人姓名"/></label><label className={styles.releaseConsent}><input type="checkbox" checked={contentReviewed} disabled={!preflightMatchesSelection} onChange={event => { setContentReviewed(event.target.checked); setPreparedKey(''); }}/><span>先查看下方当前案例与班级报告，再完成内容重点风险人工复核。更改案例或姓名后需重新预检。</span></label></div>
    <div className={styles.exportActions}><span>已选 {selected.length} / 3 · 节点 {nodeId}</span><button className={styles.secondaryButton} disabled={selected.length !== 3 || preflight.isPending || !reviewer.trim()} onClick={() => { setPreparedKey(''); setDownloadError(''); preflight.mutate({ ids: selected, reviewer: reviewer.trim(), contentReviewed }); }}><ClipboardCheck size={15}/>{preflight.isPending ? '正在预检…' : contentReviewed ? '按人工复核状态更新预检' : '运行预检 / 查看报告'}</button><button className={styles.primaryButton} disabled={!canExport} onClick={() => void download()}><Download size={15}/>导出赛事材料</button></div>
    {preflight.isSuccess && !preflightMatchesSelection && <Notice>选择或负责人已变化。请重新预检以查看当前范围的报告。</Notice>}
    {preflight.isSuccess && preflightMatchesSelection && <>
      <div className={styles.releaseReportSummary}><span>案例报告：{String(caseReport.status ?? '未知')} · {Array.isArray(caseReport.cases) ? caseReport.cases.length : 0} 份</span><span>班级报告：{String(classReport.status ?? '未知')} · 节点 {String(classReport.node_id ?? '—')}</span></div>
      <div className={styles.releaseChecks}>{checks.map((check, index) => <article key={`${String(check.id)}-${index}`}><b>{String(check.label ?? check.id)}</b><span className={check.status === 'passed' ? styles.checkPassed : check.status === 'blocked' ? styles.checkBlocked : styles.checkOpen}>{check.status === 'passed' ? '通过' : check.status === 'blocked' ? '阻断' : '待人工确认'}</span><p>{String(check.detail ?? '')}</p></article>)}</div>
      {Array.isArray(classReport.limitations) && classReport.limitations.length > 0 && <p className={styles.exportHint}>班级报告限制：{(classReport.limitations as unknown[]).map(String).join('；')}</p>}
      {blockers && <Notice tone="warning">当前存在阻断项。请按上方检查结果补齐案例、复核、来源或报告后，重新运行预检。</Notice>}
      {!blockers && checks.some(check => check.status === 'not_checked') && <Notice tone="warning">机器阻断项已清除，但仍有开放的人工验收项；导出包会保留该状态，不能视为赛事最终验收通过。</Notice>}
    </>}
    {preflight.isError && <ErrorBox message={(preflight.error as Error).message}/>}{downloadMessage && <p className={styles.exportSuccess} role="status">{downloadMessage}</p>}{downloadError && <p className={styles.exportError} role="alert">{downloadError}</p>}
  </Panel>;
}
