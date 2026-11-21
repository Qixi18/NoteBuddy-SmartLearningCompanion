// 轻量 SVG 图表组件：零依赖、可打印、只呈现服务端已有事实。
// 红线：未测/无记录不画成 0（雷达图剔除未测轴，由调用方以灰色胶囊单列）；
// 不做跨节点趋势线；比率一律以百分数口径呈现。
import type { ReactNode } from 'react';

const PERCENT = (ratio: number) => `${Math.round(ratio * 100)}%`;

export function RadarChart({ axes, size = 260 }: { axes: Array<{ label: string; ratio: number }>; size?: number }) {
  const count = axes.length;
  if (count < 3) return null;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const radius = size / 2 - 40;
  const angle = (index: number) => (Math.PI * 2 * index) / count - Math.PI / 2;
  const point = (index: number, ratio: number): [number, number] => [
    cx + Math.cos(angle(index)) * radius * Math.max(0, Math.min(1, ratio)),
    cy + Math.sin(angle(index)) * radius * Math.max(0, Math.min(1, ratio)),
  ];
  const clamped = axes.map(axis => ({ ...axis, ratio: Math.max(0, Math.min(1, axis.ratio)) }));
  const shape = clamped.map((axis, index) => point(index, axis.ratio).join(',')).join(' ');
  return <svg viewBox={`0 0 ${size} ${size}`} className="radar-chart" role="img"
    aria-label={`雷达图：${axes.map(axis => `${axis.label} ${PERCENT(axis.ratio)}`).join('，')}`}>
    {[0.25, 0.5, 0.75, 1].map(ring => <polygon key={ring}
      points={axes.map((_, index) => point(index, ring).join(', ')).join(' ')} fill="none" stroke="#d9e5ec" strokeWidth={1} />)}
    {axes.map((axis, index) => {
      const [x, y] = point(index, 1);
      return <line key={`spoke-${axis.label}`} x1={cx} y1={cy} x2={x} y2={y} stroke="#e3ebf2" strokeWidth={1} />;
    })}
    <polygon points={shape} fill="rgba(52,93,145,0.18)" stroke="#345d91" strokeWidth={1.5} />
    {clamped.map((axis, index) => {
      const [x, y] = point(index, axis.ratio);
      return <circle key={`dot-${axis.label}`} cx={x} cy={y} r={3.5} fill="#345d91"><title>{`${axis.label} ${PERCENT(axis.ratio)}`}</title></circle>;
    })}
    {axes.map((axis, index) => {
      const [x, y] = point(index, 1.16);
      return <text key={`label-${axis.label}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#465b73">{axis.label}</text>;
    })}
    {axes.map((axis, index) => {
      const [x, y] = point(index, axis.ratio);
      const inside = axis.ratio > 0.45;
      return <text key={`value-${axis.label}`} x={x} y={inside ? y + 13 : y - 9} textAnchor="middle" fontSize={9} fill="#244daf">{PERCENT(axis.ratio)}</text>;
    })}
  </svg>;
}

export function ParetoChart({ items, height = 150 }: { items: Array<{ label: string; sublabel?: string; count: number }>; height?: number }) {
  const count = items.length;
  if (!count) return null;
  const width = Math.max(320, count * 52);
  const barArea = height - 46;
  const top = items[0].count || 1;
  const cumulative: Array<{ label: string; percent: number }> = [];
  let running = 0;
  const total = items.reduce((sum, item) => sum + item.count, 0);
  items.forEach(item => {
    running += item.count;
    cumulative.push({ label: item.label, percent: running / total });
  });
  const x = (index: number) => 34 + (index + 0.5) * ((width - 60) / count);
  const yFor = (value: number) => barArea - (value / top) * (barArea - 14);
  const linePoints = cumulative.map((entry, index) => `${x(index)},${(barArea - 14) * (1 - entry.percent) + 14}`).join(' ');
  return <svg viewBox={`0 0 ${width} ${height}`} width="100%" className="pareto-chart" role="img"
    aria-label={`帕累托图：${items.map(item => `${item.label} ${item.count} 次`).join('，')}；累计占比 ${items.map((_, index) => `${PERCENT(cumulative[index].percent)}`).join('、')}`}>
    <line x1={34} y1={barArea} x2={width - 26} y2={barArea} stroke="#c9d6e2" />
    {items.map((item, index) => {
      const barHeight = (item.count / top) * (barArea - 14);
      return <g key={item.label}>
        <rect x={x(index) - 14} y={barArea - barHeight} width={28} height={barHeight} fill="#d8a13a" opacity={0.85} rx={2} />
        <text x={x(index)} y={barArea - barHeight - 4} textAnchor="middle" fontSize={9} fill="#8a6d2f">{item.count}</text>
        <text x={x(index)} y={barArea + 12} textAnchor="middle" fontSize={8} fill="#465b73">{item.label}</text>
        {item.sublabel && <text x={x(index)} y={barArea + 22} textAnchor="middle" fontSize={8} fill="#8a94a3">{item.sublabel}</text>}
      </g>;
    })}
    <polyline points={linePoints} fill="none" stroke="#345d91" strokeWidth={1.5} />
    {cumulative.map((entry, index) => {
      const [cx, cy] = [x(index), (barArea - 14) * (1 - entry.percent) + 14];
      return <g key={`cum-${entry.label}`}>
        <circle cx={cx} cy={cy} r={3} fill="#345d91" />
        <text x={cx} y={cy - 7} textAnchor="middle" fontSize={8} fill="#345d91">{PERCENT(entry.percent)}</text>
      </g>;
    })}
    <text x={34} y={10} fontSize={9} fill="#6b7a8c">累计占比</text>
  </svg>;
}

export function ChartLegend({ children }: { children: ReactNode }) {
  return <ul className="chart-legend">{children}</ul>;
}
