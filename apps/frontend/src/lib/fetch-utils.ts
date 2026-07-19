export const REQUEST_TIMEOUT_MS = {
  default: 30_000,
  polling: 20_000,
  aiFlex: 16 * 60_000,
} as const;

export interface TimeoutRequestInit extends RequestInit {
  timeoutMs?: number;
}

export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = 'RequestTimeoutError';
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: TimeoutRequestInit = {}
): Promise<Response> {
  const { timeoutMs = REQUEST_TIMEOUT_MS.default, signal: externalSignal, ...requestInit } = init;
  const controller = new AbortController();
  let didTimeout = false;

  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
  }

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort(new RequestTimeoutError(timeoutMs));
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...requestInit,
      signal: controller.signal,
    });
  } catch (error) {
    if (didTimeout) throw new RequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
}

export async function getResponseErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null) as {
      error?: unknown;
      message?: unknown;
    } | null;
    if (typeof payload?.error === 'string') return payload.error;
    if (typeof payload?.message === 'string') return payload.message;
  }

  const text = await response.text().catch(() => '');
  return text.trim() || fallback;
}
