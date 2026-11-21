import { useEffect, useState } from 'react';
import { learningApi } from '../../../api/client';
import type { AnalysisRun, EvidenceBundle, EvidenceReference, Review, TeacherCase, TeacherCasePayload } from '../../../api/types';
import { Panel } from '../../../components/Panel';

export function TeacherCaseEditor({ run, reviews, initialStudentId, onSaved, onDirtyChange, onBeforeScopeChange }: {
  run: AnalysisRun;
  reviews: Record<string, Review[]>;
  initialStudentId?: string;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBeforeScopeChange?: () => boolean;
}) {
  const [student, setStudent] = useState(() => run.students.some(item => item['学生编号'] === initialStudentId) ? initialStudentId! : run.students[0]?.['学生编号'] ?? '');
  const [indicator, setIndicator] = useState(run.objectives[0]?.['指标编号'] ?? '');
  const [node, setNode] = useState(run.nodes[0]?.['节点编号'] ?? '');
  const [coverage, setCoverage] = useState<EvidenceBundle | null>(null);
  const [history, setHistory] = useState<Record<string, TeacherCase[]>>({});
  const [needType, setNeedType] = useState<TeacherCasePayload['need_type']>(null);
  const [selectionReason, setSelectionReason] = useState('');
  const [narrative, setNarrative] = useState('');
  const [limitations, setLimitations] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [evidenceQuery, setEvidenceQuery] = useState('');
  const [reviewRefs, setReviewRefs] = useState<TeacherCasePayload['review_refs']>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (initialStudentId && initialStudentId !== student && run.students.some(item => item['学生编号'] === initialStudentId)) {
      setStudent(initialStudentId);
      setEvidenceQuery('');
      setReviewRefs([]);
      setMessage('');
    }
  }, [initialStudentId, run.run_id, student]);
  useEffect(() => {
    setCoverage(null);
    if (!student || !indicator || !node) return;
    let alive = true;
    learningApi.evidenceBundle(student, indicator, node).then(value => { if (alive) { setCoverage(value); if (value.coverage.scored_record_count === 0) setEvidenceIds([]); else { const available = new Set(value.responses.filter(row => row.disposition === 'scored').map(row => row.record_id)); setEvidenceIds(current => current.filter(id => available.has(id))); } } }).catch(() => { if (alive) setCoverage(null); });
    return () => { alive = false; };
  }, [run.run_id, student, indicator, node]);
  useEffect(() => {
    let alive = true;
    learningApi.teacherCases().then(value => { if (alive) setHistory(value); }).catch(error => { if (alive) setMessage(error instanceof Error ? error.message : String(error)); });
    return () => { alive = false; };
  }, [run.run_id]);
  const latest = history[student]?.at(-1);
  useEffect(() => {
    setNeedType(latest?.need_type ?? null); setSelectionReason(latest?.selection_reason ?? '');
    setNarrative(latest?.narrative ?? ''); setLimitations(latest?.limitations ?? ''); setReviewer(latest?.reviewer ?? '');
    setEvidenceIds(latest?.evidence_record_ids ?? []); setReviewRefs(latest?.review_refs ?? []);
  }, [student, latest]);
  const activeRunIds = new Set(run.responses.filter(row => row['学生编号'] === student).map(row => row['记录编号']));
  const records = (coverage?.responses ?? []).filter(row => activeRunIds.has(row.record_id ?? '')).map(row => ({
    '记录编号': row.record_id ?? '',
    '节点编号': row.node_id,
    '材料编号': row.material_id,
    '学生最终作答': row.raw_response,
    '解答过程': row.solution_steps,
    '得分': row.score ?? '',
    '满分': row.maximum ?? '',
    '评分状态': row.state,
    _source_line: row.source_line ?? undefined,
  }));
  const visibleRecords = records.filter(row => !evidenceQuery.trim() || Object.values(row).join(' ').toLocaleLowerCase().includes(evidenceQuery.trim().toLocaleLowerCase()));
  const coverageRef: EvidenceReference | null = coverage && coverage.coverage.scored_record_count === 0 ? { kind: 'coverage', evidence_id: coverage.coverage.evidence_id, scope: coverage.scope } : null;
  const availableReviews = Object.entries(reviews).filter(([key]) => key === `${student}:${indicator}`).flatMap(([key, items]) => items.filter(item => ['accepted', 'edited'].includes(item.status)).map(item => ({ indicator_id: key.split(':')[1], node_id: item.node_id ?? item.original_draft?.node_id ?? '', version: item.version, evidence_record_ids: item.evidence_record_ids, evidence_refs: item.evidence_refs ?? [] })) ).filter(item => item.node_id === node && (!coverageRef || item.evidence_refs.some(ref => ref.kind === 'coverage' && ref.evidence_id === coverageRef.evidence_id)));
  const save = async (status: TeacherCasePayload['status']) => {
    if (saving) return;
    if (status === 'confirmed' && (!needType || !selectionReason.trim())) { setMessage('正式案例必须选择需求类型并填写独立于算法候选的正式选择理由。'); return; }
    setSaving(true); setMessage('');
    try {
      const responseRefs: EvidenceReference[] = coverageRef ? [coverageRef] : (coverage?.responses ?? []).filter(row => evidenceIds.includes(row.record_id ?? '') && activeRunIds.has(row.record_id ?? '')).map(row => ({ kind: 'response', evidence_id: row.evidence_id, record_id: row.record_id, source_line: row.source_line, scope: coverage!.scope }));
      const result = await learningApi.saveTeacherCase({ student_id: student, status, need_type: needType, selection_reason: selectionReason, narrative, limitations, evidence_record_ids: evidenceIds, evidence_refs: responseRefs, review_refs: reviewRefs, reviewer });
      setHistory(old => ({ ...old, [student]: [...(old[student] ?? []), result] }));
      onSaved();
      onDirtyChange?.(false);
      setMessage(`已保存案例版本 ${result.version} · ${status === 'confirmed' ? '教师已确认' : status === 'draft' ? '待确认' : '已驳回'}。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };
  return <div onChangeCapture={event => { if (event.target instanceof HTMLSelectElement && event.target.dataset.scopeSelector === 'true' && onBeforeScopeChange && !onBeforeScopeChange()) { event.preventDefault(); event.stopPropagation(); } }} onChange={event => { if (!(event.target instanceof HTMLInputElement && event.target.getAttribute('aria-label') === '筛选原始作答证据') && !(event.target instanceof HTMLSelectElement && event.target.dataset.scopeSelector === 'true')) onDirtyChange?.(true); }}><Panel id="teacher-cases" title="教师案例确认" className="case-editor"><p className="muted">算法仅提供候选和线索。正式案例由教师独立选择需求类型与理由，并核对当前证据、复核版本和样本限制。</p>
    <div className="scope-fields"><label>案例学生<select data-scope-selector="true" value={student} onChange={event => { if (onBeforeScopeChange && !onBeforeScopeChange()) return; onDirtyChange?.(false); setStudent(event.target.value); setMessage(''); setReviewRefs([]); }}>{run.students.map(item => <option key={item['学生编号']} value={item['学生编号']}>{item['学生编号']} · {item['模拟班级编号']}</option>)}</select></label><label>覆盖指标<select data-scope-selector="true" value={indicator} onChange={event => { if (onBeforeScopeChange && !onBeforeScopeChange()) return; onDirtyChange?.(false); setIndicator(event.target.value); setReviewRefs([]); }}>{run.objectives.map(item => <option key={item['指标编号']} value={item['指标编号']}>{item['指标编号']} · {item['观察指标']}</option>)}</select></label><label>覆盖节点<select data-scope-selector="true" value={node} onChange={event => { if (onBeforeScopeChange && !onBeforeScopeChange()) return; onDirtyChange?.(false); setNode(event.target.value); setReviewRefs([]); }}>{run.nodes.map(item => <option key={item['节点编号']} value={item['节点编号']}>{item['节点编号']}</option>)}</select></label></div>
    {coverageRef && <p className="context-limit">覆盖状态：节点 {node} 共 {coverage?.coverage.expected_material_ids.length ?? 0} 道应测题，当前范围没有有效已评分记录（原始记录 {coverage?.coverage.record_count ?? 0} 条）。确认案例时会附带此范围的服务端校验覆盖引用。</p>}
    <p>最新版本：{latest ? `${latest.version} · ${latest.status} · ${latest.reviewer || '未署名'}` : '尚无案例记录'}</p>
    <details className="editor-disclosure"><summary>{latest ? '更新案例签核' : '开始案例签核'}</summary><label>正式案例需求类型<select value={needType ?? ''} onChange={event => setNeedType((event.target.value || null) as TeacherCasePayload['need_type'])}><option value="">选择需求类型</option><option value="部分得分">部分得分与过程核对</option><option value="表现较好">表现较好与策略迁移</option><option value="记录较少">记录较少与补充观察</option><option value="无记录观察">无有效评分记录的观察</option><option value="自定义">其他需求（请在理由中说明）</option></select></label><label>正式选择理由<textarea value={selectionReason} onChange={event => setSelectionReason(event.target.value)} placeholder="说明为什么将该学生选为正式案例、教师判断依据和它与算法候选的关系" /></label><label>案例叙述<textarea value={narrative} onChange={event => setNarrative(event.target.value)} placeholder="描述该节点的实际作答、教师解释与教学处理" /></label>
    <label>样本限制与不能推断的结论<textarea value={limitations} onChange={event => setLimitations(event.target.value)} placeholder="说明节点、题目样本与班级覆盖限制" /></label>
    <label>确认教师<input value={reviewer} onChange={event => setReviewer(event.target.value)} /></label>
    <details><summary>选择原始作答证据（已选 {evidenceIds.length} 条 / 共 {records.length} 条）</summary>{coverageRef ? <p className="muted">当前选择的是覆盖证据分支，不附加其他节点或指标的作答记录。</p> : <>
      {records.length > 8 && <label>筛选作答记录<input aria-label="筛选原始作答证据" type="search" value={evidenceQuery} onChange={event => setEvidenceQuery(event.target.value)} placeholder="输入记录、节点、题目编号或作答内容" /></label>}
      {visibleRecords.length ? visibleRecords.map(row => <label className="check-row" key={`${row['记录编号']}:${row._source_line}`}><input type="checkbox" checked={evidenceIds.includes(row['记录编号'])} onChange={event => setEvidenceIds(old => event.target.checked ? [...old, row['记录编号']] : old.filter(id => id !== row['记录编号']))} />{row['记录编号']} · 节点 {row['节点编号']} · {row['材料编号']} · 作答记录.csv 第 {row._source_line} 行</label>) : <p className="muted" role="status">没有匹配的作答记录；已选证据仍会保留。</p>}
      <p className="muted" role="status">正在显示 {visibleRecords.length} / {records.length} 条；筛选不会取消已勾选的证据。</p>
    </>}</details>
    <details><summary>关联教师复核版本（{reviewRefs.length}）</summary>{availableReviews.length ? availableReviews.map(ref => { const checked = reviewRefs.some(item => item.indicator_id === ref.indicator_id && item.node_id === ref.node_id && item.version === ref.version); return <label className="check-row" key={`${ref.indicator_id}:${ref.node_id}:${ref.version}`}><input type="checkbox" checked={checked} onChange={event => setReviewRefs(old => event.target.checked ? [...old, { indicator_id: ref.indicator_id, node_id: ref.node_id, version: ref.version }] : old.filter(item => item.indicator_id !== ref.indicator_id || item.node_id !== ref.node_id || item.version !== ref.version))} />{ref.indicator_id} · 节点 {ref.node_id} · 版本 {ref.version} · {coverageRef ? '覆盖记录' : `证据 ${ref.evidence_record_ids.join('、')}`}</label>; }) : <p>{coverageRef ? '当前范围尚无引用此覆盖证据的已接受诊断方案；请先在教学复核中保存正式诊断计划。' : '暂无已接受或修改的教师复核；请先完成建议复核。'}</p>}</details>
    <div className="actions"><button disabled={saving || !needType || !selectionReason.trim()} onClick={() => void save('confirmed')}>确认正式案例</button><button className="secondary" disabled={saving} onClick={() => void save('draft')}>保存案例草稿</button><button className="secondary" disabled={saving} onClick={() => void save('rejected')}>驳回案例</button></div>
    {message && <p role="status">{message}</p>}
    </details>
    {history[student]?.length ? <details><summary>案例版本历史（{history[student].length}）</summary>{history[student].map(item => <p key={item.version}>版本 {item.version} · {item.status} · {item.reviewed_at} · {item.narrative} · 限制：{item.limitations}</p>)}</details> : null}
  </Panel></div>;
}
