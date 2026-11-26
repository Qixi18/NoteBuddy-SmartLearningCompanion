import { FileSearch, Layers3, Link2, Sparkles, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { routes } from '../../../app/routes';
import styles from '../../shared/WorkbenchPages.module.css';

export function KnowledgeModuleHeader({ kind, search }: { kind: 'overview' | 'structure' | 'items'; search: string }) {
  const tabs = [
    { id: 'overview', label: '主题概览', path: routes.topicOverview, icon: Layers3 },
    { id: 'structure', label: '知识结构', path: routes.knowledgeStructure, icon: Link2 },
    { id: 'items', label: '题目关联', path: routes.itemRelations, icon: FileSearch },
  ] as const;
  return <div className={styles.knowledgeModuleHeader}>
    <nav className={styles.knowledgeTabs} aria-label="课程知识页面">
      {tabs.map(tab => { const Icon = tab.icon; return <Link key={tab.id} to={{ pathname: tab.path, search }} aria-current={kind === tab.id ? 'page' : undefined} className={`${styles.knowledgeTab} ${kind === tab.id ? styles.knowledgeTabActive : ''}`}><Icon size={17}/>{tab.label}</Link>; })}
    </nav>
    <div className={styles.knowledgeActions}>
      <Link to={{ pathname: routes.classDiagnosis, search }}><Target size={16}/>查看学情关联</Link>
      <Link to={{ pathname: routes.studentTeaching, search }}><Sparkles size={16}/>生成教学建议</Link>
    </div>
  </div>;
}
