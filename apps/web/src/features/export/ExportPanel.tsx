import { useState } from 'react';
import type { CaseSuggestion, Student } from '../../api/types';
import { Panel } from '../../components/Panel';
export function ExportPanel({ students, suggestions, onExport }: { students: Student[]; suggestions: CaseSuggestion[]; onExport: (ids: string[]) => void }) {
  const [ids, setIds] = useState<string[]>([]);
  const options = students.map(item => item['学生编号']);
  const choose = (index: number, value: string) => setIds(old => { const next = [...old]; next[index] = value; return next; });
  return <Panel title="三名案例与成果导出"><p className="muted">系统按部分得分、较好表现、记录较少提出候选；请核对证据后选择或调整。</p>
    {suggestions.map(item => <p key={`${item.type}-${item.student_id}`}><strong>{item.type}：{item.student_id}</strong> {item.reason} <small>依据记录：{item.evidence_record_ids.slice(0, 8).join('、') || '暂无'}{item.evidence_record_ids.length > 8 ? '…' : ''}</small></p>)}
    <div className="grid">{[0, 1, 2].map(index => <label key={index}>案例{['一', '二', '三'][index]}<select value={ids[index] || suggestions[index]?.student_id || options[index] || ''} onChange={event => choose(index, event.target.value)}>{options.map(id => <option key={id} value={id}>{id}</option>)}</select></label>)}</div>
    <button onClick={() => onExport([0, 1, 2].map(index => ids[index] || suggestions[index]?.student_id || options[index] || ''))}>下载成果包</button>
  </Panel>;
}
