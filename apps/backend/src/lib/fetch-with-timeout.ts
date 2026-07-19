export const DEFAULT_OUTBOUND_TIMEOUT_MS = 15_000;

export interface OutboundRequestInit extends RequestInit {
  timeoutMs?: number;
}

export class OutboundRequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Outbound request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = 'OutboundRequestTimeoutError';
  }
}

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: OutboundRequestInit = {}
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_OUTBOUND_TIMEOUT_MS,
    signal: externalSignal,
    ...requestInit
  } = init;
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new OutboundRequestTimeoutError(timeoutMs));
  }, timeoutMs);

  try {
    return await fetch(input, { ...requestInit, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new OutboundRequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}
