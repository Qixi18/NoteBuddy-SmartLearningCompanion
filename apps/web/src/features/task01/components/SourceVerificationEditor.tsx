import { useEffect, useState } from 'react';
import { learningApi } from '../../../api/client';
import type { AnalysisRun, SourceVerification, SourceVerificationPayload } from '../../../api/types';
import type { ResourceLink } from '../../../api/types/review';

type KnowledgeLinkRow = { target_indicator_id: string; relation: string; evidence: string; error?: string };
type RubricMappingRow = { issue_id: string; label: string; rubric_points: string; material_ids: string[]; evidence: string; error?: string };
type ResourceLinkRow = { material_id: string; purpose: string; indicator_ids: string[]; allowed_node_ids: string[]; source_locator: string; evidence: string; error?: string };

const emptyKnowledgeLink = (): KnowledgeLinkRow => ({ target_indicator_id: '', relation: '', evidence: '' });
const emptyRubricMapping = (): RubricMappingRow => ({ issue_id: '', label: '', rubric_points: '', material_ids: [], evidence: '' });
const emptyResourceLink = (): ResourceLinkRow => ({ material_id: '', purpose: '', indicator_ids: [], allowed_node_ids: [], source_locator: '', evidence: '' });

export function SourceVerificationEditor({ run, indicatorId, onSaved, onDirtyChange, refreshToken = 0 }: { run: AnalysisRun; indicatorId: string; onSaved?: () => void; onDirtyChange?: (dirty: boolean) => void; refreshToken?: number }) {
  const linked = run.items.filter(item => item['指标编号'] === indicatorId);
  const resources = run.items.filter(item => item['材料类型'] && item['材料类型'] !== '题目');
  const [history, setHistory] = useState<SourceVerification[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [curriculum, setCurriculum] = useState('');
  const [textbook, setTextbook] = useState('');
  const [knowledgeLinks, setKnowledgeLinks] = useState<KnowledgeLinkRow[]>([]);
  const [rubricMappings, setRubricMappings] = useState<RubricMappingRow[]>([]);
  const [resourceLinks, setResourceLinks] = useState<ResourceLinkRow[]>([]);
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [expectedVersion, setExpectedVersion] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [conflictVersion, setConflictVersion] = useState(0);
  const [conflictRemote, setConflictRemote] = useState<SourceVerification | null>(null);

  useEffect(() => {
    let alive = true;
    setHistory([]); setSelected([]); setCurriculum(''); setTextbook(''); setKnowledgeLinks([]); setRubricMappings([]); setResourceLinks([]); setReviewer(''); setReason(''); setMessage(''); setConflict(false); setConflictRemote(null); setExpectedVersion(0);
    Promise.resolve().then(() => learningApi.sourceVerifications()).then(map => {
      if (!alive) return;
      const records = map[indicatorId] ?? [];
      const last = records.at(-1);
      setHistory(records);
      setExpectedVersion(last?.version ?? 0);
      if (last) {
        setSelected(last.material_ids);
        setCurriculum(last.curriculum_locator);
        setTextbook(last.textbook_locator);
        setReviewer(last.reviewer);
        setReason(last.reason);
        setKnowledgeLinks(last.knowledge_links.map(link => ({ ...link })));
        setRubricMappings((last.rubric_mappings ?? []).map(mapping => ({
          issue_id: mapping.issue_id, label: mapping.label ?? '', rubric_points: mapping.rubric_point_ids.join(', '),
          material_ids: mapping.material_ids ?? [], evidence: mapping.evidence ?? '',
        })));
        setResourceLinks((last.resource_links ?? []).map(link => ({
          material_id: link.material_id, purpose: link.purpose, indicator_ids: link.indicator_ids,
          allowed_node_ids: link.allowed_node_ids, source_locator: link.source_locator, evidence: link.evidence,
        })));
      }
    }).catch(error => { if (alive) setMessage(`签核记录读取失败：${error instanceof Error ? error.message : String(error)}`); });
    return () => { alive = false; };
    // refreshToken 变化（如机器核验写入新记录后）触发重新拉取，状态原地更新。
  }, [run.run_id, indicatorId, refreshToken]);

  const latest = history.at(-1);
  const save = async (status: SourceVerificationPayload['status']) => {
    if (saving || conflict) return;
    const validKnowledge = knowledgeLinks.map(row => {
      const error = !row.target_indicator_id ? '请选择关联指标。' : !row.relation.trim() ? '请填写关系。' : !row.evidence.trim() ? '请填写核验依据。' : '';
      return { ...row, error };
    });
    const validRubrics = rubricMappings.map(row => {
      const pointIds = row.rubric_points.split(',').map(value => value.trim()).filter(Boolean);
      const error = !row.issue_id.trim() ? '请填写问题编号。' : !pointIds.length ? '请填写评分点编号。'
        : status === 'verified' && (!row.label.trim() || !row.material_ids.length || !row.evidence.trim()) ? '确认来源时还须填写问题名称、关联材料和依据。' : '';
      return { ...row, pointIds, error };
    });
    const validResources = resourceLinks.map(row => {
      const error = !row.material_id ? '请选择资源材料。' : !row.purpose.trim() ? '请填写用途。'
        : !row.indicator_ids.length ? '请选择关联指标。' : !row.allowed_node_ids.length ? '请选择允许节点。'
          : !row.source_locator.trim() ? '请填写来源定位。' : !row.evidence.trim() ? '请填写核验依据。' : '';
      return { ...row, error };
    });
    setKnowledgeLinks(validKnowledge);
    setRubricMappings(validRubrics.map(({ pointIds: _pointIds, ...row }) => row));
    setResourceLinks(validResources);
    const hasErrors = validKnowledge.some(row => row.error) || validRubrics.some(row => row.error) || validResources.some(row => row.error);
    if (hasErrors) {
      setMessage('请先修正标出的关联行。');
      return;
    }

    setSaving(true); setMessage('');
    try {
      const payload: SourceVerificationPayload = {
        indicator_id: indicatorId, status, curriculum_locator: curriculum, textbook_locator: textbook,
        material_ids: selected,
        knowledge_links: knowledgeLinks.map(({ target_indicator_id, relation, evidence }) => ({ target_indicator_id, relation: relation.trim(), evidence: evidence.trim() })),
        rubric_mappings: validRubrics.map(row => ({
          issue_id: row.issue_id.trim(), label: row.label.trim(), rubric_point_ids: row.pointIds, material_ids: row.material_ids,
          evidence: row.evidence.trim(), reviewer: reviewer.trim(), status: status === 'verified' ? 'verified' : 'pending',
        })),
        resource_links: resourceLinks.map(row => ({
          material_id: row.material_id, purpose: row.purpose.trim(), indicator_ids: row.indicator_ids,
          allowed_node_ids: row.allowed_node_ids, source_locator: row.source_locator.trim(), evidence: row.evidence.trim(),
          status: status === 'verified' ? 'verified' : 'pending',
        } satisfies ResourceLink)),
        expected_version: expectedVersion, reviewer: reviewer.trim(), reason,
      };
      const record = await learningApi.saveSourceVerification(payload);
      setHistory(old => [...old, record]);
      setExpectedVersion(record.version);
      setMessage(`已保存第 ${record.version} 版：${status === 'verified' ? '人工核验通过' : status === 'rejected' ? '驳回' : '待核验'}。`);
      onDirtyChange?.(false);
      onSaved?.();
    } catch (error) {
      if (error instanceof Error && error.message.includes('已被其他编辑更新')) {
        try {
          const current = await learningApi.sourceVerifications();
          const remoteHistory = current[indicatorId] ?? [];
          setHistory(remoteHistory);
          const remote = remoteHistory.at(-1) ?? null;
          setConflictRemote(remote);
          setConflictVersion(remote?.version ?? expectedVersion);
        } catch {
          setConflictVersion(expectedVersion + 1);
          setConflictRemote(null);
        }
        setConflict(true);
        setMessage('来源已更新，请比较后重新保存。');
      } else setMessage(error instanceof Error ? error.message : String(error));
    } finally { setSaving(false); }
  };

  const refreshConflict = async () => {
    try {
      const current = await learningApi.sourceVerifications();
      const remote = (current[indicatorId] ?? []).at(-1);
      if (!remote) throw new Error('未读取到最新签核版本');
      setHistory(current[indicatorId] ?? []);
      setConflictRemote(remote);
      setConflictVersion(remote.version);
      setMessage('已读取最新来源签核版本；请先逐项比较。');
    } catch {
      setMessage('最新签核版本暂不可用，请重试读取；本地输入仍保留。');
    }
  };
  const compareLatest = () => {
    if (!conflictRemote) return;
    setExpectedVersion(conflictRemote.version);
    setConflict(false);
    setConflictRemote(null);
    setMessage('已确认本地修改与最新版本的差异；保存时将以最新版本号提交。');
  };
  const updateRow = <T extends { error?: string }>(rows: T[], setRows: (next: T[]) => void, index: number, field: keyof T, value: T[keyof T]) => {
    setRows(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value, error: undefined } : row));
  };
  const selectedValues = (event: React.ChangeEvent<HTMLSelectElement>) => Array.from(event.target.selectedOptions, option => option.value);
  const rubricPointOptions = (materialIds: string[]) => resources.concat(linked).filter(item => materialIds.includes(item['材料编号']))
    .flatMap(item => (item['评分点'] ?? '').match(/[A-Z]+\d+P\d+/g) ?? []).filter((id, index, all) => all.indexOf(id) === index);
  const displayValue = (value: string | string[]) => Array.isArray(value) ? value.join('、') || '（空）' : value || '（空）';
  const conflictRows = [
    ['课标定位', conflictRemote?.curriculum_locator, curriculum],
    ['教材定位', conflictRemote?.textbook_locator, textbook],
    ['关联题目', conflictRemote?.material_ids ?? [], selected],
    ['必要知识联系', (conflictRemote?.knowledge_links ?? []).map(row => `${row.target_indicator_id} · ${row.relation} · ${row.evidence}`), knowledgeLinks.map(row => `${row.target_indicator_id} · ${row.relation} · ${row.evidence}`)],
    ['评分点问题', (conflictRemote?.rubric_mappings ?? []).map(row => `${row.label || row.issue_id} · ${row.rubric_point_ids.join('、')} · ${(row.material_ids ?? []).join('、')} · ${row.evidence}`), rubricMappings.map(row => `${row.label || row.issue_id} · ${row.rubric_points} · ${row.material_ids.join('、')} · ${row.evidence}`)],
    ['资源映射', (conflictRemote?.resource_links ?? []).map(row => `${row.material_id} · ${row.purpose} · ${row.indicator_ids.join('、')} · ${row.allowed_node_ids.join('、')} · ${row.source_locator} · ${row.evidence}`), resourceLinks.map(row => `${row.material_id} · ${row.purpose} · ${row.indicator_ids.join('、')} · ${row.allowed_node_ids.join('、')} · ${row.source_locator} · ${row.evidence}`)],
    ['核验人', conflictRemote?.reviewer, reviewer],
    ['核验依据与限制', conflictRemote?.reason, reason],
  ] as const;

  return <section className="source-detail" aria-label="指标来源签核" onChange={() => onDirtyChange?.(true)} onClick={event => { if ((event.target as HTMLElement).closest('button')) onDirtyChange?.(true); }}><h3>来源签核</h3><p>状态：<strong>{latest?.stale ? '来源已变化，需重新核验' : latest?.status === 'verified' ? '已确认' : latest?.status === 'rejected' ? '已驳回' : '待核验'}</strong> · {latest ? `版本 ${latest.version} · ${latest.reviewer || '未署名'} · ${latest.reviewed_at}` : '尚无记录'}</p>
    <details className="editor-disclosure"><summary>{latest ? '更新签核' : '开始逐项签核'}</summary><p className="muted">查验原页与关联题目；确认时须选择全部当前关联题目，必要联系只录入已核对关系。</p>
    <div className="scope-fields"><label>课标原页与定位<input value={curriculum} onChange={event => setCurriculum(event.target.value)} placeholder="文件页／正文页与条款" /></label><label>教材原页与定位<input value={textbook} onChange={event => setTextbook(event.target.value)} placeholder="册次、页码与内容" /></label><label>核验人<input value={reviewer} onChange={event => setReviewer(event.target.value)} /></label></div>
    <fieldset><legend>逐项核对题目关联</legend>{linked.map(item => <label className="check-row" key={item['材料编号']}><input type="checkbox" checked={selected.includes(item['材料编号'])} onChange={event => setSelected(old => event.target.checked ? [...old, item['材料编号']] : old.filter(id => id !== item['材料编号']))} />{item['材料编号']} · {item['题干或内容'] || '未提供题干'}</label>)}</fieldset>
    <fieldset><legend>可映射教材与学习卡（{resources.length} 项）</legend>{resources.length ? resources.map(item => <p className="muted" key={item['材料编号']}><strong>{item['材料编号']}</strong> · {item['材料类型']} · {item['来源或资料文件'] || item['题干或内容'] || '未提供来源说明'}</p>) : <p className="muted">当前运行没有教材或学习卡条目。</p>}</fieldset>

    <fieldset className="verification-row-editor"><legend>必要知识联系</legend>{knowledgeLinks.map((row, index) => <div className="verification-row" key={`knowledge-${index}`}>
      <label>关联指标<select aria-label="关联指标" value={row.target_indicator_id} onChange={event => updateRow(knowledgeLinks, setKnowledgeLinks, index, 'target_indicator_id', event.target.value)}><option value="">请选择指标</option>{run.objectives.map(item => <option key={item['指标编号']} value={item['指标编号']}>{item['指标编号']} · {item['观察指标']}</option>)}</select></label>
      <label>关系<input aria-label="关系" value={row.relation} onChange={event => updateRow(knowledgeLinks, setKnowledgeLinks, index, 'relation', event.target.value)} /></label>
      <label>核验依据<input aria-label="核验依据" value={row.evidence} onChange={event => updateRow(knowledgeLinks, setKnowledgeLinks, index, 'evidence', event.target.value)} /></label>
      <button type="button" className="text-action" onClick={() => setKnowledgeLinks(old => old.filter((_, rowIndex) => rowIndex !== index))}>删除联系</button>
      {row.error && <p className="field-error" role="alert">{row.error}</p>}
    </div>)}<button type="button" className="secondary" onClick={() => setKnowledgeLinks(old => [...old, emptyKnowledgeLink()])}>添加知识联系</button></fieldset>

    <fieldset className="verification-row-editor"><legend>评分点问题映射</legend>{rubricMappings.map((row, index) => <div className="verification-row" key={`rubric-${index}`}>
      <label>问题编号<input aria-label="问题编号" value={row.issue_id} onChange={event => updateRow(rubricMappings, setRubricMappings, index, 'issue_id', event.target.value)} /></label>
      <label>问题名称<input aria-label="问题名称" value={row.label} onChange={event => updateRow(rubricMappings, setRubricMappings, index, 'label', event.target.value)} /></label>
      <label>关联题目<select aria-label="评分点关联材料" multiple value={row.material_ids} onChange={event => updateRow(rubricMappings, setRubricMappings, index, 'material_ids', selectedValues(event))}>{linked.map(item => <option key={item['材料编号']} value={item['材料编号']}>{item['材料编号']}</option>)}</select></label>
      <label>关联评分点<select aria-label="评分点编号" multiple value={row.rubric_points.split(',').map(value => value.trim()).filter(Boolean)} onChange={event => updateRow(rubricMappings, setRubricMappings, index, 'rubric_points', selectedValues(event).join(', '))}>{rubricPointOptions(row.material_ids).map(id => <option key={id} value={id}>{id}</option>)}</select></label>
      <label>核验依据<input aria-label="评分点核验依据" value={row.evidence} onChange={event => updateRow(rubricMappings, setRubricMappings, index, 'evidence', event.target.value)} /></label>
      <button type="button" className="text-action" onClick={() => setRubricMappings(old => old.filter((_, rowIndex) => rowIndex !== index))}>删除问题映射</button>
      {row.error && <p className="field-error" role="alert">{row.error}</p>}
    </div>)}<button type="button" className="secondary" onClick={() => setRubricMappings(old => [...old, emptyRubricMapping()])}>添加评分点问题</button></fieldset>

    <fieldset className="verification-row-editor"><legend>教材、学习卡与其他资源映射</legend>{resourceLinks.map((row, index) => <div className="verification-row" key={`resource-${index}`}>
      <label>资源材料<select aria-label="资源材料" value={row.material_id} onChange={event => updateRow(resourceLinks, setResourceLinks, index, 'material_id', event.target.value)}><option value="">请选择材料</option>{resources.map(item => <option key={item['材料编号']} value={item['材料编号']}>{item['材料编号']} · {item['材料类型']}</option>)}</select></label>
      <label>用途<input aria-label="用途" value={row.purpose} onChange={event => updateRow(resourceLinks, setResourceLinks, index, 'purpose', event.target.value)} /></label>
      <label>关联指标<select aria-label="资源关联指标" multiple value={row.indicator_ids} onChange={event => updateRow(resourceLinks, setResourceLinks, index, 'indicator_ids', selectedValues(event))}>{run.objectives.map(item => <option key={item['指标编号']} value={item['指标编号']}>{item['指标编号']} · {item['观察指标']}</option>)}</select></label>
      <label>允许节点<select aria-label="允许节点" multiple value={row.allowed_node_ids} onChange={event => updateRow(resourceLinks, setResourceLinks, index, 'allowed_node_ids', selectedValues(event))}>{(run.nodes ?? []).map(item => <option key={item['节点编号']} value={item['节点编号']}>{item['节点编号']}</option>)}</select></label>
      <label>来源定位<input aria-label="资源来源定位" value={row.source_locator} onChange={event => updateRow(resourceLinks, setResourceLinks, index, 'source_locator', event.target.value)} /></label>
      <label>核验依据<input aria-label="资源核验依据" value={row.evidence} onChange={event => updateRow(resourceLinks, setResourceLinks, index, 'evidence', event.target.value)} /></label>
      <button type="button" className="text-action" onClick={() => setResourceLinks(old => old.filter((_, rowIndex) => rowIndex !== index))}>删除资源映射</button>
      {row.error && <p className="field-error" role="alert">{row.error}</p>}
    </div>)}<button type="button" className="secondary" onClick={() => setResourceLinks(old => [...old, emptyResourceLink()])}>添加资源映射</button></fieldset>

    <label>核验依据与限制<textarea value={reason} onChange={event => setReason(event.target.value)} /></label>
    {conflict && <div className="version-conflict" role="alert"><p>{message}</p><p>远端当前版本：{conflictVersion}。本地编辑仍保留；逐项对照后再确认继续。</p>{conflictRemote ? <><section className="version-conflict-comparison" aria-label="来源签核版本对比"><h4>最新版本与本地输入</h4><dl>{conflictRows.map(([label, remote, local]) => <div key={label}><dt>{label}</dt><dd><strong>最新版本</strong><span>{displayValue(remote ?? '')}</span></dd><dd><strong>本地输入</strong><span>{displayValue(local)}</span></dd></div>)}</dl></section><button type="button" className="secondary" onClick={compareLatest}>我已对比，保留本地修改并继续</button></> : <button type="button" className="secondary" onClick={() => void refreshConflict()}>重试读取最新版本</button>}</div>}
    <div className="actions"><button disabled={saving || conflict} onClick={() => void save('verified')}>确认本指标来源</button><button className="secondary" disabled={saving || conflict} onClick={() => void save('pending')}>保存待核记录</button><button className="secondary" disabled={saving || conflict} onClick={() => void save('rejected')}>驳回当前关系</button></div>
    {message && !conflict && <p role="status">{message}</p>}
    </details>
    {history.length > 0 && <details><summary>查看签核历史（{history.length}）</summary>{history.map(item => <div key={item.version}><p>版本 {item.version} · {item.status} · {item.reviewer || '未署名'} · {item.reason}</p>{(item.rubric_mappings ?? []).map(mapping => <p key={`${item.version}-${mapping.issue_id}`}>评分点问题 {mapping.label || mapping.issue_id} · {mapping.rubric_point_ids.join('、')} · {mapping.material_ids?.join('、') || '未关联材料'} · {mapping.status}</p>)}{(item.resource_links ?? []).map(link => <p key={`${item.version}-${link.material_id}`}>{link.resource_type || '资源'} {link.material_id} · {link.purpose} · {link.status} · 指纹 {link.content_hash?.slice(0, 12) || '无'}</p>)}</div>)}</details>}
  </section>;
}
