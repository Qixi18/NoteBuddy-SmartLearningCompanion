import { describe, expect, it, vi, afterEach } from 'vitest';
import health from '../../../../contracts/api/health.json';
import errorFixture from '../../../../contracts/api/error.json';
import reviewRequest from '../../../../contracts/api/review-request.json';
import reviewSuccess from '../../../../contracts/api/review-success.json';
import { api, jsonRequest } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('shared API fixtures', () => {
  it('accepts the shared health response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(health), {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    await expect(api<{ status: string }>('/api/health')).resolves.toEqual(health);
  });

  it('uses the error text in the shared error envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(errorFixture), {
      status: 422, headers: { 'content-type': 'application/json' },
    })));
    await expect(api('/api/health')).rejects.toThrow(errorFixture.error);
  });

  it('sends and receives the shared review contract unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(reviewSuccess), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/api/review', jsonRequest(reviewRequest))).resolves.toEqual(reviewSuccess);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(reviewRequest);
  });
});
