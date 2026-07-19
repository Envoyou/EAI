import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  fetchWithTimeout,
  getResponseErrorMessage,
  RequestTimeoutError,
} from '../fetch-utils';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchWithTimeout', () => {
  test('aborts a request that never settles', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchWithTimeout('/api/test', { timeoutMs: 1_000 });
    const expectation = expect(request).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
  });

  test('preserves caller cancellation', async () => {
    const externalController = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchWithTimeout('/api/test', {
      signal: externalController.signal,
      timeoutMs: 10_000,
    });
    externalController.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('getResponseErrorMessage', () => {
  test('prefers structured API errors and falls back to text', async () => {
    const jsonResponse = new Response(JSON.stringify({ error: 'Rate limit reached' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
    expect(await getResponseErrorMessage(jsonResponse, 'Fallback')).toBe('Rate limit reached');

    const textResponse = new Response('Gateway unavailable', { status: 503 });
    expect(await getResponseErrorMessage(textResponse, 'Fallback')).toBe('Gateway unavailable');
  });
});
