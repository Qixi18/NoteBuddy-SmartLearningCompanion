/**
 * 教学建议模块的接口入口：请求客户端与查询 hooks 统一从这里取。
 * 直接转出 src/api 中的实现，不在此处复制请求逻辑。
 */
export { api, patchJson, postJson } from '../../api/client';
export { useClassReport, useClassTeachingPlans, useReviews, useSourceVerifications, useTeacherCases, useTeachingAdjustments } from '../../api/queries';
export type { ClassPlanHistory } from '../../api/queries';
