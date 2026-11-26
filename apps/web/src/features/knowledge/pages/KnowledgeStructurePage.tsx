import { ArrowRight, BookOpen, Check, FileSearch, Layers3, Link2, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, Loading, Notice, Panel } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import type { RunData } from '../../../types/api';
import { useKnowledgeCandidates, useSourceVerifications } from '../api';
import { KnowledgeModuleHeader } from '../components/KnowledgeModuleHeader';
import { useWorkbenchScope } from '../../shared/useWorkbenchScope';
import styles from '../../shared/WorkbenchPages.module.css';

type Row = Record<string, unknown>;
function isSyntheticVerification(row: Row | undefined) { return Boolean(row && ['reason', 'curriculum_locator', 'textbook_locator'].some(key => /合成|模拟验收|synthetic|mock/i.test(String(row[key] ?? '')))); }

function text(value: unknown, fallback = '—') {
  return value == null || value === '' ? fallback : String(value);
}

function field(row: Row, keys: string[], fallback: string) {
  for (const key of keys) if (row[key]) return String(row[key]);
  return fallback;
}

function groupObjectives(objectives: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const objective of objectives) {
    const topic = field(objective, ['主题名称', '主题编号'], '未分类主题');
    groups.set(topic, [...(groups.get(topic) ?? []), objective]);
  }
  return [...groups.entries()];
}

function CandidateList({ value }: { value: unknown }) {
  const candidates = value && typeof value === 'object' && Array.isArray((value as Row).candidates)
    ? (value as Row).candidates as Row[] : [];
  return candidates.length ? <div className={styles.candidateList}>{candidates.map((candidate, index) => <article key={`${text(candidate.target_indicator_id)}-${index}`}>
    <div><span>候选前置</span><b>{text(candidate.target_label, text(candidate.target_indicator_id))}</b><small>{text(candidate.target_indicator_id)} · {text(candidate.relation)}</small></div>
    <p>{text(candidate.evidence)}</p><small>依据规则：{candidate.rule === 'same_topic_previous' ? '同主题课程要求顺序' : candidate.rule === 'topic_teaching_order' ? '节点教学顺序' : text(candidate.rule)}</small>
  </article>)}</div> : <EmptyState title="暂无学习顺序候选" detail="当前课程顺序没有可解释的前置候选；不会自动建立知识依赖。"/>;
}

export function KnowledgeStructurePage({ run, selectedIndicator, search, verifications, candidates, candidatesPending, onSelectIndicator }: {
  run: RunData;
  selectedIndicator: string;
  search: string;
  verifications: Record<string, Row[]>;
  candidates?: Row;
  candidatesPending: boolean;
  onSelectIndicator: (id: string) => void;
}) {
  const groups = groupObjectives(run.objectives);
  const objective = run.objectives.find(row => String(row['指标编号'] ?? '') === selectedIndicator) ?? run.objectives[0];
  const topicId = objective ? text(objective['主题编号'], field(objective, ['主题名称'], '未分类主题')) : '';
  const topicName = objective ? field(objective, ['主题名称', '主题编号'], '未分类主题') : '';
  const topicRows = objective ? run.objectives.filter(row => text(row['主题编号'], field(row, ['主题名称'], '未分类主题')) === topicId) : [];
  const verifiedRelations: Array<Row & { sourceId: string }> = Object.entries(verifications).flatMap(([sourceId, history]) => {
    const latest = history.at(-1);
    if (latest?.status !== 'verified' || latest.stale || !Array.isArray(latest.knowledge_links)) return [];
    return (latest.knowledge_links as Row[]).map(link => ({ sourceId, synthetic: isSyntheticVerification(latest), ...link }));
  });
  const relatedItems = objective ? run.items.filter(row => String(row['指标编号'] ?? '') === String(objective['指标编号'] ?? '')) : [];

  return <>
    <div className={styles.structureColumns}>
      <Panel title="主题导航" icon={<Layers3 size={18}/> }>
        {groups.length ? <div className={styles.topicNavigation}>{groups.map(([topic, rows]) => {
          const topicKey = text(rows[0]?.['主题编号'], topic);
          const active = topicKey === topicId;
          const ids = rows.map(row => String(row['指标编号'] ?? '')).filter(Boolean);
          const itemCount = run.items.filter(item => ids.includes(String(item['指标编号'] ?? ''))).length;
          return <button key={topicKey} aria-current={active ? 'true' : undefined} className={`${styles.topicNavigationCard} ${active ? styles.topicNavigationActive : ''}`} onClick={() => onSelectIndicator(String(rows[0]?.['指标编号'] ?? ''))}>
            <span className={styles.topicNavigationIcon}><BookOpen size={17}/></span><span className={styles.topicNavigationCopy}><b>{topic}</b><small>{text(rows[0]?.['主题编号'], '主题编号未提供')} · {rows.length} 项指标</small></span><span className={styles.topicNavigationCounts}><span><Link2 size={13}/>{rows.length}</span><span><FileSearch size={13}/>{itemCount}</span></span>
          </button>;
        })}</div> : <EmptyState title="没有课程主题" detail="导入课程要求后显示主题导航。"/>}
      </Panel>

      <Panel title="知识结构图" icon={<Link2 size={18}/>} action={<span className={styles.structureLegend}><i/>课程层级</span>}>
        {objective ? <div className={styles.knowledgeMap} aria-label={`${topicName}主题下的课程指标层级`}>
          <div className={styles.knowledgeMapRoot}><BookOpen size={20}/><b>{topicName}</b><small>{topicRows.length} 项课程观察指标</small></div>
          <div className={styles.knowledgeMapBranches}>{topicRows.map((row, index) => {
            const id = String(row['指标编号'] ?? `indicator-${index}`);
            const active = id === selectedIndicator;
            return <div className={styles.knowledgeMapBranch} key={id}><span className={styles.knowledgeMapConnector}/><button aria-current={active ? 'true' : undefined} className={`${styles.knowledgeMapNode} ${active ? styles.knowledgeMapNodeActive : ''}`} onClick={() => onSelectIndicator(id)}><span className={styles.knowledgeMapNodeIcon}><Target size={15}/></span><span><b>{field(row, ['观察指标', '指标名称', '名称'], id)}</b><small>{id}</small></span><ArrowRight size={14}/></button></div>;
          })}</div>
          <p className={styles.knowledgeMapNote}>连线表示课程主题归属，不代表指标之间存在前置关系。</p>
        </div> : <EmptyState title="没有可展示的课程结构" detail="当前运行尚未提供主题和观察指标。"/>}
      </Panel>

      <Panel title="当前知识点详情" icon={<Target size={18}/> }>
        {objective ? <div className={styles.nodeDetail}>
          <span className={styles.itemId}>{String(objective['指标编号'] ?? selectedIndicator)}</span>
          <h3>{field(objective, ['观察指标', '指标名称', '名称'], '课程指标')}</h3>
          <p>所属主题：{topicName}</p>
          <p>学习要求：{field(objective, ['学习要求', '课程要求', '内容要求', '要求描述'], '当前数据未提供独立的学习要求文本。')}</p>
          <div className={styles.structureRelationStatus}><span>关联题目</span><b>{relatedItems.length} 道</b><span>关系状态</span><b>{verifiedRelations.filter(row => String(row.sourceId) === String(objective['指标编号']) || String(row.target_indicator_id) === String(objective['指标编号'])).length} 条已核验</b><span>当前来源记录</span><b>{isSyntheticVerification(verifications[String(objective['指标编号'])]?.at(-1)) ? '合成验收数据' : '按记录状态显示'}</b></div>
          <h4>相关题目</h4>
          {relatedItems.length ? <ul>{relatedItems.map((item, index) => <li key={`${String(item['材料编号'])}-${index}`}><Link to={{ pathname: `${routes.itemEvidence}/${encodeURIComponent(String(item['材料编号'] ?? ''))}`, search: new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(search)), indicator: String(objective['指标编号'] ?? '') }).toString() }}><b>{text(item['材料编号'])}</b><span>{field(item, ['题干或内容', '题目内容', '材料名称'], '未提供题目内容')}</span><ArrowRight size={14}/></Link></li>)}</ul> : <EmptyState title="没有关联题目" detail="当前数据没有将题目映射到该指标。"/>}
        </div> : <EmptyState title="选择一个课程指标" detail="指标详情和关联题目会显示在这里。"/>}
      </Panel>
    </div>

    <Panel title="主题关联与来源状态" icon={<Layers3 size={18}/> }>
      <p className={styles.sectionLead}>汇总当前课程数据中的主题指标、关联题目和有效来源核验。课程未提供的主题关系或常见难点不会从设计示例补入。</p>
      {groups.length ? <div className={styles.topicSummaryGrid}>{groups.map(([topic, rows]) => {
        const ids = rows.map(row => String(row['指标编号'] ?? '')).filter(Boolean);
        const topicItems = run.items.filter(item => ids.includes(String(item['指标编号'] ?? '')));
        const latestSources = ids.map(id => verifications[id]?.at(-1));
        const verifiedCount = latestSources.filter(latest => latest?.status === 'verified' && !latest.stale).length;
        const syntheticCount = latestSources.filter(latest => latest?.status === 'verified' && !latest.stale && isSyntheticVerification(latest)).length;
        return <article className={styles.topicSummaryCard} key={topic}><header><b>{topic}</b><small>{text(rows[0]?.['主题编号'], '主题编号未提供')}</small></header><div><span>课程指标</span><strong>{rows.length}</strong><span>关联题目 / 材料</span><strong>{topicItems.length}</strong></div><p>当前有效核验记录：{verifiedCount} / {ids.length} 项指标{syntheticCount ? `；其中 ${syntheticCount} 项为合成验收数据` : ''}</p><small>{rows.map(row => `${text(row['指标编号'])} ${field(row, ['观察指标', '指标名称', '名称'], '')}`.trim()).join('；')}</small></article>;
      })}</div> : <EmptyState title="暂无主题关系摘要" detail="当前课程没有可汇总的主题指标。"/>}
    </Panel>

    <div className={styles.twoColumns}>
      <Panel title="学习顺序候选" icon={<Link2 size={18}/>} action={<span className={styles.muted}>{String(objective?.['指标编号'] ?? selectedIndicator)}</span>}>{candidatesPending ? <Loading label="读取候选关系…"/> : candidates ? <CandidateList value={candidates}/> : <EmptyState title="没有可展示的关系候选" detail="当前指标暂无学习顺序候选；不会推测或补画关系。"/>}</Panel>
      <Panel title="已核验的前置关系" icon={<Check size={18}/> }>{verifiedRelations.length ? <div className={styles.confirmedRelationList}>{verifiedRelations.map((relation, index) => <article key={`${String(relation.sourceId)}-${String(relation.target_indicator_id)}-${index}`}><span>{String(relation.target_indicator_id ?? '未知指标')}</span><ArrowRight size={14}/><b>{String(relation.sourceId)}</b><small>{text(relation.relation, '前置知识')} · {text(relation.evidence, '未提供核验依据')}{relation.synthetic ? ' · 合成验收记录' : ''}</small></article>)}</div> : <EmptyState title="暂无已核验前置关系" detail="教师完成课程关系核验后，确认关系会显示在这里。"/>}</Panel>
    </div>
  </>;
}

export function KnowledgeStructurePageRoute() {
  const { run, runQuery, scope, search, setIndicator } = useWorkbenchScope();
  const selectedIndicator = scope.indicatorId || String(run?.objectives[0]?.['指标编号'] ?? '');
  const verifications = useSourceVerifications(run?.run_id ?? '');
  const candidates = useKnowledgeCandidates(run?.run_id ?? '', selectedIndicator);
  if (runQuery.isPending) return <Loading/>;
  if (!run) return <EmptyState title="当前没有分析运行" detail="请先在教学工作台导入课程与学情数据。" action={<Link className={styles.linkButton} to={routes.dashboard}>前往教学工作台 <ArrowRight size={15}/></Link>}/>;
  return <div className={styles.pageStack}>
    <KnowledgeModuleHeader kind="structure" search={search}/>
    <Notice>主题与指标层级来自当前课程要求。中部连线只表示主题归属；前置关系只有教师已核验后才会显示为已确认。候选关系单独标记，不作为既定知识依赖。</Notice>
    <KnowledgeStructurePage run={run} selectedIndicator={selectedIndicator} search={search} verifications={verifications.data ?? {}} candidates={candidates.data} candidatesPending={candidates.isPending} onSelectIndicator={setIndicator}/>
  </div>;
}
