export const routes = [
  { path: '/home', title: '全局概览', section: '全局概览', description: '查看当前分析运行、数据范围与可追溯的班级摘要。' },
  { path: '/knowledge/indicators', title: '学习要求与来源', section: '学科知识', description: '按主题选择指标，核对关联题目、课程标准、教材定位和每条来源状态。' },
  { path: '/insights/classes', title: '班级概览', section: '学情洞察', description: '按当前分析运行和测验节点查看有效评分范围。' },
  { path: '/insights/students', title: '学生分析', section: '学情洞察', description: '按学生、指标和单一测验节点查看已有记录。' },
  { path: '/insights/evidence', title: '作答证据', section: '学情洞察', description: '从记录、修订、评分点和原始 CSV 行核查证据。' },
  { path: '/insights/quality', title: '数据质量', section: '学情洞察', description: '核对原始行、事件、修订、评分和异常处置。' },
  { path: '/plan/reviews', title: '建议复核', section: '教学方案', description: '选择学生、指标和节点，查看草稿并保存教师复核。' },
  { path: '/plan/cases', title: '案例与导出', section: '教学方案', description: '核对系统候选与证据范围，再导出三名不同学生的成果包。' },
] as const;

export type RoutePath = typeof routes[number]['path'];

export function normalizeHash(hash: string): RoutePath {
  const path = hash.replace(/^#/, '') || '/home';
  if (path === '/knowledge/sources') return '/knowledge/indicators';
  return routes.some(route => route.path === path) ? path as RoutePath : '/home';
}

export function routeFor(path: RoutePath) {
  return routes.find(route => route.path === path) ?? routes[0];
}
