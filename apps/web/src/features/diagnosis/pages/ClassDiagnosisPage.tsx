import { ArrowRight, BookOpen, CircleHelp, Layers3, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorBox, Loading } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import { useCases, useClassInsights } from '../api';
import { ClassDiagnosis } from '../components/ClassDiagnosis';
import { useWorkbenchScope } from '../../shared/useWorkbenchScope';
import { objectiveLabel } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function ClassDiagnosisPage() {
  const { run, runQuery, scope } = useWorkbenchScope();
  const selectedClass = scope.classId || String(run?.students[0]?.['模拟班级编号'] ?? '');
  const selectedNode = scope.nodeId || String(run?.nodes[0]?.['节点编号'] ?? '');
  const insights = useClassInsights(run?.run_id ?? '', selectedNode);
  const cases = useCases(run?.run_id ?? '', Boolean(run));

  if (runQuery.isPending) return <Loading/>;
  if (!run) return <EmptyState title="当前没有分析运行" detail="请先在教学工作台导入课程与学情数据。" action={<Link className={styles.linkButton} to={routes.dashboard}>前往教学工作台 <ArrowRight size={15}/></Link>}/>;
  if (insights.isError) return <ErrorBox message={(insights.error as Error).message} onRetry={() => void insights.refetch()}/>;

  const objectiveName = (id: string) => objectiveLabel(run.objectives, id);
  return <div className={styles.pageStack}>
    <div className={styles.classScopeBar} aria-label="班级诊断范围"><span><Users size={15}/><b>班级范围</b> {selectedClass || '未选择'}</span><span><BookOpen size={15}/><b>测验节点</b> {selectedNode}</span><span><Layers3 size={15}/><b>分析维度</b> 主题表现 · 共同题目比较</span></div>
    <ClassDiagnosis insights={insights.data} cases={cases.data ?? []} classId={selectedClass} nodeId={selectedNode} run={run} objectiveName={objectiveName}/>
    {insights.data?.limitations.map((item, index) => <p className={styles.limitation} key={index}><CircleHelp size={14}/>{item}</p>)}
  </div>;
}
