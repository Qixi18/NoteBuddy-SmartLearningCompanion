import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('API client', () => {
  it('returns successful JSON responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    await expect(api<{ ok: boolean }>('/api/health')).resolves.toEqual({ ok: true });
  });

  it('uses the safe API error message for failed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"目录无效","code":"INVALID_REQUEST"}', {
      status: 400, headers: { 'content-type': 'application/json' },
    })));
    await expect(api('/api/import')).rejects.toThrow('目录无效');
  });
});
