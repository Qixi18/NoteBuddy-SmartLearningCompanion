import { useEffect, useState } from 'react';
import { learningApi } from '../../../api/client';
import type { AnalysisRun, Review, TeacherCase, TeacherCasePayload } from '../../../api/types';
import { Panel } from '../../../components/Panel';

export function TeacherCaseEditor({ run, reviews }: { run: AnalysisRun; reviews: Record<string, Review[]> }) {
  const [student, setStudent] = useState(run.students[0]?.['学生编号'] ?? '');
  const [history, setHistory] = useState<Record<string, TeacherCase[]>>({});
  const [narrative, setNarrative] = useState('');
  const [limitations, setLimitations] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [reviewRefs, setReviewRefs] = useState<TeacherCasePayload['review_refs']>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    learningApi.teacherCases().then(value => { if (alive) setHistory(value); }).catch(error => { if (alive) setMessage(error instanceof Error ? error.message : String(error)); });
    return () => { alive = false; };
  }, [run.run_id]);
  const latest = history[student]?.at(-1);
  useEffect(() => {
    setNarrative(latest?.narrative ?? ''); setLimitations(latest?.limitations ?? ''); setReviewer(latest?.reviewer ?? '');
    setEvidenceIds(latest?.evidence_record_ids ?? []); setReviewRefs(latest?.review_refs ?? []);
  }, [student, latest]);
  const records = run.responses.filter(row => row['学生编号'] === student);
  const availableReviews = Object.entries(reviews).filter(([key]) => key.startsWith(`${student}:`)).flatMap(([key, items]) => items.filter(item => ['accepted', 'edited'].includes(item.status)).map(item => ({ indicator_id: key.split(':')[1], node_id: item.node_id ?? item.original_draft?.node_id ?? '', version: item.version, evidence_record_ids: item.evidence_record_ids })) ).filter(item => item.node_id);
  const save = async (status: TeacherCasePayload['status']) => {
    if (saving) return;
    setSaving(true); setMessage('');
    try {
      const result = await learningApi.saveTeacherCase({ student_id: student, status, narrative, limitations, evidence_record_ids: evidenceIds, review_refs: reviewRefs, reviewer });
      setHistory(old => ({ ...old, [student]: [...(old[student] ?? []), result] }));
      setMessage(`已保存案例版本 ${result.version} · ${status === 'confirmed' ? '教师已确认' : status === 'draft' ? '待确认' : '已驳回'}。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };
  return <Panel title="教师案例确认"><p className="muted">候选只供筛选；正式案例须核对原始记录、复核版本并写明样本限制。</p>
    <label>案例学生<select value={student} onChange={event => { setStudent(event.target.value); setMessage(''); }}>{run.students.map(item => <option key={item['学生编号']} value={item['学生编号']}>{item['学生编号']} · {item['模拟班级编号']}</option>)}</select></label>
    <p>最新版本：{latest ? `${latest.version} · ${latest.status} · ${latest.reviewer || '未署名'}` : '尚无案例记录'}</p>
    <details className="editor-disclosure"><summary>{latest ? '更新案例签核' : '开始案例签核'}</summary><label>案例叙述<textarea value={narrative} onChange={event => setNarrative(event.target.value)} placeholder="描述该节点的实际作答、教师解释与教学处理" /></label>
    <label>样本限制与不能推断的结论<textarea value={limitations} onChange={event => setLimitations(event.target.value)} placeholder="说明节点、题目样本与班级覆盖限制" /></label>
    <label>确认教师<input value={reviewer} onChange={event => setReviewer(event.target.value)} /></label>
    <details><summary>选择原始作答证据（{evidenceIds.length}/{records.length}）</summary>{records.map(row => <label className="check-row" key={`${row['记录编号']}:${row._source_line}`}><input type="checkbox" checked={evidenceIds.includes(row['记录编号'])} onChange={event => setEvidenceIds(old => event.target.checked ? [...old, row['记录编号']] : old.filter(id => id !== row['记录编号']))} />{row['记录编号']} · 节点 {row['节点编号']} · {row['材料编号']} · 作答记录.csv 第 {row._source_line} 行</label>)}</details>
    <details><summary>关联教师复核版本（{reviewRefs.length}）</summary>{availableReviews.length ? availableReviews.map(ref => { const checked = reviewRefs.some(item => item.indicator_id === ref.indicator_id && item.node_id === ref.node_id && item.version === ref.version); return <label className="check-row" key={`${ref.indicator_id}:${ref.node_id}:${ref.version}`}><input type="checkbox" checked={checked} onChange={event => setReviewRefs(old => event.target.checked ? [...old, { indicator_id: ref.indicator_id, node_id: ref.node_id, version: ref.version }] : old.filter(item => item.indicator_id !== ref.indicator_id || item.node_id !== ref.node_id || item.version !== ref.version))} />{ref.indicator_id} · 节点 {ref.node_id} · 版本 {ref.version} · 证据 {ref.evidence_record_ids.join('、')}</label>; }) : <p>暂无已接受或修改的教师复核；请先完成建议复核。</p>}</details>
    <div className="actions"><button disabled={saving} onClick={() => void save('confirmed')}>确认正式案例</button><button className="secondary" disabled={saving} onClick={() => void save('draft')}>保存案例草稿</button><button className="secondary" disabled={saving} onClick={() => void save('rejected')}>驳回案例</button></div>
    {message && <p role="status">{message}</p>}
    </details>
    {history[student]?.length ? <details><summary>案例版本历史（{history[student].length}）</summary>{history[student].map(item => <p key={item.version}>版本 {item.version} · {item.status} · {item.reviewed_at} · {item.narrative} · 限制：{item.limitations}</p>)}</details> : null}
  </Panel>;
}
