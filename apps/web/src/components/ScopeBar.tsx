import type { AnalysisRun } from '../api/types';
import type { AnalysisScope } from '../app/hooks/useAnalysisScope';

export function ScopeBar({ run, scope, path, onNavigate }: { run: AnalysisRun; scope: AnalysisScope; path: string; onNavigate: (path: string) => void }) {
  const objective = run.objectives.find(item => item['指标编号'] === scope.indicatorId);
  const student = run.students.find(item => item['学生编号'] === scope.studentId);
  return <section className="scope-bar" aria-label="当前分析范围">
    <span className="scope-bar-label">当前范围</span>
    <span className="scope-value">{objective ? `${objective['指标编号']} · ${objective['观察指标']}` : '尚未选择学习指标'}</span>
    <span className="scope-separator" aria-hidden="true">·</span>
    <span className="scope-value">{scope.nodeId || '尚未选择测验节点'}</span>
    <span className="scope-separator" aria-hidden="true">·</span>
    {student
      ? <span className="scope-value">{student['学生编号']} · {student['模拟班级编号']}</span>
      : <><span className="scope-value">{scope.classId || '尚未选择班级'}</span><span className="scope-separator" aria-hidden="true">/</span><span className="scope-value">尚未选择学生</span></>}
    <nav className="scope-chain" aria-label="要求、表现与建议证据链">{([['/requirements', '学习要求'], ['/performance', '已有表现'], ['/recommendations', '学习建议']] as const).map(([target, label], index) => <span className="scope-chain-step" key={target}>{index > 0 && <span aria-hidden="true">→</span>}<a href={`#${target}`} aria-current={path === target ? 'page' : undefined} onClick={event => { event.preventDefault(); onNavigate(target); }}>{label}</a></span>)}</nav>
  </section>;
}
