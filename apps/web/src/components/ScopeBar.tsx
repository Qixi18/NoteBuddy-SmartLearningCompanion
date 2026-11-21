import type { AnalysisRun } from '../api/types';
import type { NavigationView } from '../app/navigation';
import type { AnalysisScope } from '../app/hooks/useAnalysisScope';
import { nodeLabel } from '../app/glossary';

export function ScopeBar({ run, scope, path, view, onNavigate }: { run: AnalysisRun; scope: AnalysisScope; path: string; view?: NavigationView; onNavigate: (path: string) => void }) {
  const objective = run.objectives.find(item => item['指标编号'] === scope.indicatorId);
  const student = run.students.find(item => item['学生编号'] === scope.studentId);
  const node = (run.nodes ?? []).find(item => item['节点编号'] === scope.nodeId);
  const globalStudentRecommendation = path === '/recommendations' && view !== 'observe';
  return <section className="scope-bar" aria-label="当前分析范围">
    <span className="scope-bar-label">当前范围</span>
    <span className="scope-value">{globalStudentRecommendation ? '全部学习指标' : objective ? `${objective['指标编号']} · ${objective['观察指标']}` : '尚未选择学习指标'}</span>
    <span className="scope-separator" aria-hidden="true">·</span>
    <span className="scope-value">{globalStudentRecommendation ? '全部测验节点' : node ? nodeLabel(node) : scope.nodeId || '尚未选择测验节点'}</span>
    <span className="scope-separator" aria-hidden="true">·</span>
    {student
      ? <span className="scope-value">{student['学生编号']} · {student['模拟班级编号']}</span>
      : <><span className="scope-value">{scope.classId || '尚未选择班级'}</span><span className="scope-separator" aria-hidden="true">/</span><span className="scope-value">尚未选择学生</span></>}
    <nav className="scope-chain" aria-label="要求、表现与建议证据链">{([['/requirements', '学习要求'], ['/performance', '已有表现'], ['/recommendations', '学习建议']] as const).map(([target, label], index) => <span className="scope-chain-step" key={target}>{index > 0 && <span aria-hidden="true">→</span>}<a href={`#${target}`} aria-current={path === target ? 'page' : undefined} onClick={event => { event.preventDefault(); onNavigate(target); }}>{label}</a></span>)}</nav>
  </section>;
}
