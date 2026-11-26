/**
 * 学情诊断模块的接口入口：请求客户端与查询 hooks 统一从这里取。
 * 直接转出 src/api 中的实现，不在此处复制请求逻辑。
 */
export { api } from '../../api/client';
export { useCases, useClassInsights } from '../../api/queries';
