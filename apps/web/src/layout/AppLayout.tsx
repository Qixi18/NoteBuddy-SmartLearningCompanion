import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity, Bell, BookOpen, ChevronDown, CircleUserRound, ClipboardList, GraduationCap,
  House, Lightbulb, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useRun } from '../api/queries';
import { pageTitles, routes } from '../app/routes';
import { useWorkbenchScope } from '../features/shared/useWorkbenchScope';
import { text } from '../features/shared/scopeUtils';
import styles from './AppLayout.module.css';

const navGroups = [
  { label: '教学工作台', path: routes.dashboard, icon: House },
  { label: '课程知识', path: routes.topicOverview, icon: BookOpen, children: [
    { label: '主题概览', path: routes.topicOverview }, { label: '知识结构', path: routes.knowledgeStructure }, { label: '题目关联', path: routes.itemRelations },
  ] },
  { label: '学情诊断', path: routes.classDiagnosis, icon: Activity, children: [
    { label: '班级诊断', path: routes.classDiagnosis }, { label: '学生个人诊断', path: routes.studentDiagnosis },
  ] },
  { label: '教学建议', path: routes.studentTeaching, icon: Lightbulb, children: [
    { label: '学生个性化建议', path: routes.studentTeaching }, { label: '班级教学建议', path: routes.classTeaching },
  ] },
];

const COLLAPSE_KEY = 'smart-learning.sidebar-collapsed';

function initialCollapsed() {
  try { return window.localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}

export function AppLayout() {
  const { data: run } = useRun();
  const location = useLocation();
  const { scope, search, classes, nodes, setClass, setNode } = useWorkbenchScope();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    try { window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* 本地存储不可用时仅忽略 */ }
  }, [collapsed]);

  const page = pageTitles[location.pathname]
    ?? (location.pathname.startsWith(`${routes.itemEvidence}/`) ? pageTitles[routes.itemEvidence] : pageTitles[routes.dashboard]);
  const nodeOptions = nodes.map((row, index) => ({
    id: text(row['节点编号']) || String(index),
    name: text(row['节点名称']) || text(row['测验名称']) || text(row['节点编号']) || '测验节点',
  }));
  const subject = run?.subject ?? nodes.find(row => text(row['学科']))?.['学科'];

  return <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ''}`}>
    <aside className={styles.sidebar}>
      <NavLink to={{ pathname: routes.dashboard, search }} className={styles.brand} aria-label="智慧学伴教学工作台">
        <span className={styles.brandIcon}><BookOpen size={26}/></span><span>智慧学伴</span>
      </NavLink>
      <div className={styles.sideCaption}>教师教学空间</div>
      <nav className={styles.nav} aria-label="主导航">
        {navGroups.map(group => {
          const Icon = group.icon;
          const active = location.pathname === group.path || group.children?.some(child => child.path === location.pathname);
          return <div key={group.label} className={styles.navGroup}>
            <NavLink aria-label={group.label} title={collapsed ? group.label : undefined} to={{ pathname: group.path, search }} className={`${styles.navItem} ${active ? styles.active : ''}`}>
              <Icon size={20}/><span>{group.label}</span>{group.children && <ChevronDown className={styles.navChevron} size={15}/>}
            </NavLink>
            {group.children && active && <div className={styles.subNav}>{group.children.map(child =>
              <NavLink key={child.path} to={{ pathname: child.path, search }} className={({ isActive }) => `${styles.subNavItem} ${isActive ? styles.subActive : ''}`}>{child.label}</NavLink>,
            )}</div>}
          </div>;
        })}
      </nav>
      <div className={styles.sideFooter}>
        <span className={styles.avatar} aria-hidden="true">李</span>
        <div><strong>教师工作区</strong><small>{run ? `运行 ${run.run_id.slice(0, 8)}` : '等待导入数据'}</small></div>
        <button
          type="button"
          className={styles.collapseButton}
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          aria-expanded={!collapsed}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          onClick={() => setCollapsed(value => !value)}
        >
          {collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}
        </button>
      </div>
    </aside>

    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.scopeGroup}>
          <label className={styles.scopeField}><GraduationCap size={19}/><span>学科</span>
            <div className={styles.scopeValue} title={text(subject) ? undefined : '当前运行数据未提供学科名称'}>
              {text(subject) || '未提供'}
            </div>
          </label>
          <label className={styles.scopeField}><span className={styles.classGlyph}><CircleUserRound size={19}/></span><span>班级</span>
            <select aria-label="班级" value={scope.classId} onChange={event => setClass(event.target.value)} disabled={!classes.length}>
              {!classes.length && <option value="">暂无班级</option>}{classes.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className={styles.scopeField}><ClipboardList size={19}/><span>测验</span>
            <select aria-label="测验节点" value={scope.nodeId} onChange={event => setNode(event.target.value)} disabled={!nodeOptions.length}>
              {!nodeOptions.length && <option value="">暂无测验</option>}{nodeOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <div className={styles.topActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="通知"
            title="本地演示版暂无通知业务"
            disabled
          >
            <Bell size={19}/>
          </button>
          <div className={styles.topDivider}/>
          <div className={styles.profile} title="教师工作区信息（演示版为静态展示）">
            <span className={styles.profileAvatar}>李</span><span>教师</span>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.pageHeading}><div><div className={styles.eyebrow}>智慧学伴 <span>/</span> 教师工作台</div><h1>{page.title}</h1><p>{page.subtitle}</p></div><div className={styles.pageHeadingTools}><span className={styles.liveDot}/>{run ? '数据已同步' : '等待导入数据'}</div></div>
        <Outlet/>
      </main>
    </div>
  </div>;
}
