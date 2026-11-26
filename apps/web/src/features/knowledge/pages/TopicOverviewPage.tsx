import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, CircleHelp, FileSearch, Layers3, NotebookTabs, Sparkles, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataTable, EmptyState, ErrorBox, Loading, Notice, Panel } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import type { RunData } from '../../../types/api';
import { api, postJson } from '../api';
import { KnowledgeModuleHeader } from '../components/KnowledgeModuleHeader';
import { useWorkbenchScope } from '../../shared/useWorkbenchScope';
import { isSyntheticVerification, label, str } from '../../shared/workbenchTypes';
import type { Row } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function TopicOverviewPage() {
  const { run, runQuery, scope, search } = useWorkbenchScope();
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ['material-catalog', run?.run_id], queryFn: () => api<Row>('/api/material-catalog'), enabled: Boolean(run) });
  const verifications = useQuery({ queryKey: ['source-verifications', run?.run_id], queryFn: () => api<Record<string, Row[]>>('/api/source-verifications'), enabled: Boolean(run) });
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
    verifications={verifications.data ?? {}}
    verificationPending={verifications.isPending}
    selectedStudent={selectedStudent}
    selectedIndicator={selectedIndicator}
    selectedNode={selectedNode}
    search={search}
    onSourcesSaved={async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['source-verifications'] }),
        queryClient.invalidateQueries({ queryKey: ['material-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['run'] }),
      ]);
    }}
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
  verification: 'verified' | 'pending' | 'stale' | 'partial';
  verification_label: string;
};

function topicOverviewRows(objectives: Row[], items: Row[], catalog: Row | undefined, histories: Record<string, Row[]>): TopicOverviewRow[] {
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
    const latestStates = indicatorIds.map(id => (histories[id] ?? []).at(-1));
    const verifiedCount = latestStates.filter(row => row?.status === 'verified' && !row.stale).length;
    const hasStale = latestStates.some(row => row?.stale || row?.status === 'rejected');
    const verification: TopicOverviewRow['verification'] = indicatorIds.length > 0 && verifiedCount === indicatorIds.length ? 'verified' : hasStale ? 'stale' : verifiedCount > 0 ? 'partial' : 'pending';
    const hasSyntheticVerification = latestStates.some(row => row?.status === 'verified' && !row.stale && isSyntheticVerification(row));
    const verificationLabel = verification === 'verified' ? hasSyntheticVerification ? '含合成验收记录' : '已核验' : verification === 'stale' ? '核验需更新' : verification === 'partial' ? `部分核验 ${verifiedCount}/${indicatorIds.length}` : '待核验';
    const topicName = label(rows[0], ['主题名称'], topicId);
    return { order: index + 1, topic_id: topicId, topic_name: topicName, requirements, indicators, source_names: sourceNames, material_ids: materialIds, verification, verification_label: verificationLabel };
  });
}
function TopicOverviewView({ run, catalog, catalogPending, catalogError, verifications, verificationPending, selectedStudent, selectedIndicator, selectedNode, search, onSourcesSaved }: {
  run: RunData;
  catalog?: Row;
  catalogPending: boolean;
  catalogError: Error | null;
  verifications: Record<string, Row[]>;
  verificationPending: boolean;
  selectedStudent: string;
  selectedIndicator: string;
  selectedNode: string;
  search: string;
  onSourcesSaved: () => Promise<void>;
}) {
  const topics = topicOverviewRows(run.objectives, run.items, catalog, verifications);
  const linkedById = new Map<string, Row>();
  for (const entry of Array.isArray(catalog?.indicators) ? catalog.indicators as Row[] : []) {
    for (const material of Array.isArray(entry.materials) ? entry.materials as Row[] : []) linkedById.set(String(material.material_id ?? ''), material);
  }
  return <div className={styles.pageStack}>
    <KnowledgeModuleHeader kind="overview" search={search}/>
    <Notice>本页内容取自当前课程运行快照；核验状态反映记录状态。若定位依据为合成验收数据，会明确标出，不代表真实课标或教材已完成核验。</Notice>
    <Panel title="主题学习要求与资源映射" icon={<Layers3 size={18}/>}>{topics.length ? <div className={styles.topicOverviewTable}><DataTable columns={[
      { key: 'order', title: '序号', render: row => <span className={styles.topicOrder}>{String(row.order)}</span> },
      { key: 'topic', title: '主题', render: row => <><strong>{String(row.topic_name)}</strong><small className={styles.secondaryCell}>{String(row.topic_id)}</small></> },
      { key: 'requirements', title: '学习要求', render: row => <ul className={styles.requirementList}>{(row.requirements as string[]).length ? (row.requirements as string[]).map((requirement, index) => <li key={`${String(row.topic_id)}-${index}`}>{requirement}</li>) : <li>当前数据未提供独立的学习要求文本。</li>}</ul> },
      { key: 'indicators', title: '观察指标', render: row => <div className={styles.inlineTags}>{(row.indicators as Array<{ id: string; name: string }>).map(item => <Link key={item.id} to={{ pathname: routes.knowledgeStructure, search: new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(search)), indicator: item.id }).toString() }}><b>{item.id}</b> {item.name}</Link>)}</div> },
      { key: 'sources', title: '教材 / 来源', render: row => <span className={styles.clamped}>{(row.source_names as string[]).length ? (row.source_names as string[]).join('；') : catalogPending ? '正在读取来源…' : '当前目录未提供来源定位'}</span> },
      { key: 'materials', title: '关联题目 / 材料', render: row => (row.material_ids as string[]).length ? (row.material_ids as string[]).join('、') : '暂无关联材料' },
      { key: 'verification', title: '来源核验', render: row => <span className={`${styles.status} ${row.verification_label === '已核验' ? styles.verified : row.verification_label === '含合成验收记录' ? styles.syntheticStatus : ''}`}>{String(row.verification_label)}</span> },
    ]} rows={topics as unknown as Row[]}/></div>:<EmptyState title="没有课程主题" detail="导入课程要求后，此处会按真实主题汇总学习要求和资源映射。"/>}</Panel>
    <div className={styles.overviewColumns}>
      <Panel title="主题重点提示" icon={<Target size={18}/>}>{topics.length ? <div className={styles.topicFocusList}>{topics.map(topic => <article key={topic.topic_id}><header><span className={styles.topicOrder}>{topic.order}</span><div><strong>{topic.topic_name}</strong><small>{topic.indicators.length} 项课程观察指标</small></div></header><ul className={styles.requirementList}>{topic.requirements.length ? topic.requirements.map((item, index) => <li key={`${topic.topic_id}-req-${index}`}>{item}</li>) : <li>课程数据未提供独立的学习要求文本。</li>}</ul><small className={styles.topicFocusMeta}>指标：{topic.indicators.map(item => item.id).join('、') || '未提供'}</small></article>)}</div> : <EmptyState title="没有学习要求" detail="导入课程要求后显示主题和要求。"/>}</Panel>
      <Panel title="教材 / 来源映射" icon={<NotebookTabs size={18}/>}>{catalogPending ? <Loading/> : catalog ? <MaterialCatalog value={catalog}/> : <EmptyState title="来源目录暂不可用" detail={catalogError?.message ?? '当前运行没有可用的来源目录。'}/>}<div className={styles.sourceSummary}><span><strong>{Object.values(verifications).flat().filter(row => row.status === 'verified' && !row.stale).length}</strong> 条当前有效记录（含合成验收数据）</span><span><strong>{run.objectives.length}</strong> 项观察指标</span><span>{verificationPending ? '正在读取核验记录…' : '课程或材料变更后，相关核验会标记为过期。'}</span></div></Panel>
      <Panel title="相关题目 / 材料列表" icon={<FileSearch size={18}/>}>{run.items.length ? <DataTable columns={[
        { key: 'id', title: '编号', render: row => String(row['材料编号'] ?? '—') },
        { key: 'type', title: '类型', render: row => <span className={styles.typeTag}>{String(linkedById.get(String(row['材料编号'] ?? ''))?.resource_type ?? '题目')}</span> },
        { key: 'topic', title: '主题归属', render: row => label(run.objectives.find(objective => String(objective['指标编号'] ?? '') === String(row['指标编号'] ?? '')) ?? {}, ['主题名称', '主题编号'], '未关联主题') },
        { key: 'content', title: '内容简述', render: row => <span className={styles.clamped}>{label(row, ['题干或内容', '题目内容', '材料名称'], '当前数据未提供题目内容')}</span> },
        { key: 'action', title: '操作', render: row => <Link to={{ pathname: `${routes.itemEvidence}/${encodeURIComponent(String(row['材料编号'] ?? ''))}`, search: new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(search)), indicator: String(row['指标编号'] ?? selectedIndicator), student: selectedStudent, node: selectedNode }).toString() }}>查看证据</Link> },
      ]} rows={run.items}/>:<EmptyState title="当前运行没有关联题目" detail="题目材料会按导入数据展示，不会补入设计稿中的示例编号。"/>}</Panel>
    </div>
    <div className={styles.overviewGuide}><strong><CircleHelp size={18}/>这套映射如何支持后续分析？</strong><span><Check size={17}/>明确课程学习要求</span><span><Layers3 size={17}/>关联课标与教材来源</span><span><Target size={17}/>为学情分析提供主题维度</span><span><Sparkles size={17}/>为教学建议提供课程依据</span></div>
    <details className={styles.sourceWorkflow}><summary><Check size={17}/>教师来源核验 <small>编辑当前指标的来源定位并记录核验版本</small></summary><SourceVerificationEditor objectives={run.objectives} items={run.items} histories={verifications} onSaved={onSourcesSaved}/></details>
  </div>;
}
function MaterialCatalog({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') return <EmptyState title="暂无材料目录" detail="目录接口没有返回可展示条目。"/>;
  const indicators = (value as Row).indicators;
  if (!Array.isArray(indicators) || !indicators.length) return <EmptyState title="当前运行没有教材目录条目" detail="指标与教材材料尚未建立目录关联。"/>;
  return <div className={styles.catalogList}>{(indicators as Row[]).map((item, index) => {
    const docs = Array.isArray(item.documents) ? item.documents as Row[] : [];
    const materials = Array.isArray(item.materials) ? item.materials as Row[] : [];
    const syntheticVerification = /合成|模拟验收|synthetic|mock/i.test(`${String(item.curriculum_locator ?? '')} ${String(item.textbook_locator ?? '')}`);
    return <article key={String(item.indicator_id ?? index)}><header><div><strong>{str(item.indicator_id)}</strong><small>{str(item.topic_id, '未关联主题')}</small></div><span className={`${styles.status} ${item.source_status === 'verified' && !item.source_stale ? syntheticVerification ? styles.syntheticStatus : styles.verified : ''}`}>{item.source_stale ? '核验已过期' : item.source_status === 'verified' ? syntheticVerification ? '合成验收记录' : '来源已核验' : '待核验'}</span></header>
      {Boolean(item.curriculum_locator) && <p className={styles.catalogLocator}>课标定位：{str(item.curriculum_locator)}</p>}{Boolean(item.textbook_locator) && <p className={styles.catalogLocator}>教材定位：{str(item.textbook_locator)}</p>}
      {docs.length > 0 && <div className={styles.documentList}>{docs.map((doc, docIndex) => <div key={`${String(doc.name)}-${docIndex}`}><NotebookTabs size={14}/><span>{str(doc.name)}</span><small>{doc.available ? `${str(doc.page_count, '页数未知')} 页` : '来源文件缺失'}</small></div>)}</div>}
      {materials.length > 0 && <div className={styles.materialTags}>{materials.map((material, materialIndex) => <span key={`${String(material.material_id)}-${materialIndex}`}><b>{str(material.material_id)}</b>{str(material.title, str(material.resource_type, '材料'))}{material.verified ? ' · 已核验' : ''}</span>)}</div>}
    </article>;
  })}</div>;
}
function SourceVerificationEditor({ objectives, items, histories, onSaved }: {
  objectives: Row[];
  items: Row[];
  histories: Record<string, Row[]>;
  onSaved: () => Promise<void>;
}) {
  const [indicatorId, setIndicatorId] = useState(String(objectives[0]?.['指标编号'] ?? ''));
  const linkedMaterials = items.filter(item => String(item['指标编号'] ?? '') === indicatorId);
  const history = histories[indicatorId] ?? [];
  const latest = history.at(-1);
  return <Panel title="教师来源核验" icon={<Check size={18}/> }>
    {objectives.length ? <>
      <label className={styles.verificationIndicator}>选择观察指标<select value={indicatorId} onChange={event => setIndicatorId(event.target.value)}>{objectives.map((row, index) => <option key={String(row['指标编号'] ?? index)} value={String(row['指标编号'] ?? '')}>{String(row['指标编号'] ?? '未知指标')} · {label(row, ['观察指标', '指标名称', '名称'], '课程指标')}</option>)}</select></label>
      <div className={styles.verificationContext}><span>本次会核对该指标关联的全部题目材料，共 {linkedMaterials.length} 项。</span><span>当前记录：{latest ? `第 ${str(latest.version)} 版 · ${str(latest.status)}${latest.stale ? ' · 已过期' : ''}` : '尚无核验记录'}</span></div>
      <SourceVerificationForm key={`${indicatorId}-${str(latest?.version, '0')}`} indicatorId={indicatorId} materialIds={linkedMaterials.map(row => String(row['材料编号'] ?? '')).filter(Boolean)} latest={latest} onSaved={onSaved}/>
    </> : <EmptyState title="没有可核验的观察指标" detail="导入课程要求后，才能记录来源核验。"/>}
  </Panel>;
}
function SourceVerificationForm({ indicatorId, materialIds, latest, onSaved }: {
  indicatorId: string;
  materialIds: string[];
  latest?: Row;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState(String(latest?.status ?? 'pending'));
  const [curriculum, setCurriculum] = useState(String(latest?.curriculum_locator ?? ''));
  const [textbook, setTextbook] = useState(String(latest?.textbook_locator ?? ''));
  const [reviewer, setReviewer] = useState(String(latest?.reviewer ?? ''));
  const [reason, setReason] = useState(String(latest?.reason ?? ''));
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => api<Row>('/api/source-verification', postJson({
      indicator_id: indicatorId,
      status,
      curriculum_locator: curriculum.trim(),
      textbook_locator: textbook.trim(),
      material_ids: materialIds,
      knowledge_links: Array.isArray(latest?.knowledge_links) ? latest.knowledge_links : [],
      rubric_mappings: Array.isArray(latest?.rubric_mappings) ? latest.rubric_mappings : [],
      resource_links: Array.isArray(latest?.resource_links) ? latest.resource_links : [],
      expected_version: typeof latest?.version === 'number' ? latest.version : 0,
      reviewer: reviewer.trim(),
      reason: reason.trim(),
    })),
    onSuccess: async () => {
      await onSaved();
      await queryClient.invalidateQueries({ queryKey: ['source-verifications'] });
    },
  });
  const verified = status === 'verified';
  return <form className={styles.verificationForm} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); save.mutate(); }}>
    <div className={styles.verificationFields}>
      <label>课标定位<input value={curriculum} onChange={event => setCurriculum(event.target.value)} placeholder="例如：课程标准章节 / 页码" required={verified}/></label>
      <label>教材定位<input value={textbook} onChange={event => setTextbook(event.target.value)} placeholder="例如：教材版本、册次、章节与页码" required={verified}/></label>
      <label>核验人<input value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="教师姓名" required={verified}/></label>
      <label>核验依据<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="说明如何核对课标、教材和题目关联" required={verified} rows={3}/></label>
      <label>保存状态<select value={status} onChange={event => setStatus(event.target.value)}><option value="pending">待核验</option><option value="verified">已核验</option><option value="rejected">不通过</option></select></label>
    </div>
    <div className={styles.verificationMaterials}><b>关联题目材料</b>{materialIds.length ? materialIds.map(id => <span key={id}>{id}</span>) : <small>当前指标没有关联题目；后端不允许将空材料集标为已核验。</small>}</div>
    {verified && <Notice>提交后将绑定当前运行的来源指纹；后续课程或材料变化会使核验记录过期。候选知识关系不会自动签核。</Notice>}
    <div className={styles.reviewActions}><button type="submit" disabled={save.isPending || (verified && materialIds.length === 0)}><Check size={15}/>{save.isPending ? '正在保存…' : '保存核验记录'}</button></div>
    {save.isSuccess && <Notice>核验记录已保存，新版本已关联当前数据来源。</Notice>}{save.isError && <ErrorBox message={(save.error as Error).message}/>}
  </form>;
}
