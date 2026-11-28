import type { ReactNode } from 'react';
import { AlertCircle, ArrowRight, FileQuestion, RefreshCw } from 'lucide-react';
import styles from './PageBits.module.css';

export function Panel({ title, icon, action, children, className = '', id }: {
  title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return <section id={id} className={`${styles.panel} ${className}`}>
    <header className={styles.panelHeader}><h2>{icon}{title}</h2>{action}</header>
    {children}
  </section>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'error' }) {
  const Icon = tone === 'error' ? AlertCircle : tone === 'warning' ? AlertCircle : FileQuestion;
  return <div className={`${styles.notice} ${styles[tone]}`} role={tone === 'error' ? 'alert' : 'status'}><Icon size={19}/><span>{children}</span></div>;
}

export function Loading({ label = '正在读取当前运行数据…', compact = false }: { label?: string; compact?: boolean }) {
  return <div className={`${styles.loading} ${compact ? styles.compact : ''}`}><RefreshCw size={18} className={styles.spin}/>{label}</div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className={styles.error} role="alert"><AlertCircle size={20}/><span>{message}</span>{onRetry && <button onClick={onRetry}>重试 <ArrowRight size={15}/></button>}</div>;
}

export function EmptyState({ title, detail, action, compact = false }: { title: string; detail: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`${styles.empty} ${compact ? styles.compact : ''}`}><div className={styles.emptyIcon}><FileQuestion size={compact ? 19 : 23}/></div><strong>{title}</strong><p>{detail}</p>{action}</div>;
}

export function Metric({ label, value, hint, icon, tone = 'green', variant = 'number' }: {
  label: string; value: string | number; hint?: string; icon: ReactNode; tone?: 'green' | 'amber' | 'purple'; variant?: 'number' | 'text';
}) {
  return <article className={`${styles.metric} ${styles[tone]}`}><div className={styles.metricIcon}>{icon}</div><div className={styles.metricText}><span>{label}</span><strong className={variant === 'text' ? styles.metricTextValue : undefined}>{value}</strong>{hint && <small>{hint}</small>}</div></article>;
}

export function DataTable({ columns, rows, onRowClick }: {
  columns: Array<{ key: string; title: string; render?: (row: Record<string, unknown>) => ReactNode }>;
  rows: Array<Record<string, unknown>>;
  onRowClick?: (row: Record<string, unknown>) => void;
}) {
  return <div className={styles.tableWrap}><table><thead><tr>{columns.map(column => <th key={column.key}>{column.title}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={String(row.id ?? row['材料编号'] ?? row['学生编号'] ?? index)} onClick={() => onRowClick?.(row)} className={onRowClick ? styles.clickable : ''}>
      {columns.map(column => <td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? '—')}</td>)}
    </tr>)}</tbody></table></div>;
}
