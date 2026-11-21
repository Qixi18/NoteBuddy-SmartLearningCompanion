// 处置构成条：把逐行处置摘要画成五段彩色条。
// 只呈现服务端已有事实；没有数据时明确说明，不画空图。
import { dispositionLabel } from '../features/task02/qualityLabels';

const SEGMENT_COLORS: Record<string, string> = {
  scored: '#3f8f5f',
  pending: '#d8a13a',
  unanswered: '#8a6d2f',
  superseded: '#7b899c',
  excluded: '#b3564d',
  quarantined: '#9b6b9e',
};

export function DispositionBar({ counts, compact = false }: { counts: Record<string, number>; compact?: boolean }) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return <p className="muted">当前运行没有逐行处置摘要。</p>;
  const label = (name: string) => dispositionLabel(name) || name;
  return <div className={compact ? 'disposition-bar compact' : 'disposition-bar'}>
    <div className="disposition-track" role="img" aria-label={`处置构成：${entries.map(([name, count]) => `${label(name)} ${count} 条`).join('，')}`}>
      {entries.map(([name, count]) => <span key={name} className={`disposition-segment segment-${name}`} style={{ width: `${(count / total) * 100}%`, background: SEGMENT_COLORS[name] ?? '#8da9d0' }} title={`${label(name)} ${count}`} />)}
    </div>
    {!compact && <ul className="disposition-legend">{entries.map(([name, count]) => <li key={name}><span className="legend-dot" style={{ background: SEGMENT_COLORS[name] ?? '#8da9d0' }} aria-hidden="true" />{label(name)} {count}</li>)}</ul>}
  </div>;
}
