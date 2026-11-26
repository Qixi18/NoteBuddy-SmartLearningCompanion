import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, Loading } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import { api, useClassInsights } from '../api';
import { EvidenceDetail } from '../components/EvidenceDetail';
import { ScopeSelectors } from '../components/ScopeSelectors';
import { useWorkbenchScope } from '../../shared/useWorkbenchScope';
import { label, objectiveLabel } from '../../shared/workbenchTypes';
import type { Bundle, Claim } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function EvidenceDetailPage() {
  const { run, runQuery, scope, search, setIndicator, setStudent } = useWorkbenchScope();
  const params = useParams();
  const selectedStudent = scope.studentId || String(run?.students.find(item => String(item['模拟班级编号'] ?? '') === scope.classId)?.['学生编号'] ?? run?.students[0]?.['学生编号'] ?? '');
  const selectedIndicator = scope.indicatorId || String(run?.objectives[0]?.['指标编号'] ?? '');
  const selectedNode = scope.nodeId || String(run?.nodes[0]?.['节点编号'] ?? '');
  const selectedClass = scope.classId || String(run?.students[0]?.['模拟班级编号'] ?? '');
  const insights = useClassInsights(run?.run_id ?? '', selectedNode);
  const studentInsights = useQuery({
    queryKey: ['student-insights', run?.run_id, selectedNode, selectedStudent, selectedIndicator],
    queryFn: () => api<{ scope: Record<string, string>; claims: Claim[] }>(`/api/student-insights?student=${encodeURIComponent(selectedStudent)}&indicator=${encodeURIComponent(selectedIndicator)}&node=${encodeURIComponent(selectedNode)}`),
    enabled: Boolean(run && selectedStudent && selectedIndicator && selectedNode),
  });
  const evidence = useQuery({
    queryKey: ['evidence-bundle', run?.run_id, selectedNode, selectedStudent, selectedIndicator],
    queryFn: () => api<Bundle>(`/api/evidence-bundle?student=${encodeURIComponent(selectedStudent)}&indicator=${encodeURIComponent(selectedIndicator)}&node=${encodeURIComponent(selectedNode)}`),
    enabled: Boolean(run && selectedStudent && selectedIndicator && selectedNode),
  });

  if (runQuery.isPending) return <Loading/>;
  if (!run) return <EmptyState title="当前没有分析运行" detail="请先在教学工作台导入课程与学情数据。" action={<Link className={styles.linkButton} to={routes.dashboard}>前往教学工作台 <ArrowRight size={15}/></Link>}/>;

  const objectiveName = (id: string) => objectiveLabel(run.objectives, id);
  return <div className={styles.pageStack}>
    <ScopeSelectors run={run} selectedStudent={selectedStudent} selectedIndicator={selectedIndicator} objectiveName={objectiveName} onStudent={setStudent} onIndicator={setIndicator} showStudent/>
    {evidence.isPending ? <Loading/> : evidence.data ? <EvidenceDetail bundle={evidence.data} itemId={params.itemId} insights={insights.data} studentClaims={studentInsights.data?.claims ?? []} studentClaimsPending={studentInsights.isPending} studentClaimsError={studentInsights.error as Error | null} objectiveName={objectiveName} topicName={label(run.objectives.find(row => String(row['指标编号'] ?? '') === selectedIndicator) ?? {}, ['主题名称', '主题编号'], '课程主题未提供')} classId={selectedClass} search={new URLSearchParams(search)}/> : <EmptyState title="暂无证据包" detail={(evidence.error as Error | null)?.message ?? '当前学生、指标和测验节点范围没有证据包。'}/>}
  </div>;
}
