export function MetricBar({ ratio }: { ratio: number | null }) {
  const percentage = (ratio ?? 0) * 100;
  return <div className="bar" aria-label={`得分率 ${percentage.toFixed(1)}%`}><span style={{ width: `${Math.round(percentage)}%` }} /></div>;
}
