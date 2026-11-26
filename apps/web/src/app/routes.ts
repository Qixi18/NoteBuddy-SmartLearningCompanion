export const routes = {
  dashboard: '/',
  topicOverview: '/knowledge/overview',
  knowledgeStructure: '/knowledge/structure',
  itemRelations: '/knowledge/items',
  classDiagnosis: '/diagnosis/class',
  studentDiagnosis: '/diagnosis/student',
  itemEvidence: '/diagnosis/evidence',
  studentTeaching: '/teaching/student',
  classTeaching: '/teaching/class',
} as const;

export const pageTitles: Record<string, { title: string; subtitle: string }> = {
  [routes.dashboard]: { title: '教学工作台', subtitle: '快速了解班级学情与教学重点，明确本周教学行动。' },
  [routes.topicOverview]: { title: '课程知识', subtitle: '本页梳理学习要求、知识结构与题目关联，为学情分析和教学建议提供依据。' },
  [routes.knowledgeStructure]: { title: '课程知识', subtitle: '本页梳理学习要求、知识结构与题目关联，为学情分析和教学建议提供依据。' },
  [routes.itemRelations]: { title: '课程知识', subtitle: '本页梳理学习要求、知识结构与题目关联，为学情分析和教学建议提供依据。' },
  [routes.classDiagnosis]: { title: '班级诊断', subtitle: '比较可比学情，识别共性问题与关键证据。' },
  [routes.studentDiagnosis]: { title: '学生个人诊断', subtitle: '结合测验范围、评分点和作答证据理解学生表现。' },
  [routes.itemEvidence]: { title: '题目证据详情', subtitle: '查看原题、学生作答、评分点及诊断依据。' },
  [routes.studentTeaching]: { title: '学生个性化学习建议', subtitle: '根据当前学生证据制定可复核的学习支持方案。' },
  [routes.classTeaching]: { title: '班级教学建议', subtitle: '汇总班级教学重点、分层行动与后续观察。' },
};
