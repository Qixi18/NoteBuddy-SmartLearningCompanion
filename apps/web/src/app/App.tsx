import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkbench } from './hooks/useWorkbench';
import { useAnalysisScope } from './hooks/useAnalysisScope';
import { ImportPanel } from '../features/import/ImportPanel';
import { WorkbenchPage } from '../pages/WorkbenchPages';
import { parseNavigationHash, resolveCaseStudentIds, routeFor, serializeNavigation, type NavigationState } from './navigation';
import { WorkflowNav } from '../components/WorkflowNav';
import { ScopeBar } from '../components/ScopeBar';

export function App() {
  const workbench = useWorkbench();
  const [navigation, setNavigation] = useState<NavigationState>(() => parseNavigationHash(window.location.hash));
  const path = navigation.path;
  const [importOpen, setImportOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const [focusEvidence, setFocusEvidence] = useState<{ recordId: string; sourceLine: number } | null>(null);
  const evidenceReturnFocus = useRef<HTMLElement | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const dirtyRef = useRef(false);
  const lastCommittedHash = useRef(window.location.hash || '#/home');
  const previousRunId = useRef<string | null>(null);
  const expectedImportedRunId = useRef<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initialRoute = useRef(true);
  const page = routeFor(path);
  const caseIds = useMemo(() => resolveCaseStudentIds(navigation, workbench.run?.run_id ?? null, workbench.run?.students.map(student => student['学生编号']) ?? []),
    [navigation.caseStudentIds, navigation.runId, workbench.run?.run_id, workbench.run?.students]);
  const reportNodeId = workbench.run && navigation.runId === workbench.run.run_id && workbench.run.nodes.some(item => item['节点编号'] === navigation.reportNodeId)
    ? navigation.reportNodeId ?? '' : '';
  const staleReleaseScope = Boolean(workbench.run && navigation.runId && navigation.runId !== workbench.run.run_id
    && (navigation.caseStudentIds?.some(Boolean) || navigation.reportNodeId));

  const { scope } = useAnalysisScope(workbench.run, navigation, {
    student: workbench.setStudent,
    indicator: workbench.setIndicator,
    node: workbench.setNode,
  });

  useEffect(() => {
    const sync = () => {
      if (dirtyRef.current) {
        if (!window.confirm('当前内容尚未保存。离开将丢失本次编辑，是否继续？')) {
          window.history.replaceState(null, '', lastCommittedHash.current);
          return;
        }
        dirtyRef.current = false;
        setHasUnsavedChanges(false);
      }
      const next = parseNavigationHash(window.location.hash);
      const canonicalHash = serializeNavigation(next);
      if (window.location.hash !== canonicalHash) window.history.replaceState(null, '', canonicalHash);
      lastCommittedHash.current = canonicalHash;
      setNavigation(next);
      setNavOpen(false);
    };
    if (!window.location.hash) window.history.replaceState(null, '', '#/home');
    else sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => { dirtyRef.current = hasUnsavedChanges; }, [hasUnsavedChanges]);
  useEffect(() => {
    const protectClose = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectClose);
    return () => window.removeEventListener('beforeunload', protectClose);
  }, []);

  useEffect(() => {
    if (!workbench.message || workbench.error) return;
    const timeout = window.setTimeout(() => workbench.announce(''), 4500);
    return () => window.clearTimeout(timeout);
  }, [workbench.message, workbench.error]);

  useEffect(() => {
    if (initialRoute.current) initialRoute.current = false;
    else titleRef.current?.focus();
  }, [path]);
  useEffect(() => {
    const nextRunId = workbench.run?.run_id;
    if (!nextRunId) return;
    const previous = previousRunId.current;
    previousRunId.current = nextRunId;
    if (!previous || previous === nextRunId) return;
    if (expectedImportedRunId.current === nextRunId) {
      expectedImportedRunId.current = null;
      return;
    }
    expectedImportedRunId.current = null;
    const next: NavigationState = { path: '/home', runId: nextRunId };
    const hash = serializeNavigation(next);
    window.history.replaceState(null, '', hash);
    setNavigation(next);
    setFocusEvidence(null);
    workbench.announce('当前数据批次已变化，旧范围选择已清除。');
  }, [workbench.run?.run_id]);
  useEffect(() => {
    if (importOpen) {
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
      dialogRef.current?.querySelector<HTMLButtonElement>('button[type="button"]')?.focus();
    } else if (dialogRef.current?.open) dialogRef.current.close();
  }, [importOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const wideLayout = window.matchMedia('(min-width: 821px)');
    if (wideLayout.matches) { setNavOpen(false); return; }
    const currentLink = sidebar.current?.querySelector<HTMLElement>('[aria-current="page"]');
    (currentLink ?? sidebar.current?.querySelector<HTMLElement>('.nav-link.active'))?.focus();
    const closeOnResize = () => { if (wideLayout.matches) setNavOpen(false); };
    wideLayout.addEventListener('change', closeOnResize);
    return () => wideLayout.removeEventListener('change', closeOnResize);
  }, [navOpen]);

  const confirmLeave = () => {
    if (!hasUnsavedChanges) return true;
    if (!window.confirm('当前内容尚未保存。离开将丢失本次编辑，是否继续？')) return false;
    dirtyRef.current = false;
    setHasUnsavedChanges(false);
    return true;
  };
  const navigate = (target: string | NavigationState) => {
    const parsed = typeof target === 'string' ? parseNavigationHash(`#${target.replace(/^#/, '')}`) : target;
    const next: NavigationState = typeof target === 'string' ? {
      ...parsed,
      runId: scope.runId || undefined,
      returnToCheck: parsed.returnToCheck ?? navigation.returnToCheck,
      releaseCheckId: parsed.releaseCheckId ?? navigation.releaseCheckId,
      caseStudentIds: parsed.caseStudentIds ?? (navigation.runId === scope.runId ? navigation.caseStudentIds : undefined),
      reportNodeId: parsed.reportNodeId ?? (navigation.runId === scope.runId ? navigation.reportNodeId : undefined),
      nodeId: parsed.nodeId ?? (scope.nodeId || undefined),
      indicatorId: parsed.indicatorId ?? (scope.indicatorId || undefined),
      classId: parsed.classId ?? (scope.classId || undefined),
      studentId: parsed.studentId ?? (scope.studentId || undefined),
      recordId: parsed.path === '/performance' && parsed.view === 'evidence' ? navigation.recordId : undefined,
      sourceLine: parsed.path === '/performance' && parsed.view === 'evidence' ? navigation.sourceLine : undefined,
    } : { ...parsed, caseStudentIds: parsed.caseStudentIds ?? (navigation.runId === scope.runId ? navigation.caseStudentIds : undefined),
      reportNodeId: Object.prototype.hasOwnProperty.call(parsed, 'reportNodeId') ? parsed.reportNodeId : navigation.runId === scope.runId ? navigation.reportNodeId : undefined,
      returnToCheck: parsed.path === '/home' ? undefined : parsed.returnToCheck ?? navigation.returnToCheck,
      releaseCheckId: parsed.path === '/home' ? undefined : parsed.releaseCheckId ?? navigation.releaseCheckId };
    setNavOpen(false);
    const nextHash = serializeNavigation(next);
    if (window.location.hash !== nextHash && !confirmLeave()) return;
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
    else {
      setNavigation(next);
      lastCommittedHash.current = nextHash;
      window.requestAnimationFrame(() => titleRef.current?.focus());
    }
    if (navigation.path === '/performance' && navigation.view === 'evidence' && next.path === '/performance' && next.view === 'student') {
      window.requestAnimationFrame(() => evidenceReturnFocus.current?.focus());
    }
  };
  const selectStudent = (studentId: string) => {
    if (!confirmLeave()) return;
    workbench.setStudent(studentId);
    const selected = workbench.run?.students.find(item => item['学生编号'] === studentId);
    navigate({
      path, view: navigation.view, runId: workbench.run?.run_id,
      nodeId: scope.nodeId || undefined, indicatorId: scope.indicatorId || undefined,
      classId: selected?.['模拟班级编号'],
      studentId: studentId || undefined,
    });
  };
  const selectIndicator = (indicatorId: string) => {
    if (!confirmLeave()) return;
    workbench.setIndicator(indicatorId);
    navigate({ path, view: navigation.view, runId: workbench.run?.run_id, nodeId: scope.nodeId || undefined, classId: scope.classId || undefined, studentId: scope.studentId || undefined, indicatorId: indicatorId || undefined });
  };
  const selectNode = (nodeId: string) => {
    if (!confirmLeave()) return;
    workbench.setNode(nodeId);
    navigate({ path, view: navigation.view, runId: workbench.run?.run_id, indicatorId: scope.indicatorId || undefined, classId: scope.classId || undefined, studentId: scope.studentId || undefined, nodeId: nodeId || undefined });
  };
  const selectCases = (ids: string[]) => {
    const runId = workbench.run?.run_id;
    const sanitized = (ids.slice(0, 3).map(id => id && workbench.run?.students.some(student => student['学生编号'] === id) ? id : '')).map((id, index, values) => id && values.indexOf(id) !== index ? '' : id);
    navigate({ path, view: navigation.view, runId, nodeId: scope.nodeId || undefined, indicatorId: scope.indicatorId || undefined, classId: scope.classId || undefined, studentId: scope.studentId || undefined, caseStudentIds: sanitized, reportNodeId: reportNodeId || undefined });
  };
  const selectReportNode = (nodeId: string) => navigate({ path, view: navigation.view, runId: workbench.run?.run_id, nodeId: scope.nodeId || undefined, indicatorId: scope.indicatorId || undefined, classId: scope.classId || undefined, studentId: scope.studentId || undefined, caseStudentIds: caseIds, reportNodeId: nodeId || undefined });
  const resetStaleScope = () => navigate({ path, view: navigation.view, runId: workbench.run?.run_id });
  const imported = async (id: string) => {
    expectedImportedRunId.current = id;
    const refreshed = await workbench.refresh();
    setImportOpen(false);
    setFocusEvidence(null);
    navigate({ path: '/home', runId: id });
    if (refreshed !== true) {
      workbench.announce(`数据已导入（运行 ${id}），但当前视图未能刷新：${refreshed}。`, true);
      return;
    }
    workbench.announce('数据已导入，当前运行已更新。');
  };

  return <div className="workbench-shell" onKeyDown={event => {
    if (event.key === 'Escape' && navOpen && !importOpen) {
      event.preventDefault();
      setNavOpen(false);
      menuButton.current?.focus();
    }
  }}>
    <aside id="workbench-navigation" ref={sidebar} className={`sidebar${navOpen ? ' is-open' : ''}`} aria-label="主导航">
      <a className="brand" href="#/home" onClick={event => { event.preventDefault(); navigate('/home'); }}><span className="brand-mark" aria-hidden="true">知</span><span>智慧学伴<small>证据工作台</small></span></a>
      <WorkflowNav path={path} onNavigate={navigate} />
      <div className="sidebar-note"><span className="local-state-dot" aria-hidden="true" />本地工作台</div>
    </aside>
    {navOpen && <div className="mobile-nav-backdrop" aria-hidden="true" onClick={() => {
      setNavOpen(false);
      menuButton.current?.focus();
    }} />}

    <div className="workspace">
      <header className="topbar">
        <button ref={menuButton} type="button" className="secondary mobile-menu" aria-expanded={navOpen} aria-controls="workbench-navigation" onClick={() => setNavOpen(open => !open)}>
          <span className="menu-glyph" aria-hidden="true" /> 导航
        </button>
        <span className="mobile-brand">智慧学伴</span>
        <div className="breadcrumb">智慧学伴 <span aria-hidden="true">/</span> {page.section}{page.title !== page.section && <> <span aria-hidden="true">/</span> {page.title}</>}</div><div className="topbar-actions">{workbench.run && <span className="local-processing"><span aria-hidden="true" />本地数据</span>}{workbench.run && <button className="topbar-import" onClick={() => { if (!confirmLeave()) return; setNavOpen(false); setImportOpen(true); }}>导入数据</button>}</div></header>
      <main className="page-content" inert={navOpen}>
        {workbench.run && <div className="page-heading"><div><h1 ref={titleRef} tabIndex={-1}>{page.title}</h1><p>{page.description}</p></div><details className="run-details"><summary><span className="run-details-label">当前数据批次</span><strong>{new Date(workbench.run.created_at).toLocaleDateString('zh-CN')}</strong><span className="run-chevron" aria-hidden="true" /></summary><div className="run-details-popover"><span>运行编号</span><code>{workbench.run.run_id}</code><span>规则版本 {workbench.run.rule_version}</span></div></details></div>}
        {workbench.run && path !== '/home' && <ScopeBar run={workbench.run} scope={scope} path={path} view={navigation.view} onNavigate={navigate} />}
        {navigation.returnToCheck && <div className="repair-return-banner" role="status"><span>正在处理交付检查：{({ confirmed_cases: '案例确认', evidence_references: '案例证据签核', teacher_reviews: '建议复核', source_signoffs: '来源核验', case_report: '案例报告', class_report: '班级报告' } as Record<string, string>)[navigation.releaseCheckId ?? ''] ?? '待处理项目'}</span><button className="secondary" onClick={() => navigate({ path: '/cases', view: 'check', runId: workbench.run?.run_id, caseStudentIds: navigation.caseStudentIds, reportNodeId: navigation.reportNodeId, returnToCheck: false })}>返回交付检查</button></div>}
        {staleReleaseScope && path === '/cases' && <div className="scope-expired-notice" role="status"><span>交付候选与报告节点来自其他数据批次，已清除；请在当前批次重新选择。</span><button className="text-action" onClick={() => navigate({ path: '/cases', view: 'prepare', runId: workbench.run?.run_id, caseStudentIds: ['', '', ''], reportNodeId: undefined })}>重新选择案例</button></div>}
        {workbench.message && <p id="message" className={`global-message${workbench.error ? ' error' : ''}`} role={workbench.error ? 'alert' : 'status'} aria-live={workbench.error ? 'assertive' : 'polite'}>{workbench.message}</p>}
        {scope.notice && <p className="scope-expired-notice" role="status">{scope.notice} <button className="text-action" onClick={resetStaleScope}>重新选择范围</button></p>}
        {workbench.error && workbench.run && <div className="retry-row"><button className="secondary" onClick={() => void workbench.refresh()}>重试读取当前运行</button></div>}
        {workbench.loading && !workbench.run ? <div className="loading-state" role="status">正在读取本机分析服务…</div> : workbench.error && !workbench.run ? <section className="empty-state connection-error"><h1>无法读取分析数据</h1><p role="alert">{workbench.message}</p><button className="secondary" onClick={() => void workbench.refresh()}>重试连接</button></section> : <WorkbenchPage key={workbench.run?.run_id ?? 'empty'} path={path} view={navigation.view} run={workbench.run} reviews={workbench.reviews} suggestions={workbench.suggestions} student={workbench.student} indicator={workbench.indicator} node={workbench.node} focusEvidence={focusEvidence} caseIds={caseIds} onCaseIds={selectCases} reportNodeId={reportNodeId} onReportNode={selectReportNode} onEvidenceFocus={(recordId, sourceLine) => { evidenceReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setFocusEvidence({ recordId, sourceLine }); }} draft={workbench.draft} onStudent={selectStudent} onIndicator={selectIndicator} onNode={selectNode} onDraft={workbench.makeDraft} onSave={workbench.saveReview} onExport={workbench.exportCases} onNavigate={navigate} onImported={imported} onMessage={workbench.announce} dataRevision={dataRevision} onDataChanged={() => setDataRevision(revision => revision + 1)} onDirtyChange={setHasUnsavedChanges} onBeforeScopeChange={confirmLeave} />}
      </main>
    </div>

    <dialog className="import-dialog" ref={dialogRef} aria-labelledby="import-title" onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex]:not([tabindex="-1"])') ?? [])
        .filter(element => !element.hidden && !(element instanceof HTMLInputElement && element.type === 'hidden') && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }} onCancel={event => { event.preventDefault(); setImportOpen(false); }} onClose={() => setImportOpen(false)}>
      <div className="dialog-heading"><div><h2 id="import-title">导入数据</h2><p>创建新的分析运行；CSV 源文件保留在原位置。</p></div><button className="icon-button" aria-label="关闭导入窗口" onClick={() => setImportOpen(false)}>关闭</button></div>
      <ImportPanel onImported={imported} onMessage={workbench.announce} />
    </dialog>
  </div>;
}
