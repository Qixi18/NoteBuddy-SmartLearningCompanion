import { lazy, Suspense } from 'react';
import type { EChartsReactProps } from 'echarts-for-react/lib/types';

const EChartsView = lazy(async () => ({ default: (await import('./ReactEChartsView')).ReactEChartsView }));

export function ReactECharts(props: Omit<EChartsReactProps, 'echarts'>) {
  const height = props.style?.height ?? 280;
  return <Suspense fallback={<div role="status" aria-label="图表正在加载" style={{ width: '100%', height }}/> }>
    <EChartsView {...props}/>
  </Suspense>;
}
