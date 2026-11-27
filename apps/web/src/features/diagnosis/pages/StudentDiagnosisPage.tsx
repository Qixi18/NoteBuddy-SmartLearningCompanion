import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Activity, ArrowRight, FileSearch, Layers3, Target } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, Loading, Notice, Panel } from '../../../components/PageBits';
import { routes } from '../../../app/routes';
import { api } from '../api';
import { EvidenceRows } from '../components/EvidenceRows';
import { RubricPointSummary } from '../components/RubricPointSummary';
import { ScopeSelectors } from '../components/ScopeSelectors';
import { StudentDiagnosticClaims } from '../components/DiagnosticClaims';
import { StudentEvidenceSummary } from '../components/StudentEvidenceSummary';
import { StudentQuickSwitch } from '../components/StudentQuickSwitch';
import { StudentScoreBars } from '../components/StudentScoreBars';
import { useWorkbenchScope } from '../../shared/useWorkbenchScope';
import { label, objectiveLabel } from '../../shared/workbenchTypes';
import type { Bundle, Claim } from '../../shared/workbenchTypes';
import styles from '../../shared/WorkbenchPages.module.css';

export function StudentDiagnosisPage() {
  const { run, runQuery, scope, search, setIndicator, setStudent } = useWorkbenchScope();
  const [studentSearch, setStudentSearch] = useState('');
  const params = useParams();
  const selectedStudent = scope.studentId || String(run?.students.find(item => String(item['模拟班级编号'] ?? '') === scope.classId)?.['学生编号'] ?? run?.students[0]?.['学生编号'] ?? '');
  const selectedIndicator = scope.indicatorId || String(run?.objectives[0]?.['指标编号'] ?? '');
  const selectedNode = scope.nodeId || String(run?.nodes[0]?.['节点编号'] ?? '');
  const selectedClass = scope.classId || String(run?.students[0]?.['模拟班级编号'] ?? '');
  const evidence = useQuery({
    queryKey: ['evidence-bundle', run?.run_id, selectedNode, selectedStudent, selectedIndicator],
    queryFn: () => api<Bundle>(`/api/evidence-bundle?student=${encodeURIComponent(selectedStudent)}&indicator=${encodeURIComponent(selectedIndicator)}&node=${encodeURIComponent(selectedNode)}`),
    enabled: Boolean(run && selectedStudent && selectedIndicator && selectedNode),
  });
  const studentInsights = useQuery({
    queryKey: ['student-insights', run?.run_id, selectedNode, selectedStudent, selectedIndicator],
    queryFn: () => api<{ scope: Record<string, string>; claims: Claim[] }>(`/api/student-insights?student=${encodeURIComponent(selectedStudent)}&indicator=${encodeURIComponent(selectedIndicator)}&node=${encodeURIComponent(selectedNode)}`),
    enabled: Boolean(run && selectedStudent && selectedIndicator && selectedNode),
  });

  if (runQuery.isPending) return <Loading/>;
  if (!run) return <EmptyState title="当前没有分析运行" detail="请先在教学工作台导入课程与学情数据。" action={<Link className={styles.linkButton} to={routes.dashboard}>前往教学工作台 <ArrowRight size={15}/></Link>}/>;

  const objectiveName = (id: string) => objectiveLabel(run.objectives, id);
  const linkParams = new URLSearchParams(search);
  return <div className={styles.pageStack}>
    <ScopeSelectors run={run} selectedStudent={selectedStudent} selectedIndicator={selectedIndicator} objectiveName={objectiveName} onStudent={setStudent} onIndicator={setIndicator} showStudent/>
    <StudentQuickSwitch students={run.students} classId={selectedClass} selectedStudent={selectedStudent} search={studentSearch} onSearch={setStudentSearch} onSelect={setStudent}/>
    {evidence.data && <StudentEvidenceSummary bundle={evidence.data} testName={label(run.nodes.find(row => String(row['节点编号'] ?? '') === selectedNode) ?? {}, ['节点名称', '测验名称', '名称'], selectedNode)} indicatorName={objectiveName(selectedIndicator)}/>}
    {evidence.data && <div className={styles.studentDiagnosisPair} data-testid="student-diagnosis-pair">
      <Panel title="本次作答表现" icon={<Activity size={18}/>}>{evidence.data.responses.length ? <StudentScoreBars bundle={evidence.data}/> : <EmptyState compact title="当前范围没有作答记录" detail="无记录不代表未掌握。补充本次测验作答后，这里会显示有效评分。"/>}</Panel>
      <Panel title="学生画像与诊断结论" icon={<Target size={18}/>}>{studentInsights.isPending ? <Loading compact/> : studentInsights.data?.claims?.length ? <StudentDiagnosticClaims claims={studentInsights.data.claims} evidencePath={`${routes.itemEvidence}`} params={linkParams}/> : <EmptyState compact title="当前范围没有诊断结论" detail="诊断接口没有返回可追溯的主张。无记录不代表未掌握。"/>}</Panel>
    </div>}
    {evidence.data && <div className={styles.studentDiagnosisPair} data-testid="student-diagnosis-pair">
      <Panel title="典型作答证据" icon={<FileSearch size={18}/>} action={<Link to={{ pathname: routes.itemEvidence, search: search }}>查看完整证据 <ArrowRight size={14}/></Link>}>{<EvidenceRows bundle={evidence.data} selectedItem={params.itemId}/>}</Panel>
      <Panel title="评分点本次表现" icon={<Layers3 size={18}/> }><RubricPointSummary bundle={evidence.data} params={linkParams}/></Panel>
    </div>}
    <Notice>本页结论仅描述当前学生、观察指标和测验节点内有记录支持的表现，不代表稳定能力等级。评分点未知、未评分或冲突时不会按零分处理。<Link to={{ pathname: routes.studentTeaching, search: search }}>查看个性化教学建议 <ArrowRight size={14}/></Link></Notice>
  </div>;
}
