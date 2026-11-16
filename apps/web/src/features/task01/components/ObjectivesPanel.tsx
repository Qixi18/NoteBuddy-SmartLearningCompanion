import type { AnalysisRun } from '../../../api/types';
import { learningApi } from '../../../api/client';
import { Panel } from '../../../components/Panel';

export function ObjectivesPanel({ run }: { run: AnalysisRun }) {
  return <Panel title="学习要求">{run.objectives.map(objective => {
    const source = run.source_index.find(item => item.indicator_id === objective['指标编号']);
    const items = run.items.filter(item => item['指标编号'] === objective['指标编号']);
    const topicCheck = source?.source_check;
    const indicatorCheck = source?.indicator_check;
    const page = topicCheck?.curriculum_file_page;
    return <details className="row" key={objective['指标编号']}><summary><strong>{objective['指标编号']}</strong> {objective['观察指标']}</summary>
      <small>{objective['主题']} · 课标页 {objective['课标文件页／正文页']} · 教材页 {objective['教材正文页']}</small>
      <p>关联材料：{items.map(item => item['材料编号']).join('、') || '无'}</p>
      <p>课标文件页：{page || '待核对'} {page && <a href={`${learningApi.sourceUrl('课程标准_2022.pdf')}#page=${page}`} target="_blank" rel="noopener">打开原页</a>}</p>
      <p>教材切片：{(topicCheck?.textbook_slices || []).map(name => <a key={name} href={learningApi.sourceUrl(name)} target="_blank" rel="noopener">{name} </a>)}</p>
      <small className="warn">主题课标核验：{topicCheck?.curriculum_check || '待核对'}；主题教材核验：{topicCheck?.textbook_check || '待核对'}。</small>
      <p>指标级课标定位：{indicatorCheck?.curriculum_locator || '待核对'}；指标级教材定位：{indicatorCheck?.textbook_locator || '待核对'}。</p>
      <small className="warn">指标核验状态：{source?.verification || 'pending'}；主题说明仅作定位参考，指标级页码与材料映射仍需人工确认。</small>
      {source?.integrity_issues?.length ? <small className="warn">关系/定位完整性问题：{source.integrity_issues.join('、')}</small> : null}
      <p>主题目标：{objective['主题目标']}</p>
    </details>;
  })}</Panel>;
}
