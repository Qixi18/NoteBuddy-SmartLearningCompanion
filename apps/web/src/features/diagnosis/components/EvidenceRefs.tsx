import { FileSearch } from 'lucide-react';
import styles from '../../shared/WorkbenchPages.module.css';

export function EvidenceRefs({ ids }: { ids: string[] }) {
  return ids.length ? <div className={styles.evidenceRefList}>{[...new Set(ids)].map(id => <span key={id}><FileSearch size={12}/>{id}</span>)}</div> : <small className={styles.muted}>未关联具体作答记录。</small>;
}
