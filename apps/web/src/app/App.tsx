import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AppLayout } from '../layout/AppLayout';
import { routes } from './routes';

const DashboardPage = lazy(async () => ({ default: (await import('../features/dashboard/DashboardPage')).DashboardPage }));
const ContentPage = lazy(async () => ({ default: (await import('../features/content/ContentPage')).ContentPage }));

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
      <Route path={routes.topicOverview} element={<Suspense fallback={<PageFallback/>}><ContentPage kind="overview"/></Suspense>}/>
      <Route path={routes.knowledgeStructure} element={<Suspense fallback={<PageFallback/>}><ContentPage kind="structure"/></Suspense>}/>
      <Route path={routes.itemRelations} element={<Suspense fallback={<PageFallback/>}><ContentPage kind="items"/></Suspense>}/>
      <Route path={routes.classDiagnosis} element={<Suspense fallback={<PageFallback/>}><ContentPage kind="class"/></Suspense>}/>
      <Route path={routes.studentDiagnosis} element={<Suspense fallback={<PageFallback/>}><ContentPage kind="student"/></Suspense>}/>
      <Route path={`${routes.itemEvidence}/:itemId?`} element={<Suspense fallback={<PageFallback/>}><ContentPage kind="evidence"/></Suspense>}/>
      <Route path={routes.studentTeaching} element={<Suspense fallback={<PageFallback/>}><ContentPage kind="studentTeaching"/></Suspense>}/>
      <Route path={routes.classTeaching} element={<Suspense fallback={<PageFallback/>}><ContentPage kind="classTeaching"/></Suspense>}/>
      <Route path="*" element={<Navigate to={routes.dashboard} replace/>}/>
    </Route>
  </Routes>;
}
