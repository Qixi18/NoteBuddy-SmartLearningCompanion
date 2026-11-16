import { useWorkbench } from './hooks/useWorkbench';
import { ImportPanel } from '../features/import/ImportPanel';
import { QualityPanel } from '../features/task02/components/QualityPanel';
import { ClassPanel } from '../features/task02/components/ClassPanel';
import { ObjectivesPanel } from '../features/task01/components/ObjectivesPanel';
import { StudentPanel } from '../features/task02/components/StudentPanel';
import { EvidencePanel } from '../features/task02/components/EvidencePanel';
import { ReviewPanel } from '../features/task03/components/ReviewPanel';
import { ExportPanel } from '../features/export/ExportPanel';

export function App() {
  const workbench = useWorkbench();
  const { run, reviews, suggestions, student, indicator, node, draft, message, error, reviewKey } = workbench;

  return <>
    <header><h1>智慧学伴 · 证据工作台</h1><p>课程要求 → 作答证据 → 学情诊断 → 教学建议</p></header>
    <main>
      <ImportPanel onImported={async id => { await workbench.refresh(); workbench.announce(`导入完成：${id}`); }} onMessage={workbench.announce} />
      <p id="message" className={error ? 'error' : ''} role="status">{message}</p>
      {run && <>
        <div className="grid"><QualityPanel run={run} /><ClassPanel run={run} /></div>
        <div className="grid"><ObjectivesPanel run={run} /><StudentPanel run={run} student={student} indicator={indicator} onStudent={workbench.setStudent} onIndicator={workbench.setIndicator} /></div>
        <EvidencePanel run={run} student={student} indicator={indicator} />
        <ReviewPanel student={student} indicator={indicator} node={node} nodes={[...new Set(run.responses.filter(row => row['学生编号'] === student && run.items.some(item => item['材料编号'] === row['材料编号'] && item['指标编号'] === indicator)).map(row => row['节点编号']))]} onNode={workbench.setNode} review={reviews[reviewKey]?.at(-1)} draft={draft} onDraft={workbench.makeDraft} onSave={workbench.saveReview} />
        <ExportPanel students={run.students} suggestions={suggestions} onExport={workbench.exportCases} />
      </>}
    </main>
  </>;
}
