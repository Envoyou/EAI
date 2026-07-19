import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  fetchWithTimeout,
  OutboundRequestTimeoutError,
} from '../fetch-with-timeout';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchWithTimeout', () => {
  test('aborts an outbound request that never settles', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_input, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })
    ));

    const request = fetchWithTimeout('https://example.com', { timeoutMs: 1_000 });
    const expectation = expect(request).rejects.toBeInstanceOf(OutboundRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
  });

  test('propagates caller cancellation', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_input, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })
    ));

    const request = fetchWithTimeout('https://example.com', {
      signal: controller.signal,
    });
    controller.abort(new Error('Caller cancelled'));
    await expect(request).rejects.toThrow('Caller cancelled');
  });
});
