import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisRun, IndicatorMaterialCatalog, SourceVerification } from '../../../api/types';
import { learningApi } from '../../../api/client';
import { Panel } from '../../../components/Panel';
import { SourceVerificationEditor } from './SourceVerificationEditor';

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
  return <div className="knowledge-layout">
    <Panel title="主题与指标目录"><p className="muted">{topics.length} 个数据主题 · {run.objectives.length} 项指标</p>
      {topics.map(topic => <section className="topic-group" key={topic}><h3>{topic} <small>{run.objectives.filter(item => (item['主题'] || item['主题编号']) === topic).length} 项</small></h3>
      {run.objectives.filter(item => (item['主题'] || item['主题编号']) === topic).map(item => { const signoff = sourceHistory[item['指标编号']]?.at(-1); return <button type="button" className={`knowledge-option${objective['指标编号'] === item['指标编号'] ? ' selected' : ''}`} aria-current={objective['指标编号'] === item['指标编号'] ? 'true' : undefined} key={item['指标编号']} onClick={() => selectIndicator(item['指标编号'])}><strong>{item['指标编号']}</strong><span>{item['观察指标']}</span><small>关联题目 {run.items.filter(question => question['指标编号'] === item['指标编号']).length} 道 · {sourceHistoryLoaded && !sourceHistoryFailed ? verificationLabel(signoff?.status ?? run.source_index.find(entry => entry.indicator_id === item['指标编号'])?.verification, signoff?.stale) : sourceHistoryFailed ? '签核记录暂不可用' : '正在读取签核记录'}</small></button>; })}</section>)}
    </Panel>
    <Panel title="指标详情"><h3>{objective['指标编号']} · {objective['观察指标']}</h3><p>主题：{objective['主题'] || objective['主题编号']}</p><p>主题目标：{objective['主题目标'] || '未提供'}</p>
      <section className="source-detail"><h3>关联题目 · {items.length} 道</h3>{items.length ? <>
        {(showAllItems ? items : items.slice(0, 5)).map(item => <div className="row" key={item['材料编号']}><strong>{item['材料编号']}</strong><p>{item['题干或内容'] || '未提供题干'}</p><small>指标与题目关系：{verificationText}</small></div>)}
        {items.length > 5 && <button type="button" className="text-action" aria-expanded={showAllItems} onClick={() => setExpandedItemsFor(showAllItems ? '' : objective['指标编号'])}>{showAllItems ? '收起关联题目' : `查看全部关联题目（${items.length}）`}</button>}
      </> : <p>当前快照没有关联题目；不能据此判断知识覆盖。</p>}</section>
      <section className="source-detail"><h3>课程标准</h3><p>导入定位：{objective['课标文件页／正文页'] || '待核验'}；指标级定位：{indicatorCheck?.curriculum_locator || '待核对'}</p><p>主题课标核验：{topicCheck?.curriculum_check || '待核对'}。{page && <a href={`${learningApi.sourceUrl('课程标准_2022.pdf')}#page=${page}`} target="_blank" rel="noopener noreferrer">打开原页（文件第 {page} 页）</a>}</p></section>
      <section className="source-detail"><h3>教材来源</h3><p>导入定位：{objective['教材正文页'] || '待核验'}；指标级定位：{indicatorCheck?.textbook_locator || '待核对'}</p><p>主题教材核验：{topicCheck?.textbook_check || '待核对'}</p>{topicCheck?.textbook_slices?.length ? <p>原页：{topicCheck.textbook_slices.map(name => <a key={name} href={learningApi.sourceUrl(name)} target="_blank" rel="noopener noreferrer">{name} </a>)}</p> : <p>当前运行没有教材原页链接。</p>}</section>
      {catalogFailed && <p className="warn" role="alert">材料目录暂不可用；来源签核历史已单独读取。<button type="button" className="text-action" onClick={() => void refreshSourceData()}>重试加载材料目录</button></p>}
      {catalogEntry && <section className="source-detail" aria-label="材料目录与来源文件核验"><h3>材料目录与来源文件核验</h3><p>签核状态：{catalogEntry.source_stale ? '来源已变化，需重新核验' : verificationLabel(catalogEntry.source_status)}</p><p>指标级定位：课标 {catalogEntry.curriculum_locator || '待补充'}；教材 {catalogEntry.textbook_locator || '待补充'}</p>{catalogEntry.documents.map(document => <div className="row" key={document.name}><strong>{document.name}</strong><p>状态：{documentStatusLabel(document.status)} · {document.page_count === null || document.page_count === undefined ? '页数未知' : `共 ${document.page_count} 页`}{document.expected_file_page ? ` · 赛题文件页 ${document.expected_file_page}` : ''}{document.body_page ? ` · 正文页 ${document.body_page}` : ''}</p><p>SHA-256：{document.sha256 || '文件缺失'}</p><a href={`${learningApi.sourceUrl(document.name)}${document.expected_file_page ? `#page=${document.expected_file_page}` : ''}`} target="_blank" rel="noopener noreferrer">{document.expected_file_page ? `打开第 ${document.expected_file_page} 页` : '打开来源文件'}</a></div>)}{catalogEntry.materials.filter(material => material.resource_type !== '题目').map(material => <div className="row" key={material.material_id}><strong>{material.material_id} · {material.resource_type}</strong><p>{material.title || material.source || '材料内容待核对'}</p><p>{material.verified ? `已核验用途：${material.purpose} · ${material.source_locator}` : '需完成指标级人工来源映射'}</p></div>)}</section>}
      <p className="warn">指标关系状态：{verificationText}。主题说明仅供定位；以指标级核验记录判断材料关系。</p>
      {source?.integrity_issues?.length ? <p className="warn">关系或定位问题：{source.integrity_issues.join('、')}</p> : null}
      <SourceVerificationEditor run={run} indicatorId={objective['指标编号']} onSaved={() => { void refreshSourceData(); onSaved?.(); }} onDirtyChange={onDirtyChange} />
    </Panel>
  </div>;
}
