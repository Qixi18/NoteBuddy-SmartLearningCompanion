import type { AnalysisRun } from '../../../api/types';
import { learningApi } from '../../../api/client';
import { Panel } from '../../../components/Panel';
export function ObjectivesPanel({ run }: { run: AnalysisRun }) {
  return <Panel title="学习要求">{run.objectives.map(objective => {
    const source = run.source_index.find(item => item.indicator_id === objective['指标编号']);
    const items = run.items.filter(item => item['指标编号'] === objective['指标编号']);
    const page = source?.source_check?.curriculum_file_page;
    return <details className="row" key={objective['指标编号']}><summary><strong>{objective['指标编号']}</strong> {objective['观察指标']}</summary>
      <small>{objective['主题']} · 课标页 {objective['课标文件页／正文页']} · 教材页 {objective['教材正文页']}</small>
      <p>关联材料：{items.map(item => item['材料编号']).join('、') || '无'}</p>
      <p>课标文件页：{page || '待核对'} {page && <a href={`${learningApi.sourceUrl('课程标准_2022.pdf')}#page=${page}`} target="_blank" rel="noopener">打开原页</a>}</p>
      <p>教材切片：{(source?.source_check?.textbook_slices || []).map(name => <a key={name} href={learningApi.sourceUrl(name)} target="_blank" rel="noopener">{name} </a>)}</p>
      <small className="warn">{source?.source_check?.curriculum_check || '来源待核对'}；{source?.source_check?.textbook_check || '教材待核对'}</small><p>主题目标：{objective['主题目标']}</p>
    </details>;
  })}</Panel>;
}
