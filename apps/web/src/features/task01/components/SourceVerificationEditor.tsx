import { useEffect, useState } from 'react';
import { learningApi } from '../../../api/client';
import type { AnalysisRun, SourceVerification, SourceVerificationPayload } from '../../../api/types';

export function SourceVerificationEditor({ run, indicatorId }: { run: AnalysisRun; indicatorId: string }) {
  const linked = run.items.filter(item => item['指标编号'] === indicatorId);
  const [history, setHistory] = useState<SourceVerification[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [curriculum, setCurriculum] = useState('');
  const [textbook, setTextbook] = useState('');
  const [links, setLinks] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setHistory([]); setSelected([]); setCurriculum(''); setTextbook(''); setLinks(''); setReviewer(''); setReason(''); setMessage('');
    Promise.resolve().then(() => learningApi.sourceVerifications()).then(map => { if (alive) { const records = map[indicatorId] ?? []; setHistory(records); const last = records.at(-1); if (last) { setSelected(last.material_ids); setCurriculum(last.curriculum_locator); setTextbook(last.textbook_locator); setReviewer(last.reviewer); setReason(last.reason); setLinks(last.knowledge_links.map(link => `${link.target_indicator_id}|${link.relation}|${link.evidence}`).join('\n')); } } }).catch(error => { if (alive) setMessage(`签核记录读取失败：${error instanceof Error ? error.message : String(error)}`); });
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
      const record = await learningApi.saveSourceVerification({ indicator_id: indicatorId, status, curriculum_locator: curriculum, textbook_locator: textbook, material_ids: selected, knowledge_links, reviewer, reason });
      setHistory(old => [...old, record]);
      setMessage(`已保存第 ${record.version} 版：${status === 'verified' ? '人工核验通过' : status === 'rejected' ? '驳回' : '待核验'}。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };
  return <section className="source-detail" aria-label="指标来源签核"><h3>来源签核</h3><p>状态：<strong>{latest?.status === 'verified' ? '已确认' : latest?.status === 'rejected' ? '已驳回' : '待核验'}</strong> · {latest ? `版本 ${latest.version} · ${latest.reviewer || '未署名'} · ${latest.reviewed_at}` : '尚无记录'}</p>
    <details className="editor-disclosure"><summary>{latest ? '更新签核' : '开始逐项签核'}</summary><p className="muted">查验原页与关联题目；确认时须选择全部当前关联题目，知识联系只录入已核对关系。</p>
    <div className="scope-fields"><label>课标原页与定位<input value={curriculum} onChange={event => setCurriculum(event.target.value)} placeholder="文件页／正文页与条款" /></label><label>教材原页与定位<input value={textbook} onChange={event => setTextbook(event.target.value)} placeholder="册次、页码与内容" /></label><label>核验人<input value={reviewer} onChange={event => setReviewer(event.target.value)} /></label></div>
    <fieldset><legend>逐项核对题目关联</legend>{linked.map(item => <label className="check-row" key={item['材料编号']}><input type="checkbox" checked={selected.includes(item['材料编号'])} onChange={event => setSelected(old => event.target.checked ? [...old, item['材料编号']] : old.filter(id => id !== item['材料编号']))} />{item['材料编号']} · {item['题干或内容'] || '未提供题干'}</label>)}</fieldset>
    <label>必要知识联系（每行：目标指标|关系|核验依据）<textarea value={links} onChange={event => setLinks(event.target.value)} placeholder="T01I2|前置知识|教材第 80 页与课标第 62 页" /></label>
    <label>核验依据与限制<textarea value={reason} onChange={event => setReason(event.target.value)} /></label>
    <div className="actions"><button disabled={saving} onClick={() => void save('verified')}>确认本指标来源</button><button className="secondary" disabled={saving} onClick={() => void save('pending')}>保存待核记录</button><button className="secondary" disabled={saving} onClick={() => void save('rejected')}>驳回当前关系</button></div>
    {message && <p role="status">{message}</p>}
    </details>
    {history.length > 0 && <details><summary>查看签核历史（{history.length}）</summary>{history.map(item => <p key={item.version}>版本 {item.version} · {item.status} · {item.reviewer || '未署名'} · {item.reason}</p>)}</details>}
  </section>;
}
