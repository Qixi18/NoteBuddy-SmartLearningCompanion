/**
 * 课程知识模块的接口入口：请求客户端与查询 hooks 统一从这里取。
 * 直接转出 src/api 中的实现，不在此处复制请求逻辑。
 */
import { api, postJson } from '../../api/client';
import type {
  MachineVerificationResponse,
  SourceMappingPreview,
  SourceMappingResult,
} from '../../types/api';

export { api, postJson } from '../../api/client';
export { useKnowledgeCandidates, useSourceVerifications } from '../../api/queries';

/** POST /api/source-machine-verification：批量或单项机器核验。 */
export function runMachineVerification(payload: {
  run_id?: string;
  indicator_id?: string | null;
  force?: boolean;
}): Promise<MachineVerificationResponse> {
  return api<MachineVerificationResponse>('/api/source-machine-verification', postJson(payload));
}

/** GET /api/ai-source-mappings/preview：确认前展示发送范围与字节数。 */
export function previewSourceMappings(indicatorId?: string): Promise<SourceMappingPreview> {
  const query = indicatorId ? `?indicator_id=${encodeURIComponent(indicatorId)}` : '';
  return api<SourceMappingPreview>(`/api/ai-source-mappings/preview${query}`);
}

/** POST /api/ai-source-mappings：带预览指纹确认后调用模型。 */
export function generateSourceMappings(payload: {
  transmission_confirmed: true;
  preview_fingerprint: string;
  indicator_id?: string | null;
}): Promise<SourceMappingResult> {
  return api<SourceMappingResult>('/api/ai-source-mappings', postJson(payload));
}

/** GET /api/ai-source-mappings：已生成的 AI 映射候选（按指标分组）。 */
export function listSourceMappings(): Promise<Record<string, Array<Record<string, unknown>>>> {
  return api<Record<string, Array<Record<string, unknown>>>>('/api/ai-source-mappings');
}
