import { useState } from 'react';
import { learningApi } from '../../api/client';
import { Panel } from '../../components/Panel';
export function ImportPanel({ onImported, onMessage }: { onImported: (id: string) => Promise<void>; onMessage: (text: string, error?: boolean) => void }) {
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!folder.trim()) { onMessage('请输入 CSV 文件夹的绝对路径。', true); return; }
    setBusy(true); onMessage('正在导入和分析…');
    try { const result = await learningApi.importFolder(folder); await onImported(result.run_id); }
    catch (reason) { onMessage(reason instanceof Error ? reason.message : String(reason), true); }
    finally { setBusy(false); }
  };
  return <Panel title="导入赛事数据"><p className="muted">输入本机六类 CSV 所在文件夹的绝对路径。原始文件保留在原位置；分析数据写入本项目 data 目录。</p>
    <input aria-label="CSV 文件夹路径" value={folder} onChange={event => setFolder(event.target.value)} placeholder="D:\工作台\智慧学伴-比赛项目\…\模拟学情数据" />
    <button disabled={busy} onClick={() => void submit()}>{busy ? '导入分析中…' : '导入并分析'}</button>
  </Panel>;
}
