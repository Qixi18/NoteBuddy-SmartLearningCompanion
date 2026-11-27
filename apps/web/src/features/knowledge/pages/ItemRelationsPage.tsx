import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, FileSearch, Link2, NotebookTabs, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorBox, Loading, Notice, Panel } from '../../../components/PageBits';
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
  const pageSize = 9;
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
  return <div className={styles.pageStack}>
    <KnowledgeModuleHeader kind="items" search={search.toString()}/>
    <Notice>清单按当前运行的题目材料构建。题型、难度与适用分析未由数据提供时不显示推断值；选择题目可查看其课程要求、评分点和来源目录。</Notice>
    <div className={styles.itemRelationControls}>
      <label>搜索题目<input type="search" value={query} onChange={event => { setQuery(event.target.value); setItemPage(0); }} placeholder="输入题目编号、题干或指标"/></label>
      <label>观察指标<select aria-label="筛选观察指标" value={indicatorFilter} onChange={event => { setIndicatorFilter(event.target.value); setItemPage(0); }}><option value="">全部指标</option>{indicatorIds.map(id => <option key={id} value={id}>{objectiveName(id)} · {id}</option>)}</select></label>
      <span>{items.length} 项题目与材料 · {indicatorIds.length} 项关联指标</span>
    </div>
    {run.items.length ? <div className={styles.itemRelationGrid}>
      <Panel title={`题目关联清单（${items.length}）`} icon={<FileSearch size={18}/>}>{items.length ? <><div className={styles.itemRelationList} role="group" aria-label="题目关联清单">{visibleItems.map((item, index) => {
        const id = String(item['材料编号'] ?? `item-${index}`);
        const indicatorId = String(item['指标编号'] ?? '');
        const prompt = label(item, ['题干或内容', '题目内容', '材料名称'], '未提供题目内容');
        const pointCount = String(item['评分点'] ?? '').split(/\r?\n/).filter(point => point.trim()).length;
        return <button key={id} type="button" aria-current={id === selectedId ? 'true' : undefined} className={`${styles.itemRelationButton} ${id === selectedId ? styles.itemRelationButtonActive : ''}`} onClick={() => setActiveItemId(id)}>
          <span className={styles.itemRelationButtonHead}><b>{id}</b><small>{str(item['满分'], '未提供满分')} 分</small></span>
          <span className={styles.itemRelationPrompt}>{prompt}</span>
          <span className={styles.itemRelationMeta}>{objectiveName(indicatorId)}{indicatorId ? ` · ${indicatorId}` : ' · 未关联指标'}{pointCount ? ` · ${pointCount} 个评分点` : ''}</span>
        </button>;
      })}</div>{items.length > pageSize && <div className={styles.pagination}><span>第 {currentPage + 1} / {pageCount} 页 · 共 {items.length} 项</span><div><button type="button" disabled={currentPage === 0} onClick={() => setItemPage(Math.max(0, currentPage - 1))}>上一页</button><button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setItemPage(Math.min(pageCount - 1, currentPage + 1))}>下一页</button></div></div>}</> : <EmptyState title="没有匹配的题目" detail="更改搜索词或指标筛选条件。"/>}</Panel>
      <div className={styles.itemRelationDetailColumn}><Panel title="当前题目详情" icon={<NotebookTabs size={18}/>}>{selectedItem ? <div className={styles.itemRelationDetail}>
        <header><div><span>题目编号</span><h3>{selectedId}</h3></div><span className={styles.itemRelationMaximum}>满分 {str(selectedItem['满分'], '未提供')} 分</span></header>
        <section className={styles.itemRelationPromptBlock}><h4>题目内容</h4><p>{label(selectedItem, ['题干或内容', '题目内容', '材料名称'], '当前运行未提供题目内容。')}</p></section>
        <dl className={styles.itemRelationFacts}><div><dt>对应主题</dt><dd>{topic}</dd></div><div><dt>观察指标</dt><dd>{objectiveName(itemIndicator)}{itemIndicator ? ` · ${itemIndicator}` : ''}</dd></div><div><dt>学习要求</dt><dd>{str(objective['学习要求'], '当前课程数据未提供学习要求。')}</dd></div></dl>
        <section className={styles.itemRelationRubric}><h4>评分点</h4>{rubricPoints.length ? <ol>{rubricPoints.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}</ol> : <p>当前题目未提供评分点。</p>}</section>
        <div className={styles.itemRelationActions}><Link to={{ pathname: `${routes.itemEvidence}/${encodeURIComponent(selectedId)}`, search: detailSearch.toString() }}><FileSearch size={15}/>查看该题证据</Link><Link to={{ pathname: routes.studentTeaching, search: detailSearch.toString() }}><Sparkles size={15}/>查看个性化建议</Link></div>
      </div> : <EmptyState title="选择一题查看详情" detail="题目内容、课程指标和评分点会显示在这里。"/>}</Panel>
      <Panel title="关联课程来源与材料" icon={<Link2 size={18}/>}>{catalogPending ? <Loading compact label="读取课程来源目录…"/> : catalogError ? <ErrorBox message={catalogError.message}/> : indicatorCatalog ? <div className={styles.itemRelationSources}>
        <div className={styles.itemRelationSourceHeading}><b>{objectiveName(itemIndicator)} · {itemIndicator}</b><span className={`${styles.status} ${indicatorCatalog.source_status === 'verified' && !indicatorCatalog.source_stale ? isSyntheticVerification(indicatorCatalog) ? styles.syntheticStatus : styles.verified : ''}`}>{indicatorCatalog.source_stale ? '核验已过期' : indicatorCatalog.source_status === 'verified' ? isSyntheticVerification(indicatorCatalog) ? '合成验收记录' : '来源已核验' : '待核验'}</span></div>
        {Boolean(indicatorCatalog.curriculum_locator) && <p>课标定位：{str(indicatorCatalog.curriculum_locator)}</p>}{Boolean(indicatorCatalog.textbook_locator) && <p>教材定位：{str(indicatorCatalog.textbook_locator)}</p>}
        {associatedMaterials.length ? <div className={styles.itemRelationSourceList}><h4>关联材料</h4>{associatedMaterials.map((material, index) => <article key={`${String(material.material_id)}-${index}`}><b>{str(material.material_id)}</b><span>{str(material.title, str(material.resource_type, '课程材料'))}</span><small>{material.verified ? '已核验' : '未核验'}</small></article>)}</div> : <p>当前目录没有关联材料。</p>}
        {associatedDocuments.length ? <div className={styles.itemRelationSourceList}><h4>来源文件</h4>{associatedDocuments.map((document, index) => <article key={`${String(document.name)}-${index}`}><b>{str(document.name)}</b><span>{document.available ? `${str(document.page_count, '页数未知')} 页` : '来源文件缺失'}</span><small>{str(document.status)}</small></article>)}</div> : null}
      </div> : <EmptyState compact title="没有对应的课程来源目录" detail="当前题目关联指标尚未出现在材料目录中。"/>}</Panel>
      </div>
    </div> : <EmptyState title="当前运行没有题目材料" detail="检查导入的数据包是否包含题目与材料表。"/>}
  </div>;
}
