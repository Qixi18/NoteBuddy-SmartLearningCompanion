import { useState } from 'react';
import type { CaseSuggestion, Student } from '../../api/types';
import { Panel } from '../../components/Panel';
export function ExportPanel({ students, suggestions, onExport }: { students: Student[]; suggestions: CaseSuggestion[]; onExport: (ids: string[]) => void }) {
  const [ids, setIds] = useState<string[]>(['', '', '']);
  const options = students.map(item => item['学生编号']);
  const choose = (index: number, value: string) => setIds(old => { const next = [...old]; next[index] = value; return next; });
  const selected = [0, 1, 2].map(index => ids[index] || '');
  const uniqueReady = selected.every(id => Boolean(id) && options.includes(id)) && new Set(selected).size === 3;
  return <Panel title="三名案例与成果导出"><p className="muted">候选依据和样本限制请在上方逐项核对。选择三名不同学生后，服务端仍会执行最终校验。</p>
    {suggestions.map(item => <p className="row" key={`${item.type}-${item.student_id}`}><strong>{item.type}：{item.student_id}</strong> {item.reason} <small>依据记录：{item.evidence_record_ids.join('、') || '暂无证据'}</small></p>)}
    <div className="grid">{[0, 1, 2].map(index => <label key={index}>案例{['一', '二', '三'][index]}<select value={selected[index]} onChange={event => choose(index, event.target.value)}><option value="">请选择学生</option>{options.map(id => <option key={id} value={id}>{id}</option>)}</select></label>)}</div>
    {!uniqueReady && <p className="muted" role="status">请选择三名不同的学生。重复选择会阻止导出。</p>}
    <p className="muted">成果包包含当前 API 提供的结构化数据和字段说明，不自动生成完整案例叙述。</p>
    <details className="export-preview"><summary>查看成果包内容与字段口径</summary>
      <ul>
        <li><strong>运行与质量：</strong><code>manifest.json</code>、<code>data_quality.json</code>、<code>field_dictionary.json</code></li>
        <li><strong>目标与来源：</strong><code>learning_objectives.json/csv</code>、<code>items.json</code>、<code>source_index.json</code>、<code>course_relations.json/csv</code></li>
        <li><strong>班级、学生与节点统计：</strong><code>class_summary.json</code>、<code>student_summary.json</code>、<code>all_metrics.json</code>、<code>node_scoped_metrics.json</code>、<code>observations.json</code>、<code>node_observations.json</code></li>
        <li><strong>案例与作答证据：</strong><code>student_cases.json</code>、<code>responses.json</code>、<code>raw_responses.json</code>、<code>evidence_index.json</code>、<code>rubric_observations.json</code></li>
        <li><strong>建议与复核历史：</strong><code>recommendations.json</code>、<code>pending_review.json</code>、<code>teacher_review_history.json</code></li>
        <li><strong>表格和说明：</strong><code>metrics.csv</code>、<code>字段与口径说明.md</code></li>
      </ul>
      <p className="muted">案例叙述仍需人工补充背景、证据解释和课堂反思；字段口径文件说明有效评分分母、节点统计及待复核状态。</p>
    </details>
    <button disabled={!uniqueReady} onClick={() => onExport(selected)}>下载成果包</button>
  </Panel>;
}
