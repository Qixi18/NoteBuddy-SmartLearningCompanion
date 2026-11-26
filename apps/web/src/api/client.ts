import type { ApiProblem } from '../types/api';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw Object.assign(new Error('无法连接本地服务，请确认 FastAPI 已启动。'), {
      code: 'NETWORK_ERROR',
    }) satisfies ApiProblem;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw Object.assign(new Error(String(body.error ?? `请求失败（${response.status}）`)), {
      status: response.status,
      code: typeof body.code === 'string' ? body.code : undefined,
      requestId: typeof body.request_id === 'string' ? body.request_id : undefined,
    }) satisfies ApiProblem;
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/zip')) return await response.blob() as T;
  if (contentType.includes('application/pdf')) return await response.blob() as T;
  return await response.json() as T;
}

export const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
