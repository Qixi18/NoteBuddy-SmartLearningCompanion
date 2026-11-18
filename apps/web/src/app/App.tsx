import { useEffect, useRef, useState } from 'react';
import { useWorkbench } from './hooks/useWorkbench';
import { ImportPanel } from '../features/import/ImportPanel';
import { WorkbenchPage } from '../pages/WorkbenchPages';
import { normalizeHash, routeFor, routes, type RoutePath } from './navigation';

const primary = [
  { title: '全局概览', path: '/home' as RoutePath },
  { title: '学科知识', path: '/knowledge/indicators' as RoutePath },
  { title: '学情洞察', path: '/insights/classes' as RoutePath },
  { title: '教学方案', path: '/plan/reviews' as RoutePath },
];

export function App() {
  const workbench = useWorkbench();
  const [path, setPath] = useState<RoutePath>(() => normalizeHash(window.location.hash));
  const [importOpen, setImportOpen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const page = routeFor(path);

  useEffect(() => {
    const sync = () => {
      const next = normalizeHash(window.location.hash);
      if (window.location.hash !== `#${next}`) window.history.replaceState(null, '', `#${next}`);
      setPath(next);
    };
    if (!window.location.hash) window.history.replaceState(null, '', '#/home');
    else sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => { titleRef.current?.focus(); }, [path]);
  useEffect(() => {
    if (importOpen) {
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
      dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    } else if (dialogRef.current?.open) dialogRef.current.close();
  }, [importOpen]);

  const navigate = (next: RoutePath) => {
    if (path !== next) window.location.hash = next;
    else titleRef.current?.focus();
  };
  const imported = async (id: string) => {
    const refreshed = await workbench.refresh();
    setImportOpen(false);
    navigate('/home');
    if (refreshed !== true) {
      workbench.announce(`导入已完成（${id}）；读取提示：${refreshed}。可重试读取。`, true);
      return;
    }
    workbench.announce(`导入完成：${id}`);
  };

  return <div className="workbench-shell">
    <aside className="sidebar" aria-label="主导航">
      <a className="brand" href="#/home" onClick={event => { event.preventDefault(); navigate('/home'); }}><span className="brand-mark" aria-hidden="true">知</span><span>智慧学伴<small>证据工作台</small></span></a>
      <nav>
        {primary.map(item => {
          const active = page.section === item.title;
          const children = routes.filter(route => route.section === item.title && route.title !== item.title);
          return <div className="nav-group" key={item.title}>
            <a className={`nav-link${active ? ' active' : ''}`} href={`#${item.path}`} aria-current={active && path === item.path ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate(item.path); }}>{item.title}</a>
            {active && children.length > 0 && <div className="subnav" aria-label={`${item.title}子页面`}>{children.map(child => <a key={child.path} className={`subnav-link${path === child.path ? ' active' : ''}`} href={`#${child.path}`} aria-current={path === child.path ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate(child.path); }}>{child.title}</a>)}</div>}
          </div>;
        })}
      </nav>
      <div className="sidebar-note">本地单用户工作台</div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">智慧学伴 <span aria-hidden="true">/</span> {page.section}{page.title !== page.section && <> <span aria-hidden="true">/</span> {page.title}</>}</div><button onClick={() => setImportOpen(true)}>导入数据</button></header>
      <main className="page-content">
        <div className="page-heading"><div><h1 ref={titleRef} tabIndex={-1}>{page.title}</h1><p>{page.description}</p></div>{workbench.run && <div className="run-badge"><span>当前运行</span><strong>{workbench.run.run_id}</strong></div>}</div>
        <p id="message" className={`global-message${workbench.error ? ' error' : ''}`} role={workbench.error ? 'alert' : 'status'} aria-live={workbench.error ? 'assertive' : 'polite'}>{workbench.message}</p>
        {workbench.error && workbench.run && <div className="retry-row"><button className="secondary" onClick={() => void workbench.refresh()}>重试读取当前运行</button></div>}
        {workbench.loading && !workbench.run ? <div className="loading-state" role="status">正在读取当前分析运行…</div> : <WorkbenchPage key={workbench.run?.run_id ?? 'empty'} path={path} run={workbench.run} reviews={workbench.reviews} suggestions={workbench.suggestions} student={workbench.student} indicator={workbench.indicator} node={workbench.node} draft={workbench.draft} onStudent={workbench.setStudent} onIndicator={workbench.setIndicator} onNode={workbench.setNode} onDraft={workbench.makeDraft} onSave={workbench.saveReview} onExport={workbench.exportCases} onNavigate={navigate} />}
        {!workbench.run && !workbench.loading && <div className="retry-row"><button className="secondary" onClick={() => void workbench.refresh()}>重试读取</button></div>}
      </main>
    </div>

    <dialog className="import-dialog" ref={dialogRef} aria-labelledby="import-title" onCancel={event => { event.preventDefault(); setImportOpen(false); }} onClose={() => setImportOpen(false)}>
      <div className="dialog-heading"><div><h2 id="import-title">导入数据</h2><p>创建新的分析运行；CSV 源文件保留在原位置。</p></div><button className="icon-button" aria-label="关闭导入窗口" onClick={() => setImportOpen(false)}>关闭</button></div>
      <ImportPanel onImported={imported} onMessage={workbench.announce} />
    </dialog>
  </div>;
}
