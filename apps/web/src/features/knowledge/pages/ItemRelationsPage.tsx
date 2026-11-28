import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, FileSearch, Link2, NotebookTabs, Search, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorBox, Loading, Panel } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import type { RunData } from '../../../types/api';
import { api } from '../api';
import { KnowledgeModuleHeader } from '../components/KnowledgeModuleHeader';
import { useWorkbenchScope } from '../../shared/useWorkbenchScope';
import { isSyntheticVerification, label, str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function ItemRelationsPage() {
  const { run, runQuery, scope, search } = useWorkbenchScope();
  const catalog = useQuery({ queryKey: ['material-catalog', run?.run_id], queryFn: () => api<Row>('/api/material-catalog'), enabled: Boolean(run) });
  if (runQuery.isPending) return <Loading/>;
  if (!run) return <EmptyState title="当前没有分析运行" detail="请先在教学工作台导入课程与学情数据。" action={<Link className={styles.linkButton} to={routes.dashboard}>前往教学工作台 <ArrowRight size={15}/></Link>}/>;
  const selectedIndicator = scope.indicatorId || String(run.objectives[0]?.['指标编号'] ?? '');
  const objectiveName = (id: string) => label(run.objectives.find(row => row['指标编号'] === id) ?? {}, ['观察指标', '指标名称', '名称'], id);
  return <ItemRelationsView run={run} catalog={catalog.data} catalogPending={catalog.isPending} catalogError={catalog.error as Error | null} search={new URLSearchParams(search)} selectedIndicator={selectedIndicator} objectiveName={objectiveName}/>;
}

function ItemRelationsView({ run, catalog, catalogPending, catalogError, search, selectedIndicator, objectiveName }: { run: RunData; catalog?: Row; catalogPending: boolean; catalogError: Error | null; search: URLSearchParams; selectedIndicator: string; objectiveName: (id: string) => string }) {
  const [query, setQuery] = useState('');
  const [indicatorFilter, setIndicatorFilter] = useState('');
  const [activeItemId, setActiveItemId] = useState('');
  const [itemPage, setItemPage] = useState(0);
  const pageSize = 5;
  const indicatorIds = [...new Set(run.items.map(item => String(item['指标编号'] ?? '')).filter(Boolean))];
  const normalizedQuery = query.trim().toLowerCase();
  const items = run.items.filter(item => {
    const indicatorId = String(item['指标编号'] ?? '');
    const text = `${String(item['材料编号'] ?? '')} ${String(item['题干或内容'] ?? '')} ${String(item['指标编号'] ?? '')} ${objectiveName(indicatorId)}`.toLowerCase();
    return (!indicatorFilter || indicatorId === indicatorFilter) && (!normalizedQuery || text.includes(normalizedQuery));
  });
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(itemPage, pageCount - 1);
  const visibleItems = items.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const selectedItem = items.find(item => String(item['材料编号'] ?? '') === activeItemId) ?? items[0];
  const selectedId = String(selectedItem?.['材料编号'] ?? '');
  const itemIndicator = String(selectedItem?.['指标编号'] ?? selectedIndicator);
  const objective = run.objectives.find(row => String(row['指标编号'] ?? '') === itemIndicator) ?? {};
  const rubricPoints = String(selectedItem?.['评分点'] ?? '').split(/\r?\n/).map(point => point.trim()).filter(Boolean);
  const catalogIndicators = Array.isArray(catalog?.indicators) ? catalog.indicators as Row[] : [];
  const indicatorCatalog = catalogIndicators.find(row => String(row.indicator_id ?? '') === itemIndicator);
  const associatedMaterials = Array.isArray(indicatorCatalog?.materials) ? indicatorCatalog.materials as Row[] : [];
  const associatedDocuments = Array.isArray(indicatorCatalog?.documents) ? indicatorCatalog.documents as Row[] : [];
  const detailSearch = new URLSearchParams(search);
  if (itemIndicator) detailSearch.set('indicator', itemIndicator);
  const topic = label(selectedItem ?? {}, ['主题名称', '主题编号'], label(objective, ['主题名称', '主题编号'], '未提供主题'));
  const indicatorItems = run.items.filter(item => String(item['指标编号'] ?? '') === itemIndicator);
  return <div className={styles.pageStack}>
    <div className={styles.itemRelationPageHeader}><div><h1>题目关联</h1><p>浏览课程题目，查看对应知识要求、评分依据及课程来源。</p></div><span>当前运行数据</span></div>
    <KnowledgeModuleHeader kind="items" search={search.toString()}/>
    <div className={styles.itemRelationSearchBar}><label><Search size={17}/><input aria-label="搜索题目" type="search" value={query} onChange={event => { setQuery(event.target.value); setItemPage(0); }} placeholder="搜索题目编号、题干或观察指标"/></label><select aria-label="筛选观察指标" value={indicatorFilter} onChange={event => { setIndicatorFilter(event.target.value); setItemPage(0); }}><option value="">全部指标</option>{indicatorIds.map(id => <option key={id} value={id}>{objectiveName(id)} · {id}</option>)}</select><span>{items.length} 项</span></div>
    {run.items.length ? <div className={styles.itemRelationGrid} data-testid="item-relation-grid">
      <Panel title="题目与材料" className={styles.itemRelationListPanel} action={<span className={styles.itemRelationPanelCount}>{items.length} 项</span>}>{items.length ? <><p className={styles.itemRelationListHint}>选择一项，查看对应的课程关联信息。</p><div className={styles.itemRelationList} role="group" aria-label="题目清单">{visibleItems.map((item, index) => {
        const id = String(item['材料编号'] ?? `item-${index}`);
        const indicatorId = String(item['指标编号'] ?? '');
        const prompt = label(item, ['题干或内容', '题目内容', '材料名称'], '未提供题目内容');
        const pointCount = String(item['评分点'] ?? '').split(/\r?\n/).filter(point => point.trim()).length;
        return <button key={id} type="button" aria-current={id === selectedId ? 'true' : undefined} className={`${styles.itemRelationButton} ${id === selectedId ? styles.itemRelationButtonActive : ''}`} onClick={() => setActiveItemId(id)}>
          <span className={styles.itemRelationButtonHead}><b>{id}</b><small>{str(item['满分'], '—')} 分</small></span>
          <span className={styles.itemRelationPrompt}>{prompt}</span>
          <span className={styles.itemRelationMeta}>{objectiveName(indicatorId)}{indicatorId ? ` · ${indicatorId}` : ' · 未关联'}{pointCount ? ` · ${pointCount} 个评分点` : ''}</span>
        </button>;
      })}</div><div className={styles.pagination}><span>第 {currentPage + 1} / {pageCount} 页</span><div><button type="button" aria-label="上一页" disabled={currentPage === 0} onClick={() => setItemPage(Math.max(0, currentPage - 1))}>上一页</button><button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setItemPage(Math.min(pageCount - 1, currentPage + 1))}>下一页 <ArrowRight size={14}/></button></div></div></> : <EmptyState title="没有匹配的题目" detail="试试其他题号或指标。"/>}</Panel>
      <div className={styles.itemRelationDetailColumn} data-testid="item-relation-detail-column">{selectedItem ? <><Panel title="题目详情" className={styles.itemRelationDetailPanel} action={<div className={styles.itemRelationDetailBadges}><b>{selectedId}</b><span>满分 {str(selectedItem['满分'], '—')} 分</span></div>}>{<div className={styles.itemRelationDetail}>
        <section className={styles.itemRelationPromptBlock}><h4>题目内容</h4><p>{label(selectedItem, ['题干或内容', '题目内容', '材料名称'], '当前运行未提供题目内容。')}</p></section>
        <section className={styles.itemRelationKnowledge}><h4>知识关联</h4><div className={styles.itemRelationLinkLine}><span>{topic}</span><ArrowRight size={15}/><b>{itemIndicator} · {objectiveName(itemIndicator)}</b></div><p><span>学习要求：</span>{str(objective['学习要求'], '当前课程数据未提供独立的学习要求文本。')}</p></section>
        <section className={styles.itemRelationRubric}><h4>评分依据</h4>{rubricPoints.length ? <ol>{rubricPoints.map((point, index) => <li key={`${index}-${point}`}><b>{String(index + 1).padStart(2, '0')}</b><span>{point}</span><strong>{rubricPoints.length === 1 ? `${str(selectedItem['满分'], '—')} 分` : ''}</strong></li>)}</ol> : <p>当前题目未提供评分点。</p>}</section>
        <div className={styles.itemRelationActions}><Link to={{ pathname: `${routes.itemEvidence}/${encodeURIComponent(selectedId)}`, search: detailSearch.toString() }}><FileSearch size={15}/>查看该题证据</Link><Link to={{ pathname: routes.studentTeaching, search: detailSearch.toString() }}><Sparkles size={15}/>查看个性化建议</Link></div>
      </div>}</Panel><div className={styles.itemRelationSourcesPanel} data-testid="item-relation-sources"><Panel title="课程来源" icon={<Link2 size={18}/>}>{catalogPending ? <Loading compact label="读取课程来源目录…"/> : catalogError ? <ErrorBox message={catalogError.message}/> : indicatorCatalog ? <div className={styles.itemRelationSources}>
        <div className={styles.itemRelationSourceHeading}><b>课程依据与关联材料</b><span className={`${styles.status} ${indicatorCatalog.source_status === 'verified' && !indicatorCatalog.source_stale ? isSyntheticVerification(indicatorCatalog) ? styles.syntheticStatus : styles.verified : ''}`}>{indicatorCatalog.source_stale ? '核验已过期' : indicatorCatalog.source_status === 'verified' ? isSyntheticVerification(indicatorCatalog) ? '合成验收' : '已核验' : '待核验'}</span></div>
        <div className={styles.itemRelationCurrentIndicator}><small>当前观察指标</small><b>{itemIndicator} · {objectiveName(itemIndicator)}</b></div>
        {Boolean(indicatorCatalog.curriculum_locator) && <p>课标定位：{str(indicatorCatalog.curriculum_locator)}</p>}{Boolean(indicatorCatalog.textbook_locator) && <p>教材定位：{str(indicatorCatalog.textbook_locator)}</p>}
        {associatedMaterials.length ? <div className={`${styles.itemRelationSourceList} ${styles.itemRelationMaterialGrid}`}><h4>关联材料</h4>{associatedMaterials.map((material, index) => <article key={`${String(material.material_id)}-${index}`}><b>{str(material.material_id)}</b><span>{str(material.title, str(material.resource_type, '课程材料'))}</span><small>{material.verified ? '已核验' : '未核验'}</small></article>)}</div> : <p>当前目录没有关联材料。</p>}
        {associatedDocuments.length ? <div className={styles.itemRelationSourceList}><h4>课程来源文件</h4>{associatedDocuments.map((document, index) => <article key={`${String(document.name)}-${index}`}><b>{str(document.name)}</b><span>{document.available ? `${str(document.page_count, '页数未知')} 页 · ${str(document.status, '文本可读取')}` : '来源文件缺失'}</span><small>{document.available ? '可读取' : '待定位'}</small></article>)}</div> : null}
        <div className={styles.itemRelationPeers}><h4>同指标关联题目与材料 <span>{indicatorItems.length} 项</span></h4><div>{indicatorItems.map(item => <button key={String(item['材料编号'])} type="button" aria-current={String(item['材料编号']) === selectedId ? 'true' : undefined} onClick={() => { const id = String(item['材料编号'] ?? ''); setActiveItemId(id); const index = items.findIndex(candidate => String(candidate['材料编号'] ?? '') === id); if (index >= 0) setItemPage(Math.floor(index / pageSize)); }}>{String(item['材料编号'] ?? '')}</button>)}</div></div>
      </div> : <EmptyState compact title="没有课程来源" detail="该指标尚未出现在材料目录中。"/>}</Panel></div></> : <Panel title="题目关联" icon={<NotebookTabs size={18}/>} className={styles.itemRelationDetailPanel}><EmptyState title="没有匹配的题目" detail="调整搜索或指标筛选，选择题目后可查看课程关联。"/></Panel>}</div>
    </div> : <EmptyState title="当前运行没有题目材料" detail="检查导入的数据包是否包含题目与材料表。"/>}
  </div>;
}
