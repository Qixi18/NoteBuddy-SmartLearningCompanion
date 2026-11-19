import { useEffect, useState } from 'react';
import type { AnalysisRun, SourceVerification } from '../../../api/types';
import { learningApi } from '../../../api/client';
import { Panel } from '../../../components/Panel';
import { SourceVerificationEditor } from './SourceVerificationEditor';

function verificationLabel(status?: string) {
  switch (status) {
    case 'verified': return '已核验';
    case 'topic_checked_indicator_page_pending': return '主题已定位，指标页待核验';
    case 'invalid': return '来源异常，需核查';
    default: return '待核验';
  }
}

export function ObjectivesPanel({ run }: { run: AnalysisRun }) {
  const [selectedId, setSelectedId] = useState(run.objectives[0]?.['指标编号'] ?? '');
  const [sourceHistory, setSourceHistory] = useState<Record<string, SourceVerification[]>>({});
  const [sourceHistoryLoaded, setSourceHistoryLoaded] = useState(false);
  const [sourceHistoryFailed, setSourceHistoryFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setSourceHistory({});
    setSourceHistoryLoaded(false);
    setSourceHistoryFailed(false);
    learningApi.sourceVerifications().then(history => {
      if (!active) return;
      setSourceHistory(history);
      setSourceHistoryLoaded(true);
    }).catch(() => {
      if (!active) return;
      setSourceHistoryFailed(true);
      setSourceHistoryLoaded(true);
    });
    return () => { active = false; };
  }, [run.run_id]);
  const topics = [...new Set(run.objectives.map(objective => objective['主题'] || objective['主题编号']))];
  const objective = run.objectives.find(item => item['指标编号'] === selectedId) ?? run.objectives[0];
  if (!objective) return <Panel title="学习要求"><p>当前运行没有指标，无法核对学科来源。</p></Panel>;
  const source = run.source_index.find(item => item.indicator_id === objective['指标编号']);
  const latestSignoff = sourceHistory[objective['指标编号']]?.at(-1);
  const currentVerification = latestSignoff?.status ?? source?.verification;
  const verificationText = sourceHistoryFailed
    ? '签核记录暂不可用'
    : !sourceHistoryLoaded
      ? '正在读取签核记录'
      : verificationLabel(currentVerification);
  const items = run.items.filter(item => item['指标编号'] === objective['指标编号']);
  const topicCheck = source?.source_check;
  const indicatorCheck = source?.indicator_check;
  const page = topicCheck?.curriculum_file_page;
  return <div className="knowledge-layout">
    <Panel title="主题与指标目录"><p className="muted">{topics.length} 个数据主题 · {run.objectives.length} 项指标</p>
      {topics.map(topic => <section className="topic-group" key={topic}><h3>{topic} <small>{run.objectives.filter(item => (item['主题'] || item['主题编号']) === topic).length} 项</small></h3>
        {run.objectives.filter(item => (item['主题'] || item['主题编号']) === topic).map(item => <button type="button" className={`knowledge-option${objective['指标编号'] === item['指标编号'] ? ' selected' : ''}`} aria-current={objective['指标编号'] === item['指标编号'] ? 'true' : undefined} key={item['指标编号']} onClick={() => setSelectedId(item['指标编号'])}><strong>{item['指标编号']}</strong><span>{item['观察指标']}</span><small>关联题目 {run.items.filter(question => question['指标编号'] === item['指标编号']).length} 道 · {sourceHistoryLoaded && !sourceHistoryFailed ? verificationLabel(sourceHistory[item['指标编号']]?.at(-1)?.status ?? run.source_index.find(entry => entry.indicator_id === item['指标编号'])?.verification) : sourceHistoryFailed ? '签核记录暂不可用' : '正在读取签核记录'}</small></button>)}</section>)}
    </Panel>
    <Panel title="指标详情"><h3>{objective['指标编号']} · {objective['观察指标']}</h3><p>主题：{objective['主题'] || objective['主题编号']}</p><p>主题目标：{objective['主题目标'] || '未提供'}</p>
      <section className="source-detail"><h3>关联题目 · {items.length} 道</h3>{items.length ? items.map(item => <div className="row" key={item['材料编号']}><strong>{item['材料编号']}</strong><p>{item['题干或内容'] || '未提供题干'}</p><small>指标与题目关系：{verificationText}</small></div>) : <p>当前快照没有关联题目；不能据此判断知识覆盖。</p>}</section>
      <section className="source-detail"><h3>课程标准</h3><p>导入定位：{objective['课标文件页／正文页'] || '待核验'}；指标级定位：{indicatorCheck?.curriculum_locator || '待核对'}</p><p>主题课标核验：{topicCheck?.curriculum_check || '待核对'}。{page && <a href={`${learningApi.sourceUrl('课程标准_2022.pdf')}#page=${page}`} target="_blank" rel="noopener noreferrer">打开原页（文件第 {page} 页）</a>}</p></section>
      <section className="source-detail"><h3>教材来源</h3><p>导入定位：{objective['教材正文页'] || '待核验'}；指标级定位：{indicatorCheck?.textbook_locator || '待核对'}</p><p>主题教材核验：{topicCheck?.textbook_check || '待核对'}</p>{topicCheck?.textbook_slices?.length ? <p>原页：{topicCheck.textbook_slices.map(name => <a key={name} href={learningApi.sourceUrl(name)} target="_blank" rel="noopener noreferrer">{name} </a>)}</p> : <p>当前运行没有教材原页链接。</p>}</section>
      <p className="warn">指标关系状态：{verificationText}。主题说明仅供定位；以指标级核验记录判断材料关系。</p>
      {source?.integrity_issues?.length ? <p className="warn">关系或定位问题：{source.integrity_issues.join('、')}</p> : null}
      <SourceVerificationEditor run={run} indicatorId={objective['指标编号']} />
    </Panel>
  </div>;
}
