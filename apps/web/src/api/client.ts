import type { ApiProblem } from '../types/api';

function problemMessage(body: Record<string, unknown>, response: Response): string {
  const candidates: unknown[] = [body.error, body.message, body.detail];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
    if (Array.isArray(candidate)) {
      const parts = candidate
        .map(item => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'msg' in item) return String((item as Record<string, unknown>).msg);
          return '';
        })
        .filter(Boolean);
      if (parts.length) return parts.join('；');
    }
  }
  const statusText = response.statusText ? ` ${response.statusText}` : '';
  return `请求失败（${response.status}${statusText}）`;
}

/** 统一解析后端返回的错误体，兼容 JSON 与纯文本（如 405 Method Not Allowed）。 */
async function readProblem(response: Response): Promise<ApiProblem> {
  const contentType = response.headers.get('content-type') ?? '';
  let body: Record<string, unknown> = {};
  let plain = '';
  if (contentType.includes('application/json')) {
    body = await response.json().catch(() => ({})) as Record<string, unknown>;
  } else {
    plain = await response.text().catch(() => '');
  }
  return Object.assign(new Error(plain.trim() && !friendly(plain) ? plain.trim() : problemMessage(body, response)), {
    status: response.status,
    code: typeof body.code === 'string' ? body.code : undefined,
    requestId: typeof body.request_id === 'string' ? body.request_id : undefined,
    payload: Object.keys(body).length ? body : undefined,
  }) satisfies ApiProblem;
}

function friendly(plain: string) {
  return /^HTTP\/?\d|^\d{3}\s/.test(plain) || plain.length > 400;
}

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
  if (!response.ok) throw await readProblem(response);
  if (response.status === 204 || response.status === 205) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/zip')) return await response.blob() as T;
  if (contentType.includes('application/pdf')) return await response.blob() as T;
  if (!contentType.includes('application/json')) {
    const value = await response.text();
    return value as T;
  }
  return await response.json() as T;
}

export const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const patchJson = (body: unknown): RequestInit => ({
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const putJson = (body: unknown): RequestInit => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function isApiProblem(error: unknown): error is ApiProblem {
  return error instanceof Error;
}
