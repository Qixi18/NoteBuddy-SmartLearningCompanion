import { useEffect, useRef, useState } from 'react';
import { useWorkbench } from './hooks/useWorkbench';
import { ImportPanel } from '../features/import/ImportPanel';
import { WorkbenchPage } from '../pages/WorkbenchPages';
import { normalizeHash, routeFor, routes, type RoutePath } from './navigation';
import { NavIcon } from '../components/NavIcon';

const primary = [
  { title: '全局概览', path: '/home' as RoutePath, icon: 'overview' as const },
  { title: '学科知识', path: '/knowledge/indicators' as RoutePath, icon: 'subject' as const },
  { title: '学情洞察', path: '/insights/classes' as RoutePath, icon: 'insights' as const },
  { title: '教学方案', path: '/plan/reviews' as RoutePath, icon: 'teaching' as const },
];

export function App() {
  const workbench = useWorkbench();
  const [path, setPath] = useState<RoutePath>(() => normalizeHash(window.location.hash));
  const [importOpen, setImportOpen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initialRoute = useRef(true);
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
    if (importOpen) {
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
      dialogRef.current?.querySelector<HTMLButtonElement>('button[type="button"]')?.focus();
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
      workbench.announce(`数据已导入（运行 ${id}），但当前视图未能刷新：${refreshed}。`, true);
      return;
    }
    workbench.announce('数据已导入，当前运行已更新。');
  };

  return <div className="workbench-shell">
    <aside className="sidebar" aria-label="主导航">
      <a className="brand" href="#/home" onClick={event => { event.preventDefault(); navigate('/home'); }}><span className="brand-mark" aria-hidden="true">知</span><span>智慧学伴<small>证据工作台</small></span></a>
      <nav aria-label="主要功能">
        {primary.map(item => {
          const active = page.section === item.title;
          const children = routes.filter(route => route.section === item.title && route.title !== item.title);
          return <div className="nav-group" key={item.title}>
            <a className={`nav-link${active ? ' active' : ''}`} href={`#${item.path}`} aria-current={active && path === item.path ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate(item.path); }}><NavIcon name={item.icon} /><span>{item.title}</span></a>
            {active && children.length > 0 && <div className="subnav" aria-label={`${item.title}子页面`}>{children.map(child => <a key={child.path} className={`subnav-link${path === child.path ? ' active' : ''}`} href={`#${child.path}`} aria-current={path === child.path ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate(child.path); }}>{child.title}</a>)}</div>}
          </div>;
        })}
      </nav>
      <div className="sidebar-note"><span className="local-state-dot" aria-hidden="true" />本地工作台</div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">智慧学伴 <span aria-hidden="true">/</span> {page.section}{page.title !== page.section && <> <span aria-hidden="true">/</span> {page.title}</>}</div><div className="topbar-actions">{workbench.run && <span className="local-processing"><span aria-hidden="true" />本地数据</span>}{workbench.run && <button className="topbar-import" onClick={() => setImportOpen(true)}>导入数据</button>}</div></header>
      <main className="page-content">
        {workbench.run && <div className="page-heading"><div><h1 ref={titleRef} tabIndex={-1}>{page.title}</h1><p>{page.description}</p></div><details className="run-details"><summary><span className="run-details-label">当前数据批次</span><strong>{new Date(workbench.run.created_at).toLocaleDateString('zh-CN')}</strong><span className="run-chevron" aria-hidden="true" /></summary><div className="run-details-popover"><span>运行编号</span><code>{workbench.run.run_id}</code><span>规则版本 {workbench.run.rule_version}</span></div></details></div>}
        {workbench.message && <p id="message" className={`global-message${workbench.error ? ' error' : ''}`} role={workbench.error ? 'alert' : 'status'} aria-live={workbench.error ? 'assertive' : 'polite'}>{workbench.message}</p>}
        {workbench.error && workbench.run && <div className="retry-row"><button className="secondary" onClick={() => void workbench.refresh()}>重试读取当前运行</button></div>}
        {workbench.loading && !workbench.run ? <div className="loading-state" role="status">正在读取本机分析服务…</div> : workbench.error && !workbench.run ? <section className="empty-state connection-error"><h1>无法读取分析数据</h1><p role="alert">{workbench.message}</p><button className="secondary" onClick={() => void workbench.refresh()}>重试连接</button></section> : <WorkbenchPage key={workbench.run?.run_id ?? 'empty'} path={path} run={workbench.run} reviews={workbench.reviews} suggestions={workbench.suggestions} student={workbench.student} indicator={workbench.indicator} node={workbench.node} draft={workbench.draft} onStudent={workbench.setStudent} onIndicator={workbench.setIndicator} onNode={workbench.setNode} onDraft={workbench.makeDraft} onSave={workbench.saveReview} onExport={workbench.exportCases} onNavigate={navigate} onImported={imported} onMessage={workbench.announce} />}
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
