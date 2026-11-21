import { useRef, useState } from 'react';
import { learningApi } from '../../api/client';
import { Panel } from '../../components/Panel';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') { reject(new Error(`无法读取 ${file.name}`)); return; }
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function ImportPanel({ onImported, onMessage }: { onImported: (id: string) => Promise<void>; onMessage: (text: string, error?: boolean) => void }) {
  const [folder, setFolder] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const submit = async () => {
    const expected = ['课程要求.csv', '题目与材料.csv', '模拟学生.csv', '测验节点.csv', '作答记录.csv', '字段说明.csv'];
    const selected = new Map(files.map(file => [file.name, file]));
    const missing = expected.filter(name => !selected.has(name));
    if (missing.length) { const text = `所选文件夹缺少：${missing.join('、')}`; setFeedback(text); setFailed(true); onMessage(text, true); return; }
    const pdfs = files.filter(file => file.name.toLowerCase().endsWith('.pdf'));
    const oversized = pdfs.find(file => file.size > 100 * 1024 * 1024);
    if (oversized) { const text = `${oversized.name} 超过 DeepSeek OCR 单文件 100 MiB 限制。`; setFeedback(text); setFailed(true); onMessage(text, true); return; }
    if (pdfs.reduce((total, file) => total + file.size, 0) > 250 * 1024 * 1024) { const text = '所选 PDF 总大小超过单次导入 250 MiB 限制。'; setFeedback(text); setFailed(true); onMessage(text, true); return; }
    setBusy(true); setFeedback('正在导入和分析（包含课程标准与教材 PDF 自动解析）…'); setFailed(false); onMessage('正在导入和分析…');
    try {
      const contents = Object.fromEntries(await Promise.all(expected.map(async name => [name, await selected.get(name)!.text()] as const)));
      const pdfFiles = Object.fromEntries(await Promise.all(
        pdfs.map(async file => [file.name, await fileToBase64(file)] as const),
      ));
      const result = await learningApi.importFiles(contents, pdfFiles);
      const parsing = result.source_parsing;
      const parsed = parsing?.parsed_file_count ?? 0;
      const total = parsing?.file_count ?? 0;
      const status = parsing?.status;
      const summary = !parsing || status === 'not_requested'
        ? '数据导入完成。来源 PDF 尚未发送到 OCR。'
        : status === 'complete'
        ? `导入完成，DeepSeek 已解析 ${parsed}/${total} 份课程标准与教材 PDF。`
        : status === 'no_sources'
          ? '数据导入完成，但未找到已登记的课程标准或教材 PDF。'
          : `数据导入完成；PDF 自动解析${status === 'failed' ? '失败' : '未完全完成'}（${parsed}/${total} 份）。请检查来源文件、API Key 和网络后重新导入。`;
      const failedFiles = Object.entries(parsing?.files ?? {})
        .filter(([, file]) => !['complete', 'cached'].includes(file.status ?? ''))
        .map(([name, file]) => `${name}${file.reason ? `：${file.reason}` : `（${file.status ?? '状态未知'}）`}`);
      const feedback = failedFiles.length ? `${summary} ${failedFiles.join('；')}` : summary;
      setFeedback(feedback);
      const parsingFailed = Boolean(parsing && status !== 'complete' && status !== 'no_sources');
      setFailed(parsingFailed);
      onMessage(feedback, parsingFailed);
      await onImported(result.run_id);
    }
    catch (reason) { const text = reason instanceof Error ? reason.message : String(reason); setFeedback(text); setFailed(true); onMessage(text, true); }
    finally { setBusy(false); }
  };
  const recognizeSources = async () => {
    setOcrBusy(true);
    try {
      const preview = await learningApi.sourceOcrPreview();
      const names = Object.entries(preview.files).filter(([, item]) => item.will_send).map(([name]) => name);
      if (!names.length && !preview.cached_count) {
        onMessage(preview.status === 'api_key_missing' ? '未配置 OCR 服务密钥，未发送文件。' : '没有可识别的已登记来源 PDF。', preview.status === 'api_key_missing');
        return;
      }
      const accepted = window.confirm(`OCR 服务：${preview.provider}\n将上传 ${names.length} 个文件：${names.join('、') || '无（仅使用缓存）'}\n已缓存 ${preview.cached_count} 个文件。服务按成功识别页计费。是否继续？`);
      if (!accepted) return;
      const result = await learningApi.sourceOcr();
      onMessage(`来源 OCR 完成：${result.parsed_file_count}/${result.file_count} 份文件。`);
    } catch (reason) {
      onMessage(reason instanceof Error ? reason.message : String(reason), true);
    } finally { setOcrBusy(false); }
  };
  return <Panel title="导入数据"><p className="muted">选择数据文件夹后，系统在本机处理 CSV 并保存已登记的来源 PDF。普通导入不会调用外部 OCR。识别来源 PDF 会把未缓存文件发送至 DeepSeek OCR，并按成功识别页计费；请先预览文件，再主动启动识别。</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <input ref={picker} aria-label="选择 CSV 文件夹" type="file" hidden multiple {...{ webkitdirectory: '', directory: '' }} disabled={busy} onChange={event => { const selected = Array.from(event.target.files ?? []); setFiles(selected); setFolder(selected[0]?.webkitRelativePath.split('/')[0] ?? ''); setFeedback(selected.length ? `已选择 ${selected[0]?.webkitRelativePath.split('/')[0]} · ${selected.length} 个文件` : ''); setFailed(false); }} />
      <button type="button" className="secondary" disabled={busy} onClick={() => picker.current?.click()}>选择数据文件夹</button>
      <p>{folder ? `已选择 ${folder} · ${files.length} 个文件` : '尚未选择文件夹'}</p>
      <details className="required-files" open><summary>6 个必需 CSV 文件名</summary><ul>{['课程要求.csv', '题目与材料.csv', '模拟学生.csv', '测验节点.csv', '作答记录.csv', '字段说明.csv'].map(name => <li key={name}>{name}</li>)}</ul></details>
      <p className={failed ? 'error' : 'muted'} role={failed ? 'alert' : 'status'} aria-live={failed ? 'assertive' : 'polite'}>{busy ? '正在导入和分析（包含课程标准与教材 PDF 自动解析）…' : feedback}</p>
      <button type="submit" disabled={busy || files.length === 0}>{busy ? '正在导入…' : '检查文件并导入'}</button>
      <button type="button" className="secondary" disabled={busy || ocrBusy} onClick={() => void recognizeSources()}>{ocrBusy ? '正在识别…' : '识别来源 PDF（按页计费）'}</button>
    </form>
  </Panel>;
}
