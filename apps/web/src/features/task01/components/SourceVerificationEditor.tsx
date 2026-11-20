import { useEffect, useState } from 'react';
import { learningApi } from '../../../api/client';
import type { AnalysisRun, SourceVerification, SourceVerificationPayload } from '../../../api/types';

export function SourceVerificationEditor({ run, indicatorId }: { run: AnalysisRun; indicatorId: string }) {
  const linked = run.items.filter(item => item['指标编号'] === indicatorId);
  const supportingMaterials = run.items.filter(item => item['材料类型'] && item['材料类型'] !== '题目');
  const [history, setHistory] = useState<SourceVerification[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [curriculum, setCurriculum] = useState('');
  const [textbook, setTextbook] = useState('');
  const [links, setLinks] = useState('');
  const [rubricMappings, setRubricMappings] = useState('');
  const [resourceLinks, setResourceLinks] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setHistory([]); setSelected([]); setCurriculum(''); setTextbook(''); setLinks(''); setRubricMappings(''); setResourceLinks(''); setReviewer(''); setReason(''); setMessage('');
    Promise.resolve().then(() => learningApi.sourceVerifications()).then(map => { if (alive) { const records = map[indicatorId] ?? []; setHistory(records); const last = records.at(-1); if (last) { setSelected(last.material_ids); setCurriculum(last.curriculum_locator); setTextbook(last.textbook_locator); setReviewer(last.reviewer); setReason(last.reason); setLinks(last.knowledge_links.map(link => `${link.target_indicator_id}|${link.relation}|${link.evidence}`).join('\n')); setRubricMappings((last.rubric_mappings ?? []).map(mapping => `${mapping.issue_id}|${mapping.rubric_point_ids.join(',')}|${mapping.label ?? ''}|${mapping.material_ids?.join(',') ?? ''}|${mapping.evidence ?? ''}`).join('\n')); setResourceLinks((last.resource_links ?? []).map(link => `${link.material_id}|${link.purpose}|${link.indicator_ids.join(',')}|${link.allowed_node_ids.join(',')}|${link.source_locator}|${link.evidence}`).join('\n')); } } }).catch(error => { if (alive) setMessage(`签核记录读取失败：${error instanceof Error ? error.message : String(error)}`); });
    return () => { alive = false; };
  }, [run.run_id, indicatorId]);

  const latest = history.at(-1);
  const save = async (status: SourceVerificationPayload['status']) => {
    if (saving) return;
    setSaving(true); setMessage('');
    try {
      const knowledge_links = links.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
        const [target_indicator_id, relation, evidence] = line.split('|').map(part => part.trim());
        if (!target_indicator_id || !relation || !evidence) throw new Error('知识联系每行须填写：目标指标|关系|核验依据');
        return { target_indicator_id, relation, evidence };
      });
      const rubric_mappings = rubricMappings.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
        const [issue_id, pointIds, label, materialIds, evidence] = line.split('|').map(part => part.trim());
        const rubric_point_ids = (pointIds ?? '').split(',').map(id => id.trim()).filter(Boolean);
        const material_ids = (materialIds ?? '').split(',').map(id => id.trim()).filter(Boolean);
        if (!issue_id || !rubric_point_ids.length) throw new Error('评分点问题每行须填写：问题编号|评分点编号,评分点编号');
        if (status === 'verified' && (!label || !material_ids.length || !evidence || !reviewer.trim())) throw new Error('确认来源时，评分点问题还须填写名称、关联材料、依据和核验人');
        return { issue_id, label: label ?? '', rubric_point_ids, material_ids, evidence: evidence ?? '', reviewer: reviewer.trim(), status: status === 'verified' ? 'verified' as const : 'pending' as const };
      });
      const resource_links = resourceLinks.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
        const [material_id, purpose, indicators, nodes, source_locator, evidence] = line.split('|').map(part => part.trim());
        const indicator_ids = (indicators ?? '').split(',').map(id => id.trim()).filter(Boolean);
        const allowed_node_ids = (nodes ?? '').split(',').map(id => id.trim()).filter(Boolean);
        if (!material_id || !purpose || !indicator_ids.length || !allowed_node_ids.length || !source_locator || !evidence) throw new Error('资源映射每行须填写：材料编号|用途|指标编号,...|节点编号,...|来源定位|核验依据');
        return { material_id, purpose, indicator_ids, allowed_node_ids, source_locator, evidence, status: status === 'verified' ? 'verified' as const : 'pending' as const };
      });
      const record = await learningApi.saveSourceVerification({ indicator_id: indicatorId, status, curriculum_locator: curriculum, textbook_locator: textbook, material_ids: selected, knowledge_links, rubric_mappings, resource_links, expected_version: latest?.version ?? 0, reviewer, reason });
      setHistory(old => [...old, record]);
      setMessage(`已保存第 ${record.version} 版：${status === 'verified' ? '人工核验通过' : status === 'rejected' ? '驳回' : '待核验'}。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };
  return <section className="source-detail" aria-label="指标来源签核"><h3>来源签核</h3><p>状态：<strong>{latest?.stale ? '来源已变化，需重新核验' : latest?.status === 'verified' ? '已确认' : latest?.status === 'rejected' ? '已驳回' : '待核验'}</strong> · {latest ? `版本 ${latest.version} · ${latest.reviewer || '未署名'} · ${latest.reviewed_at}` : '尚无记录'}</p>
    <details className="editor-disclosure"><summary>{latest ? '更新签核' : '开始逐项签核'}</summary><p className="muted">查验原页与关联题目；确认时须选择全部当前关联题目，知识联系只录入已核对关系。</p>
    <div className="scope-fields"><label>课标原页与定位<input value={curriculum} onChange={event => setCurriculum(event.target.value)} placeholder="文件页／正文页与条款" /></label><label>教材原页与定位<input value={textbook} onChange={event => setTextbook(event.target.value)} placeholder="册次、页码与内容" /></label><label>核验人<input value={reviewer} onChange={event => setReviewer(event.target.value)} /></label></div>
    <fieldset><legend>逐项核对题目关联</legend>{linked.map(item => <label className="check-row" key={item['材料编号']}><input type="checkbox" checked={selected.includes(item['材料编号'])} onChange={event => setSelected(old => event.target.checked ? [...old, item['材料编号']] : old.filter(id => id !== item['材料编号']))} />{item['材料编号']} · {item['题干或内容'] || '未提供题干'}</label>)}</fieldset>
    <fieldset><legend>可映射教材与学习卡（{supportingMaterials.length} 项）</legend>{supportingMaterials.length ? supportingMaterials.map(item => <p className="muted" key={item['材料编号']}><strong>{item['材料编号']}</strong> · {item['材料类型']} · {item['来源或资料文件'] || item['题干或内容'] || '未提供来源说明'}</p>) : <p className="muted">当前运行没有教材或学习卡条目。</p>}</fieldset>
    <label>必要知识联系（每行：目标指标|关系|核验依据）<textarea value={links} onChange={event => setLinks(event.target.value)} placeholder="T01I2|前置知识|教材第 80 页与课标第 62 页" /></label>
    <label>评分点问题映射（每行：问题编号|评分点编号,...|问题名称|关联材料编号,...|核验依据）<textarea value={rubricMappings} onChange={event => setRubricMappings(event.target.value)} placeholder="combine_like_terms|Q001P1,Q004P2|同类项识别有误|Q001,Q004|两题评分点描述指向同一错误" /></label>
    <label>教材/学习卡/其他资源映射（每行：材料编号|用途|指标编号,...|节点编号,...|来源定位|核验依据）<textarea value={resourceLinks} onChange={event => setResourceLinks(event.target.value)} placeholder="B05|讲解同类项概念|T01I1|N01,N02|教材第 68 页|例题覆盖当前指标" /></label>
    <label>核验依据与限制<textarea value={reason} onChange={event => setReason(event.target.value)} /></label>
    <div className="actions"><button disabled={saving} onClick={() => void save('verified')}>确认本指标来源</button><button className="secondary" disabled={saving} onClick={() => void save('pending')}>保存待核记录</button><button className="secondary" disabled={saving} onClick={() => void save('rejected')}>驳回当前关系</button></div>
    {message && <p role="status">{message}</p>}
    </details>
    {history.length > 0 && <details><summary>查看签核历史（{history.length}）</summary>{history.map(item => <div key={item.version}><p>版本 {item.version} · {item.status} · {item.reviewer || '未署名'} · {item.reason}</p>{(item.rubric_mappings ?? []).map(mapping => <p key={`${item.version}-${mapping.issue_id}`}>评分点问题 {mapping.label || mapping.issue_id} · {mapping.rubric_point_ids.join('、')} · {mapping.material_ids?.join('、') || '未关联材料'} · {mapping.status}</p>)}{(item.resource_links ?? []).map(link => <p key={`${item.version}-${link.material_id}`}>{link.resource_type || '资源'} {link.material_id} · {link.purpose} · {link.status} · 指纹 {link.content_hash?.slice(0, 12) || '无'}</p>)}</div>)}</details>}
  </section>;
}
