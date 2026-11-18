import { useRef, useState } from 'react';
import { learningApi } from '../../api/client';
import { Panel } from '../../components/Panel';
export function ImportPanel({ onImported, onMessage }: { onImported: (id: string) => Promise<void>; onMessage: (text: string, error?: boolean) => void }) {
  const [folder, setFolder] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  const submit = async () => {
    const expected = ['课程要求.csv', '题目与材料.csv', '模拟学生.csv', '测验节点.csv', '作答记录.csv', '字段说明.csv'];
    const selected = new Map(files.map(file => [file.name, file]));
    const missing = expected.filter(name => !selected.has(name));
    if (missing.length) { const text = `所选文件夹缺少：${missing.join('、')}`; setFeedback(text); setFailed(true); onMessage(text, true); return; }
    const contents = Object.fromEntries(await Promise.all(expected.map(async name => [name, await selected.get(name)!.text()] as const)));
    setBusy(true); setFeedback('正在导入和分析…'); setFailed(false); onMessage('正在导入和分析…');
    try { const result = await learningApi.importFiles(contents); await onImported(result.run_id); }
    catch (reason) { const text = reason instanceof Error ? reason.message : String(reason); setFeedback(text); setFailed(true); onMessage(text, true); }
    finally { setBusy(false); }
  };
  return <Panel title="导入数据"><p className="muted">选择数据文件夹，智慧学伴会在本机读取并生成分析结果。</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <input ref={picker} aria-label="选择 CSV 文件夹" type="file" hidden multiple {...{ webkitdirectory: '', directory: '' }} disabled={busy} onChange={event => { const selected = Array.from(event.target.files ?? []); setFiles(selected); setFolder(selected[0]?.webkitRelativePath.split('/')[0] ?? ''); setFeedback(selected.length ? `已选择 ${selected[0]?.webkitRelativePath.split('/')[0]} · ${selected.length} 个文件` : ''); setFailed(false); }} />
      <button type="button" className="secondary" disabled={busy} onClick={() => picker.current?.click()}>选择数据文件夹</button>
      <p>{folder ? `已选择 ${folder} · ${files.length} 个文件` : '尚未选择文件夹'}</p>
      <details className="required-files" open><summary>6 个必需 CSV 文件名</summary><ul>{['课程要求.csv', '题目与材料.csv', '模拟学生.csv', '测验节点.csv', '作答记录.csv', '字段说明.csv'].map(name => <li key={name}>{name}</li>)}</ul></details>
      <p className={failed ? 'error' : 'muted'} role={failed ? 'alert' : 'status'} aria-live={failed ? 'assertive' : 'polite'}>{feedback}</p>
      <button type="submit" disabled={busy || files.length === 0}>{busy ? '正在导入…' : '检查文件并导入'}</button>
    </form>
  </Panel>;
}
