import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisRun, IndicatorMaterialCatalog, SourceVerification } from '../../../api/types';
import { learningApi } from '../../../api/client';
import { Panel } from '../../../components/Panel';
import { SourceVerificationEditor } from './SourceVerificationEditor';
import { curriculumLocatorLabel } from '../../../app/glossary';

function verificationLabel(status?: string, stale = false) {
  if (stale) return '来源已变化，需重新核验';
  switch (status) {
    case 'verified': return '已核验';
    case 'topic_checked_indicator_page_pending': return '主题已定位，指标页待核验';
    case 'invalid': return '来源异常，需核查';
    default: return '待核验';
  }
}

function documentStatusLabel(status: string) {
  switch (status) {
    case 'missing': return '来源文件缺失';
    case 'unreadable': return 'PDF无法读取';
    case 'page_out_of_range': return '文件页码越界';
    case 'needs_manual_review': return '无文本层或扫描页，待人工核验';
    case 'page_valid_text': return '目标页含可读取文本';
    case 'locator_required': return '有文本层，需补充精确页码';
    default: return '待核验';
  }
}

export function ObjectivesPanel({ run, indicatorId, onIndicatorChange, onSaved, onDirtyChange }: { run: AnalysisRun; indicatorId?: string; onIndicatorChange?: (id: string) => void; onSaved?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const [localSelectedId, setLocalSelectedId] = useState(run.objectives[0]?.['指标编号'] ?? '');
  const selectedId = indicatorId ?? localSelectedId;
  const selectIndicator = (id: string) => {
    if (indicatorId === undefined) setLocalSelectedId(id);
    onIndicatorChange?.(id);
  };
  const [sourceHistory, setSourceHistory] = useState<Record<string, SourceVerification[]>>({});
  const [catalog, setCatalog] = useState<IndicatorMaterialCatalog[]>([]);
  const [sourceHistoryLoaded, setSourceHistoryLoaded] = useState(false);
  const [sourceHistoryFailed, setSourceHistoryFailed] = useState(false);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [expandedItemsFor, setExpandedItemsFor] = useState('');
  const [machineRunning, setMachineRunning] = useState(false);
  const [machineMessage, setMachineMessage] = useState('');
  const [machineRefreshToken, setMachineRefreshToken] = useState(0);
  const [candidates, setCandidates] = useState<Array<{ target_indicator_id: string; target_label: string; relation: string; evidence: string; rule: string }>>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [judgmentReviewer, setJudgmentReviewer] = useState('');
  const [judgmentNote, setJudgmentNote] = useState('');
  const [judgmentMessage, setJudgmentMessage] = useState('');
  const [judgmentSaving, setJudgmentSaving] = useState(false);
  const judgmentTarget = sourceHistory[selectedId]?.at(-1);
  useEffect(() => {
    let alive = true;
    setCandidates([]);
    setSelectedCandidates([]);
    setJudgmentMessage('');
    setJudgmentNote('');
    learningApi.knowledgeLinkCandidates(selectedId).then(result => {
      if (alive) setCandidates(result.candidates);
    }).catch(() => { if (alive) setCandidates([]); });
    return () => { alive = false; };
  }, [selectedId, machineRefreshToken]);
  const toggleCandidate = (target: string) => {
    setSelectedCandidates(old => old.includes(target) ? old.filter(id => id !== target) : [...old, target]);
  };
  const saveTeacherJudgment = async () => {
    if (!judgmentTarget) return;
    setJudgmentSaving(true);
    setJudgmentMessage('');
    try {
      await learningApi.saveSourceVerification({
        indicator_id: selectedId,
        status: 'verified',
        curriculum_locator: judgmentTarget.curriculum_locator,
        textbook_locator: judgmentTarget.textbook_locator,
        material_ids: judgmentTarget.material_ids,
        knowledge_links: candidates
          .filter(candidate => selectedCandidates.includes(candidate.target_indicator_id))
          .map(candidate => ({ target_indicator_id: candidate.target_indicator_id, relation: candidate.relation, evidence: candidate.evidence })),
        rubric_mappings: judgmentTarget.rubric_mappings ?? [],
        resource_links: judgmentTarget.resource_links ?? [],
        source_fingerprints: judgmentTarget.source_fingerprints ?? {},
        expected_version: judgmentTarget.version,
        reviewer: judgmentReviewer.trim(),
        reason: judgmentNote.trim() || '确认机器核验的教材映射与定位，并补充学习顺序判断',
        verified_by: 'teacher',
      });
      setJudgmentMessage(`已以教师署名保存第 ${judgmentTarget.version + 1} 版：机器核验结果与学习顺序判断均已确认。`);
      setMachineRefreshToken(token => token + 1);
      await refreshSourceData();
      onSaved?.();
    } catch (error) {
      setJudgmentMessage(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setJudgmentSaving(false);
    }
  };
  const runMachineCheck = async (targetId?: string) => {
    setMachineRunning(true);
    setMachineMessage('');
    try {
      const result = await learningApi.runMachineVerification(targetId ?? undefined);
      const skipped = targetId ? result.skipped.find(item => item.indicator_id === targetId) : undefined;
      setMachineMessage(
        result.verified.length
          ? `机器核验完成：${result.verified.map(record => record.indicator_id).join('、')} 已自动核验并写入记录。`
          : targetId
            ? `机器核验未写入：${skipped?.reason ?? '证据不足'}。可人工核验后再确认。`
            : '没有需要新写入的指标（均已核验或证据不足）；详见核验进度。',
      );
      if (result.verified.length) {
        setMachineRefreshToken(token => token + 1);
        await refreshSourceData();
        onSaved?.();
      }
    } catch (error) {
      setMachineMessage(`机器核验失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setMachineRunning(false);
    }
  };
  const refreshId = useRef(0);
  const refreshSourceData = useCallback(async () => {
    const requestId = ++refreshId.current;
    setSourceHistoryFailed(false);
    setCatalogFailed(false);
    setSourceHistoryLoaded(false);
    const historyRequest = learningApi.sourceVerifications().then(value => {
      if (requestId !== refreshId.current) return;
      setSourceHistory(value);
      setSourceHistoryLoaded(true);
    }).catch(() => {
      if (requestId !== refreshId.current) return;
      setSourceHistoryFailed(true);
      setSourceHistoryLoaded(true);
    });
    const catalogRequest = learningApi.materialCatalog().then(value => {
      if (requestId !== refreshId.current) return;
      setCatalog(value.indicators);
    }).catch(() => {
      if (requestId !== refreshId.current) return;
      setCatalog([]);
      setCatalogFailed(true);
    });
    await Promise.all([historyRequest, catalogRequest]);
  }, []);
  useEffect(() => {
    setSourceHistory({});
    setCatalog([]);
    setSourceHistoryLoaded(false);
    setSourceHistoryFailed(false);
    void refreshSourceData();
    return () => { refreshId.current += 1; };
  }, [run.run_id, refreshSourceData]);
  const topics = [...new Set(run.objectives.map(objective => objective['主题'] || objective['主题编号']))];
  const objective = run.objectives.find(item => item['指标编号'] === selectedId);
  if (!objective) return <div className="knowledge-layout">
    <Panel title="主题与指标目录">{run.objectives.length ? run.objectives.map(item => <button type="button" className="knowledge-option" key={item['指标编号']} onClick={() => selectIndicator(item['指标编号'])}><strong>{item['指标编号']}</strong><span>{item['观察指标']}</span></button>) : <p>当前运行没有指标，无法核对学科来源。</p>}</Panel>
    <Panel title="指标详情"><p>请选择一项学习要求查看其关联题目与来源。</p></Panel>
  </div>;
  const source = run.source_index.find(item => item.indicator_id === objective['指标编号']);
  const latestSignoff = sourceHistory[objective['指标编号']]?.at(-1);
  const currentVerification = latestSignoff?.status ?? source?.verification;
  const verificationText = sourceHistoryFailed
    ? '签核记录暂不可用'
    : !sourceHistoryLoaded
      ? '正在读取签核记录'
      : verificationLabel(currentVerification, latestSignoff?.stale);
  const items = run.items.filter(item => item['指标编号'] === objective['指标编号']);
  const showAllItems = expandedItemsFor === objective['指标编号'];
  const topicCheck = source?.source_check;
  const indicatorCheck = source?.indicator_check;
  const catalogEntry = catalog.find(item => item.indicator_id === objective['指标编号']);
  const page = topicCheck?.curriculum_file_page;
  const verificationRows = run.objectives.map(item => ({ item, latest: sourceHistory[item['指标编号']]?.at(-1) }));
  const verifiedCount = verificationRows.filter(row => row.latest?.status === 'verified' && !row.latest?.stale).length;
  const machineSignedCount = verificationRows.filter(row => row.latest?.verified_by === 'machine' && row.latest?.status === 'verified' && !row.latest?.stale).length;
  const verifiedLinks = Object.entries(sourceHistory).flatMap(([fromId, records]) => {
    const latest = records.at(-1);
    if (!latest || latest.status !== 'verified' || latest.stale) return [];
    return latest.knowledge_links.map(link => ({ from: fromId, ...link }));
  });
  const objectiveLabels = Object.fromEntries(run.objectives.map(item => [item['指标编号'], item['观察指标']]));
  const prerequisites = verifiedLinks.filter(link => link.target_indicator_id === selectedId);
  const successors = verifiedLinks.filter(link => link.from === selectedId);
  return <div className="knowledge-layout">
    <Panel title="主题与指标目录"><p className="muted">{topics.length} 个数据主题 · {run.objectives.length} 项指标</p>
      {topics.map(topic => <section className="topic-group" key={topic}><h3>{topic} <small>{run.objectives.filter(item => (item['主题'] || item['主题编号']) === topic).length} 项</small></h3>
      {run.objectives.filter(item => (item['主题'] || item['主题编号']) === topic).map(item => { const signoff = sourceHistory[item['指标编号']]?.at(-1); return <button type="button" className={`knowledge-option${objective['指标编号'] === item['指标编号'] ? ' selected' : ''}`} aria-current={objective['指标编号'] === item['指标编号'] ? 'true' : undefined} key={item['指标编号']} onClick={() => selectIndicator(item['指标编号'])}><strong>{item['指标编号']}</strong><span>{item['观察指标']}</span><small>关联题目 {run.items.filter(question => question['指标编号'] === item['指标编号']).length} 道 · {sourceHistoryLoaded && !sourceHistoryFailed ? verificationLabel(signoff?.status ?? run.source_index.find(entry => entry.indicator_id === item['指标编号'])?.verification, signoff?.stale) : sourceHistoryFailed ? '签核记录暂不可用' : '正在读取签核记录'}</small></button>; })}</section>)}
      <div className="verification-report">
        <div className="verification-report-head"><strong>核验进度 {verifiedCount}/{run.objectives.length}</strong><span>机器 {machineSignedCount} · 教师 {verifiedCount - machineSignedCount} · 待核对 {run.objectives.length - verifiedCount}</span><button type="button" className="secondary" disabled={machineRunning} onClick={() => void runMachineCheck()}>{machineRunning ? '正在匹配切片文本…' : '一键机器核验全部指标'}</button></div>
        <ul className="verification-report-list">{verificationRows.map(row => { const status = row.latest?.stale ? '来源已变化' : row.latest?.status === 'verified' ? '已核验' : row.latest?.status === 'rejected' ? '已驳回' : row.latest ? '待复核' : '未核验'; const by = row.latest?.verified_by === 'machine' ? '机器' : row.latest?.reviewer ? `教师 ${row.latest.reviewer}` : '—'; const evidence = row.latest?.machine_evidence?.[0]; return <li key={row.item['指标编号']}><button type="button" className="verification-row" onClick={() => selectIndicator(row.item['指标编号'])}><strong>{row.item['指标编号']}</strong><span>{status} · {by}{row.latest?.confidence != null ? ` · 置信度 ${Math.round(row.latest.confidence * 100)}%` : ''}{evidence?.page ? ` · ${evidence.slice ?? ''} 第 ${evidence.page} 页` : ''}</span></button></li>; })}</ul>
        {machineMessage && <p className="muted" role="status">{machineMessage}</p>}
      </div>
    </Panel>
    <Panel title="指标详情"><h3>{objective['指标编号']} · {objective['观察指标']}</h3><p>主题：{objective['主题'] || objective['主题编号']}</p><p>主题目标：{objective['主题目标'] || '未提供'}</p>
      <section className="source-detail"><h3>关联题目 · {items.length} 道</h3>{items.length ? <>
        {(showAllItems ? items : items.slice(0, 5)).map(item => <div className="row" key={item['材料编号']}><strong>{item['材料编号']}</strong><p>{item['题干或内容'] || '未提供题干'}</p><small>指标与题目关系：{verificationText}</small></div>)}
        {items.length > 5 && <button type="button" className="text-action" aria-expanded={showAllItems} onClick={() => setExpandedItemsFor(showAllItems ? '' : objective['指标编号'])}>{showAllItems ? '收起关联题目' : `查看全部关联题目（${items.length}）`}</button>}
      </> : <p>当前快照没有关联题目；不能据此判断知识覆盖。</p>}</section>
      <section className="source-detail knowledge-chain" aria-label="已核验必要联系"><h3>已核验必要联系（学习顺序）</h3>
        {prerequisites.length || successors.length ? <>
          {prerequisites.map(link => <p key={`pre:${link.from}`}>前置 · {link.from} {objectiveLabels[link.from] ?? ''}（{link.relation}）<small>依据：{link.evidence}</small></p>)}
          {successors.map(link => <p key={`suc:${link.target_indicator_id}`}>后继 · {link.target_indicator_id} {objectiveLabels[link.target_indicator_id] ?? ''}（{link.relation}）<small>依据：{link.evidence}</small></p>)}
        </> : <p className="muted">尚无已核验的必要联系；教师判断确认或人工补充后会在这里显示学习顺序链。不自动生成——顺序来自数据事实或教师判断。</p>}
      </section>
      <section className="source-detail"><h3>课程标准</h3><p>导入定位：{objective['课标文件页／正文页'] ? curriculumLocatorLabel(objective['课标文件页／正文页']) : '待核验'}；指标级定位：{indicatorCheck?.curriculum_locator || '待核对'}</p><p>主题课标核验：{topicCheck?.curriculum_check || '待核对'}。{page && <a href={`${learningApi.sourceUrl('课程标准_2022.pdf')}#page=${page}`} target="_blank" rel="noopener noreferrer">打开原页（文件第 {page} 页）</a>}</p><div className="machine-check-row"><button type="button" className="secondary" disabled={machineRunning} onClick={() => void runMachineCheck(selectedId)}>{machineRunning ? '正在匹配切片文本…' : '机器核验教材映射与定位'}</button>{machineMessage && <p role="status">{machineMessage}</p>}</div></section>
      <section className="source-detail"><h3>教材来源</h3><p>导入定位：{objective['教材正文页'] || '待核验'}；指标级定位：{indicatorCheck?.textbook_locator || '待核对'}</p><p>主题教材核验：{topicCheck?.textbook_check || '待核对'}</p>{topicCheck?.textbook_slices?.length ? <p>原页：{topicCheck.textbook_slices.map(name => <a key={name} href={learningApi.sourceUrl(name)} target="_blank" rel="noopener noreferrer">{name} </a>)}</p> : <p>当前运行没有教材原页链接。</p>}</section>
      {judgmentTarget && judgmentTarget.verified_by === 'machine' && judgmentTarget.status === 'verified' && !judgmentTarget.stale && <section className="source-detail teacher-judgment" aria-label="教师判断">
        <h3>教师判断（学习顺序）</h3>
        <p>机器已核验本指标的教材映射与定位{judgmentTarget.confidence != null ? `（置信度 ${Math.round(judgmentTarget.confidence * 100)}%）` : ''}。以下学习顺序为系统候选，勾选你认可的必要联系后，将以教师署名保存新版本；不勾选、直接确认也可以。</p>
        {candidates.length ? candidates.map(candidate => <label className="check-row" key={candidate.target_indicator_id}><input type="checkbox" checked={selectedCandidates.includes(candidate.target_indicator_id)} onChange={() => toggleCandidate(candidate.target_indicator_id)} /><span><strong>{candidate.target_indicator_id} · {candidate.target_label}</strong><small>{candidate.relation} · {candidate.evidence}</small></span></label>) : <p className="muted">当前指标没有系统候选；可在下方签核编辑器手工补充必要联系。</p>}
        <div className="scope-fields"><label>核验人<input value={judgmentReviewer} onChange={event => setJudgmentReviewer(event.target.value)} placeholder="填写教师姓名" /></label><label>确认说明<input value={judgmentNote} onChange={event => setJudgmentNote(event.target.value)} placeholder="默认：确认机器核验结果并补充学习顺序判断" /></label></div>
        <button type="button" className="secondary" disabled={judgmentSaving || !judgmentReviewer.trim()} onClick={() => void saveTeacherJudgment()}>{judgmentSaving ? '正在保存…' : '以教师署名确认'}</button>
        {judgmentMessage && <p role="status">{judgmentMessage}</p>}
      </section>}
      {judgmentTarget && judgmentTarget.verified_by === 'teacher' && judgmentTarget.status === 'verified' && !judgmentTarget.stale && <p className="muted">本指标的机器核验与教师判断均已完成（版本 {judgmentTarget.version} · 教师 {judgmentTarget.reviewer || '未署名'}）。</p>}
      {catalogFailed && <p className="warn" role="alert">材料目录暂不可用；来源签核历史已单独读取。<button type="button" className="text-action" onClick={() => void refreshSourceData()}>重试加载材料目录</button></p>}
      {catalogEntry && <section className="source-detail" aria-label="材料目录与来源文件核验"><h3>材料目录与来源文件核验</h3><p>签核状态：{catalogEntry.source_stale ? '来源已变化，需重新核验' : verificationLabel(catalogEntry.source_status)}</p><p>指标级定位：课标 {catalogEntry.curriculum_locator || '待补充'}；教材 {catalogEntry.textbook_locator || '待补充'}</p>{catalogEntry.documents.map(document => <div className="row" key={document.name}><strong>{document.name}</strong><p>状态：{documentStatusLabel(document.status)} · {document.page_count === null || document.page_count === undefined ? '页数未知' : `共 ${document.page_count} 页`}{document.expected_file_page ? ` · 赛题文件页 ${document.expected_file_page}` : ''}{document.body_page ? ` · 正文页 ${document.body_page}` : ''}</p><p>SHA-256：{document.sha256 || '文件缺失'}</p><a href={`${learningApi.sourceUrl(document.name)}${document.expected_file_page ? `#page=${document.expected_file_page}` : ''}`} target="_blank" rel="noopener noreferrer">{document.expected_file_page ? `打开第 ${document.expected_file_page} 页` : '打开来源文件'}</a></div>)}{catalogEntry.materials.filter(material => material.resource_type !== '题目').map(material => <div className="row" key={material.material_id}><strong>{material.material_id} · {material.resource_type}</strong><p>{material.title || material.source || '材料内容待核对'}</p><p>{material.verified ? `已核验用途：${material.purpose} · ${material.source_locator}` : '需完成指标级人工来源映射'}</p></div>)}</section>}
      <p className="warn">指标关系状态：{verificationText}。主题说明仅供定位；以指标级核验记录判断材料关系。</p>
      {source?.integrity_issues?.length ? <p className="warn">关系或定位问题：{source.integrity_issues.join('、')}</p> : null}
      <SourceVerificationEditor run={run} indicatorId={objective['指标编号']} refreshToken={machineRefreshToken} onSaved={() => { void refreshSourceData(); onSaved?.(); }} onDirtyChange={onDirtyChange} />
    </Panel>
  </div>;
}
