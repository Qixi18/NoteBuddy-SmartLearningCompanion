import type { AnalysisRun } from '../../../api/types';
import { learningApi } from '../../../api/client';
import { Panel } from '../../../components/Panel';

export function ObjectivesPanel({ run }: { run: AnalysisRun }) {
  const topics = [...new Set(run.objectives.map(objective => objective['主题'] || objective['主题编号']))];
  return <Panel title="学习要求"><p className="muted">{topics.length} 个数据主题 · {run.objectives.length} 个目标/观察指标。关系列表来自当前导入快照，不代表已完成赛题覆盖核验。</p>{topics.map(topic => <section className="topic-group" key={topic}><h3>{topic} <small>{run.objectives.filter(objective => (objective['主题'] || objective['主题编号']) === topic).length} 项</small></h3>{run.objectives.filter(objective => (objective['主题'] || objective['主题编号']) === topic).map(objective => {
    const source = run.source_index.find(item => item.indicator_id === objective['指标编号']);
    const items = run.items.filter(item => item['指标编号'] === objective['指标编号']);
    const topicCheck = source?.source_check;
    const indicatorCheck = source?.indicator_check;
    const page = topicCheck?.curriculum_file_page;
    return <details className="row" key={objective['指标编号']}><summary><strong>{objective['指标编号']}</strong> {objective['观察指标']} · 关联题目 {items.length} 道</summary>
      <small>{objective['主题'] || objective['主题编号']} · 课标页 {objective['课标文件页／正文页'] || '待核验'} · 教材页 {objective['教材正文页'] || '待核验'}</small>
      <p>关联题目：{items.length ? items.map(item => `${item['材料编号']}${item['题干或内容'] ? `（${item['题干或内容']}）` : ''}`).join('；') : '无关联题目'}</p>
      <p>课标文件页：{page || '待核对'} {page && <a href={`${learningApi.sourceUrl('课程标准_2022.pdf')}#page=${page}`} target="_blank" rel="noopener">打开原页</a>}</p>
      <p>教材切片：{(topicCheck?.textbook_slices || []).map(name => <a key={name} href={learningApi.sourceUrl(name)} target="_blank" rel="noopener">{name} </a>)}</p>
      <small className="warn">主题课标核验：{topicCheck?.curriculum_check || '待核对'}；主题教材核验：{topicCheck?.textbook_check || '待核对'}。</small>
      <p>指标级课标定位：{indicatorCheck?.curriculum_locator || '待核对'}；指标级教材定位：{indicatorCheck?.textbook_locator || '待核对'}。</p>
      <small className="warn">指标核验状态：{source?.verification || 'pending'}；主题说明仅作定位参考，指标级页码与材料映射仍需人工确认。</small>
      {source?.integrity_issues?.length ? <small className="warn">关系/定位完整性问题：{source.integrity_issues.join('、')}</small> : null}
      <p>主题目标：{objective['主题目标']}</p>
    </details>;
  })}</section>)}</Panel>;
}
