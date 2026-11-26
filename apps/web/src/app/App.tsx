import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AppLayout } from '../layout/AppLayout';
import { routes } from './routes';

const DashboardPage = lazy(async () => ({ default: (await import('../features/dashboard/DashboardPage')).DashboardPage }));
const TopicOverviewPage = lazy(async () => ({ default: (await import('../features/knowledge/pages/TopicOverviewPage')).TopicOverviewPage }));
const KnowledgeStructurePage = lazy(async () => ({ default: (await import('../features/knowledge/pages/KnowledgeStructurePage')).KnowledgeStructurePageRoute }));
const ItemRelationsPage = lazy(async () => ({ default: (await import('../features/knowledge/pages/ItemRelationsPage')).ItemRelationsPage }));
const ClassDiagnosisPage = lazy(async () => ({ default: (await import('../features/diagnosis/pages/ClassDiagnosisPage')).ClassDiagnosisPage }));
const StudentDiagnosisPage = lazy(async () => ({ default: (await import('../features/diagnosis/pages/StudentDiagnosisPage')).StudentDiagnosisPage }));
const EvidenceDetailPage = lazy(async () => ({ default: (await import('../features/diagnosis/pages/EvidenceDetailPage')).EvidenceDetailPage }));
const StudentTeachingPage = lazy(async () => ({ default: (await import('../features/teaching/pages/StudentTeachingPage')).StudentTeachingPage }));
const ClassTeachingPage = lazy(async () => ({ default: (await import('../features/teaching/pages/ClassTeachingPage')).ClassTeachingPage }));

function PageFallback() {
  return <div className="route-loading" role="status">正在打开页面…</div>;
}

export default function App() {
  const location = useLocation();
  const [params] = useSearchParams();
  const scopeKey = [params.get('node'), params.get('class'), params.get('student'), params.get('indicator')].join(':');
  return <Routes>
    <Route element={<AppLayout key={`${location.pathname}:${scopeKey}`} />}>
      <Route path={routes.dashboard} element={<Suspense fallback={<PageFallback/>}><DashboardPage/></Suspense>}/>
      <Route path={routes.topicOverview} element={<Suspense fallback={<PageFallback/>}><TopicOverviewPage/></Suspense>}/>
      <Route path={routes.knowledgeStructure} element={<Suspense fallback={<PageFallback/>}><KnowledgeStructurePage/></Suspense>}/>
      <Route path={routes.itemRelations} element={<Suspense fallback={<PageFallback/>}><ItemRelationsPage/></Suspense>}/>
      <Route path={routes.classDiagnosis} element={<Suspense fallback={<PageFallback/>}><ClassDiagnosisPage/></Suspense>}/>
      <Route path={routes.studentDiagnosis} element={<Suspense fallback={<PageFallback/>}><StudentDiagnosisPage/></Suspense>}/>
      <Route path={`${routes.itemEvidence}/:itemId?`} element={<Suspense fallback={<PageFallback/>}><EvidenceDetailPage/></Suspense>}/>
      <Route path={routes.studentTeaching} element={<Suspense fallback={<PageFallback/>}><StudentTeachingPage/></Suspense>}/>
      <Route path={routes.classTeaching} element={<Suspense fallback={<PageFallback/>}><ClassTeachingPage/></Suspense>}/>
      <Route path="*" element={<Navigate to={routes.dashboard} replace/>}/>
    </Route>
  </Routes>;
}
