import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, FileSearch, Layers3, NotebookTabs, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataTable, EmptyState, Loading, Notice, Panel } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import type { RunData } from '../../../types/api';
import { api } from '../api';
import { KnowledgeModuleHeader } from '../components/KnowledgeModuleHeader';
import { useWorkbenchScope } from '../../shared/useWorkbenchScope';
import { label, str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function TopicOverviewPage() {
  const { run, runQuery, scope, search } = useWorkbenchScope();
  const catalog = useQuery({ queryKey: ['material-catalog', run?.run_id], queryFn: () => api<Row>('/api/material-catalog'), enabled: Boolean(run) });
  if (runQuery.isPending) return <Loading/>;
  if (!run) return <EmptyState title="当前没有分析运行" detail="请先在教学工作台导入课程与学情数据。" action={<Link className={styles.linkButton} to={routes.dashboard}>前往教学工作台 <ArrowRight size={15}/></Link>}/>;
  const selectedStudent = scope.studentId || String(run.students.find(item => String(item['模拟班级编号'] ?? '') === scope.classId)?.['学生编号'] ?? run.students[0]?.['学生编号'] ?? '');
  const selectedIndicator = scope.indicatorId || String(run.objectives[0]?.['指标编号'] ?? '');
  const selectedNode = scope.nodeId || String(run.nodes[0]?.['节点编号'] ?? '');
  return <TopicOverviewView
    run={run}
    catalog={catalog.data}
    catalogPending={catalog.isPending}
    catalogError={catalog.error as Error | null}
    selectedStudent={selectedStudent}
    selectedIndicator={selectedIndicator}
    selectedNode={selectedNode}
    search={search}
  />;
}

type TopicOverviewRow = {
  order: number;
  topic_id: string;
  topic_name: string;
  requirements: string[];
  indicators: Array<{ id: string; name: string }>;
  source_names: string[];
  material_ids: string[];
};

function topicOverviewRows(objectives: Row[], items: Row[], catalog: Row | undefined): TopicOverviewRow[] {
  const groups = new Map<string, Row[]>();
  for (const objective of objectives) {
    const topicId = str(objective['主题编号'], '未分类');
    groups.set(topicId, [...(groups.get(topicId) ?? []), objective]);
  }
  const catalogRows = Array.isArray(catalog?.indicators) ? catalog.indicators as Row[] : [];
  return [...groups.entries()].map(([topicId, rows], index) => {
    const indicatorIds = rows.map(row => String(row['指标编号'] ?? '')).filter(Boolean);
    const indicators = rows.map(row => ({
      id: String(row['指标编号'] ?? '未提供编号'),
      name: label(row, ['观察指标', '指标名称', '名称'], '未命名观察指标'),
    }));
    const requirements = [...new Set(rows.map(row => label(row, ['学习要求', '课程要求', '内容要求', '要求描述'], '')).filter(Boolean))];
    const topicCatalog = catalogRows.filter(row => indicatorIds.includes(String(row.indicator_id ?? '')));
    const sourceNames = [...new Set(topicCatalog.flatMap(entry => {
      const documents = Array.isArray(entry.documents) ? entry.documents as Row[] : [];
      return [...documents.map(document => String(document.name ?? '')).filter(Boolean), ...[entry.curriculum_locator, entry.textbook_locator].filter((value): value is string => typeof value === 'string' && Boolean(value))];
    }))];
    const materialIds = [...new Set(items.filter(item => indicatorIds.includes(String(item['指标编号'] ?? ''))).map(item => String(item['材料编号'] ?? '')).filter(Boolean))];
    const topicName = label(rows[0], ['主题名称'], topicId);
    return { order: index + 1, topic_id: topicId, topic_name: topicName, requirements, indicators, source_names: sourceNames, material_ids: materialIds };
  });
}
function TopicOverviewView({ run, catalog, catalogPending, catalogError, selectedStudent, selectedIndicator, selectedNode, search }: {
  run: RunData;
  catalog?: Row;
  catalogPending: boolean;
  catalogError: Error | null;
  selectedStudent: string;
  selectedIndicator: string;
  selectedNode: string;
  search: string;
}) {
  const topics = topicOverviewRows(run.objectives, run.items, catalog);
  const linkedById = new Map<string, Row>();
  for (const entry of Array.isArray(catalog?.indicators) ? catalog.indicators as Row[] : []) {
    for (const material of Array.isArray(entry.materials) ? entry.materials as Row[] : []) linkedById.set(String(material.material_id ?? ''), material);
  }
  const [topicFilter, setTopicFilter] = useState('');
  const [indicatorFilter, setIndicatorFilter] = useState('');
  const [itemPage, setItemPage] = useState(0);
  const pageSize = 18;
  const indicatorTopic = new Map<string, string>();
  for (const objective of run.objectives) indicatorTopic.set(String(objective['指标编号'] ?? ''), String(objective['主题编号'] ?? ''));
  const indicatorOptions = run.objectives.filter(row => !topicFilter || String(row['主题编号'] ?? '') === topicFilter);
  const topicIndicatorIds = new Set(run.objectives.filter(row => !topicFilter || String(row['主题编号'] ?? '') === topicFilter).map(row => String(row['指标编号'] ?? '')).filter(Boolean));
  const filteredItems = run.items.filter(item => {
    const indicatorId = String(item['指标编号'] ?? '');
    if (indicatorFilter) return indicatorId === indicatorFilter;
    if (topicFilter) return indicatorTopic.get(indicatorId) === topicFilter;
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(itemPage, pageCount - 1);
  const visibleItems = filteredItems.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const changeTopic = (value: string) => {
    setTopicFilter(value);
    setItemPage(0);
    if (indicatorFilter && !run.objectives.some(row => String(row['指标编号'] ?? '') === indicatorFilter && (!value || String(row['主题编号'] ?? '') === value))) setIndicatorFilter('');
  };
  const changeIndicator = (value: string) => {
    setIndicatorFilter(value);
    setItemPage(0);
  };
  return <div className={styles.pageStack}>
    <KnowledgeModuleHeader kind="overview" search={search}/>
    <Notice>课程 PDF 在导入时自动解析，结果随本次课程运行保存在本地数据库；下方展示导入的学习要求、材料和来源定位。</Notice>
    <Panel title="主题学习要求与资源映射" icon={<Layers3 size={18}/>}>{topics.length ? <div className={styles.topicOverviewTable}><DataTable columns={[
      { key: 'order', title: '序号', render: row => <span className={styles.topicOrder}>{String(row.order)}</span> },
      { key: 'topic', title: '主题', render: row => <><strong>{String(row.topic_name)}</strong><small className={styles.secondaryCell}>{String(row.topic_id)}</small></> },
      { key: 'requirements', title: '学习要求', render: row => <ul className={styles.requirementList}>{(row.requirements as string[]).length ? (row.requirements as string[]).map((requirement, index) => <li key={`${String(row.topic_id)}-${index}`}>{requirement}</li>) : <li>当前数据未提供独立的学习要求文本。</li>}</ul> },
      { key: 'indicators', title: '观察指标', render: row => <div className={styles.inlineTags}>{(row.indicators as Array<{ id: string; name: string }>).map(item => <Link key={item.id} to={{ pathname: routes.knowledgeStructure, search: new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(search)), indicator: item.id }).toString() }}><b>{item.id}</b> {item.name}</Link>)}</div> },
      { key: 'sources', title: '教材 / 来源', render: row => { const names = row.source_names as string[]; const text = names.length ? names.join('；') : catalogPending ? '正在读取来源…' : '当前目录未提供来源定位'; return <span className={styles.clamped} title={text}>{text}</span>; } },
      { key: 'materials', title: '关联题目 / 材料', render: row => { const ids = row.material_ids as string[]; return ids.length ? <details className={styles.inlineDetails}><summary>{ids.length} 项</summary><p>{ids.join('、')}</p></details> : '暂无关联材料'; } },
    ]} rows={topics as unknown as Row[]}/></div>:<EmptyState title="没有课程主题" detail="导入课程要求后，此处会按真实主题汇总学习要求和资源映射。"/>}</Panel>
    <div className={styles.overviewResourceStack}>
      <Panel title="主题重点提示" icon={<Target size={18}/>} className={styles.overviewFocusPanel}>{topics.length ? <div className={styles.topicFocusList}>{topics.map(topic => <article key={topic.topic_id}><header><span className={styles.topicOrder}>{topic.order}</span><div><strong>{topic.topic_name}</strong><small>{topic.indicators.length} 项课程观察指标</small></div></header><ul className={styles.requirementList}>{topic.requirements.length ? topic.requirements.map((item, index) => <li key={`${topic.topic_id}-req-${index}`}>{item}</li>) : <li>课程数据未提供独立的学习要求文本。</li>}</ul><small className={styles.topicFocusMeta}>指标：{topic.indicators.map(item => item.id).join('、') || '未提供'}</small></article>)}</div> : <EmptyState title="没有学习要求" detail="导入课程要求后显示主题和要求。"/>}</Panel>
      <div className={styles.overviewFilters}>
        <strong>筛选下方教材与题目</strong>
        <label>主题<select aria-label="筛选主题" value={topicFilter} onChange={event => changeTopic(event.target.value)}><option value="">全部主题</option>{topics.map(topic => <option key={topic.topic_id} value={topic.topic_id}>{topic.topic_name}</option>)}</select></label>
        <label>观察指标<select aria-label="筛选观察指标" value={indicatorFilter} onChange={event => changeIndicator(event.target.value)}><option value="">全部指标</option>{indicatorOptions.map((row, index) => <option key={String(row['指标编号'] ?? index)} value={String(row['指标编号'] ?? '')}>{String(row['指标编号'] ?? '')} · {label(row, ['观察指标', '指标名称', '名称'], '课程指标')}</option>)}</select></label>
        <span>当前显示 {filteredItems.length} 项题目与材料</span>
      </div>
      <Panel title="教材 / 来源映射" icon={<NotebookTabs size={18}/>} className={styles.catalogSourcePanel}>{catalogPending ? <Loading compact/> : catalog ? <MaterialCatalog value={catalog} indicatorFilter={indicatorFilter} topicIndicatorIds={topicIndicatorIds}/> : <EmptyState title="来源目录暂不可用" detail={catalogError?.message ?? '当前运行没有可用的来源目录。'}/>}</Panel>
      <Panel title={`相关题目 / 材料列表（${filteredItems.length}）`} icon={<FileSearch size={18}/>} className={styles.overviewItemsPanel}>{filteredItems.length ? <><div className={styles.overviewItemTable}><DataTable columns={[
        { key: 'id', title: '编号', render: row => String(row['材料编号'] ?? '—') },
        { key: 'type', title: '类型', render: row => <span className={styles.typeTag}>{String(linkedById.get(String(row['材料编号'] ?? ''))?.resource_type ?? '题目')}</span> },
        { key: 'content', title: '内容简述', render: row => <span className={styles.clamped}>{label(row, ['题干或内容', '题目内容', '材料名称'], '当前数据未提供题目内容')}</span> },
        { key: 'action', title: '操作', render: row => <Link to={{ pathname: `${routes.itemEvidence}/${encodeURIComponent(String(row['材料编号'] ?? ''))}`, search: new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(search)), indicator: String(row['指标编号'] ?? selectedIndicator), student: selectedStudent, node: selectedNode }).toString() }}>查看证据</Link> },
      ]} rows={visibleItems}/></div><div className={styles.pagination}><span>第 {currentPage + 1} / {pageCount} 页 · 共 {filteredItems.length} 项</span><div><button type="button" disabled={currentPage === 0} onClick={() => setItemPage(Math.max(0, currentPage - 1))}>上一页</button><button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setItemPage(Math.min(pageCount - 1, currentPage + 1))}>下一页</button></div></div></> : <EmptyState compact title="没有匹配的题目与材料" detail="调整主题或观察指标筛选后再查看。"/>}</Panel>
    </div>
  </div>;
}
function MaterialCatalog({ value, indicatorFilter, topicIndicatorIds }: { value: unknown; indicatorFilter: string; topicIndicatorIds: Set<string> }) {
  const [expandedIndicator, setExpandedIndicator] = useState<string | null>(null);
  if (!value || typeof value !== 'object') return <EmptyState title="暂无材料目录" detail="目录接口没有返回可展示条目。"/>;
  const indicators = (value as Row).indicators;
  if (!Array.isArray(indicators) || !indicators.length) return <EmptyState title="当前运行没有教材目录条目" detail="指标与教材材料尚未建立目录关联。"/>;
  const visibleIndicators = (indicators as Row[]).filter(item => indicatorFilter ? String(item.indicator_id ?? '') === indicatorFilter : topicIndicatorIds.size === 0 || topicIndicatorIds.has(String(item.indicator_id ?? '')));
  if (!visibleIndicators.length) return <EmptyState compact title="没有匹配的教材来源" detail="调整主题或观察指标筛选后再查看。"/>;
  return <div className={styles.catalogList}>{visibleIndicators.map((item, index) => {
    const docs = Array.isArray(item.documents) ? item.documents as Row[] : [];
    const materials = Array.isArray(item.materials) ? item.materials as Row[] : [];
    const indicatorId = String(item.indicator_id ?? index);
    const expanded = expandedIndicator === indicatorId;
    return <article key={indicatorId} className={`${styles.catalogItem} ${expanded ? styles.catalogItemExpanded : ''}`}><button type="button" className={styles.catalogSummary} aria-expanded={expanded} onClick={() => setExpandedIndicator(current => current === indicatorId ? null : indicatorId)}><header><div><strong>{str(item.indicator_id)}</strong><small>{str(item.topic_id, '未关联主题')}</small></div></header><span className={styles.catalogExpandLabel}>{expanded ? '收起' : '查看来源与关联材料'}</span></button>
      {expanded && <div className={styles.catalogBody}>
        {Boolean(item.curriculum_locator) && <p className={styles.catalogLocator}>课标定位：{str(item.curriculum_locator)}</p>}{Boolean(item.textbook_locator) && <p className={styles.catalogLocator}>教材定位：{str(item.textbook_locator)}</p>}
        {docs.length > 0 && <div className={styles.documentList}>{docs.map((doc, docIndex) => <div key={`${String(doc.name)}-${docIndex}`}><NotebookTabs size={14}/><span>{str(doc.name)}</span><small>{doc.available ? `${str(doc.page_count, '页数未知')} 页` : '来源文件缺失'}</small></div>)}</div>}
        {materials.length > 0 && <div className={styles.materialTags}>{materials.map((material, materialIndex) => <span key={`${String(material.material_id)}-${materialIndex}`}><b>{str(material.material_id)}</b>{str(material.title, str(material.resource_type, '材料'))}</span>)}</div>}
      </div>}
    </article>;
  })}</div>;
}
