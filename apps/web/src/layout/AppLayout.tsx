import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Activity, BookOpen, ChevronDown, CircleUserRound, ClipboardList, GraduationCap, House, Lightbulb, PanelLeftClose, Bell } from 'lucide-react';
import { useRun } from '../api/queries';
import { pageTitles, routes } from '../app/routes';
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

export function AppLayout() {
  const { data: run } = useRun();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const page = pageTitles[location.pathname] ?? (location.pathname.startsWith(`${routes.itemEvidence}/`) ? pageTitles[routes.itemEvidence] : pageTitles[routes.dashboard]);
  const nodes = run?.nodes ?? [];
  const students = run?.students ?? [];
  const classes = [...new Set(students.map(s => String(s['模拟班级编号'] ?? '')).filter(Boolean))];
  const node = params.get('node') ?? String(nodes[0]?.['节点编号'] ?? '');
  const classId = params.get('class') ?? classes[0] ?? '';

  useEffect(() => {
    if (nodes.length && !params.get('node')) {
      const next = new URLSearchParams(params);
      next.set('node', String(nodes[0]['节点编号']));
      if (classes.length && !next.has('class')) next.set('class', classes[0]);
      setParams(next, { replace: true });
    }
  }, [nodes, classes.length, params, setParams]);

  const updateScope = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key === 'student' && value) next.set('class', String(students.find(s => s['学生编号'] === value)?.['模拟班级编号'] ?? classId));
    if (key === 'class') next.delete('student');
    setParams(next);
  };

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <NavLink to={{ pathname: routes.dashboard, search: location.search }} className={styles.brand} aria-label="智慧学伴教学工作台">
        <span className={styles.brandIcon}><BookOpen size={26}/></span><span>智慧学伴</span>
      </NavLink>
      <div className={styles.sideCaption}>教师教学空间</div>
      <nav className={styles.nav} aria-label="主导航">
        {navGroups.map(group => {
          const Icon = group.icon;
          const active = location.pathname === group.path || group.children?.some(child => child.path === location.pathname);
          return <div key={group.label} className={styles.navGroup}>
            <NavLink aria-label={group.label} to={{ pathname: group.path, search: location.search }} className={`${styles.navItem} ${active ? styles.active : ''}`}>
              <Icon size={20}/><span>{group.label}</span>{group.children && <ChevronDown className={styles.navChevron} size={15}/>}
            </NavLink>
            {group.children && active && <div className={styles.subNav}>{group.children.map(child =>
              <NavLink key={child.path} to={{ pathname: child.path, search: location.search }} className={({ isActive }) => `${styles.subNavItem} ${isActive ? styles.subActive : ''}`}>{child.label}</NavLink>,
            )}</div>}
          </div>;
        })}
      </nav>
      <div className={styles.sideFooter}><div className={styles.avatar}>李</div><div><strong>教师工作区</strong><small>{run ? `运行 ${run.run_id.slice(0, 8)}` : '等待导入数据'}</small></div><PanelLeftClose size={17}/></div>
    </aside>

    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.scopeGroup}>
          <label className={styles.scopeField}><GraduationCap size={19}/><span>学科</span><div className={styles.scopeValue} title="当前运行数据未提供学科名称">未提供</div></label>
          <label className={styles.scopeField}><span className={styles.classGlyph}><CircleUserRound size={19}/></span><span>班级</span>
            <select aria-label="班级" value={classId} onChange={event => updateScope('class', event.target.value)} disabled={!classes.length}>
              {!classes.length && <option value="">暂无班级</option>}{classes.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className={styles.scopeField}><ClipboardList size={19}/><span>测验</span>
            <select aria-label="测验节点" value={node} onChange={event => updateScope('node', event.target.value)} disabled={!nodes.length}>
              {!nodes.length && <option value="">暂无测验</option>}{nodes.map((value, index) => <option key={String(value['节点编号'] ?? index)} value={String(value['节点编号'] ?? '')}>{String(value['节点名称'] ?? value['测验名称'] ?? value['节点编号'] ?? '测验节点')}</option>)}
            </select>
          </label>
        </div>
        <div className={styles.topActions}><button className={styles.iconButton} aria-label="通知"><Bell size={19}/><i/></button><div className={styles.topDivider}/><button className={styles.profile}><span className={styles.profileAvatar}>李</span><span>教师</span><ChevronDown size={15}/></button></div>
      </header>

      <main className={styles.main}>
        <div className={styles.pageHeading}><div><div className={styles.eyebrow}>智慧学伴 <span>/</span> 教师工作台</div><h1>{page.title}</h1><p>{page.subtitle}</p></div><div className={styles.pageHeadingTools}><span className={styles.liveDot}/>{run ? '数据已同步' : '等待导入数据'}</div></div>
        <Outlet/>
      </main>
    </div>
  </div>;
}
