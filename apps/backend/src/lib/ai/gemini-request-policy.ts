import { ServiceTier } from '@google/genai';

export type GeminiServiceTier = 'standard' | 'flex';

const DEFAULT_FLEX_TIMEOUT_MS = 900_000;
const DEFAULT_FLEX_MAX_RETRIES = 2;
const DEFAULT_FLEX_RETRY_BASE_DELAY_MS = 5_000;
const MAX_FLEX_RETRIES = 5;

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER
) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
};

export function resolveGeminiServiceTier(
  override?: GeminiServiceTier
): GeminiServiceTier {
  if (override) return override;
  return process.env.GEMINI_SERVICE_TIER?.trim().toLowerCase() === 'flex'
    ? 'flex'
    : 'standard';
}

export function isGeminiGroundingDisabledForTests(): boolean {
  return process.env.GEMINI_DISABLE_GROUNDING_FOR_TESTS?.trim().toLowerCase() === 'true';
}

export function getGeminiRequestTimeoutMs(
  serviceTier = resolveGeminiServiceTier()
): number | undefined {
  if (serviceTier !== 'flex') return undefined;
  return parsePositiveInteger(
    process.env.GEMINI_FLEX_TIMEOUT_MS,
    DEFAULT_FLEX_TIMEOUT_MS
  );
}

export function getGeminiGenerateConfig(
  serviceTier = resolveGeminiServiceTier()
) {
  if (serviceTier !== 'flex') return {};

  return {
    serviceTier: ServiceTier.FLEX,
    httpOptions: {
      timeout: getGeminiRequestTimeoutMs(serviceTier),
    },
  };
}

export function getGeminiInteractionConfig(
  serviceTier = resolveGeminiServiceTier()
) {
  return serviceTier === 'flex'
    ? { service_tier: 'flex' as const }
    : {};
}

export function getGeminiInteractionRequestOptions(
  serviceTier = resolveGeminiServiceTier(),
  signal?: AbortSignal
) {
  const timeout = getGeminiRequestTimeoutMs(serviceTier);
  if (!timeout && !signal) return undefined;
  return {
    ...(timeout ? { timeout } : {}),
    ...(signal ? { abortSignal: signal } : {}),
  };
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    const match = String(error).match(/\b(429|503)\b/);
    return match ? Number(match[1]) : undefined;
  }

  const candidate = error as {
    status?: unknown;
    code?: unknown;
    error?: { status?: unknown; code?: unknown };
    message?: unknown;
  };
  const values = [
    candidate.status,
    candidate.code,
    candidate.error?.status,
    candidate.error?.code,
  ];

  for (const value of values) {
    if (value === 429 || value === 503) return value;
    if (value === '429' || value === 'RESOURCE_EXHAUSTED') return 429;
    if (value === '503' || value === 'UNAVAILABLE') return 503;
  }

  const match = String(candidate.message ?? '').match(/\b(429|503)\b/);
  return match ? Number(match[1]) : undefined;
}

export function isRetryableGeminiFlexError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === 429 || status === 503;
}

interface GeminiFlexRetryOptions {
  serviceTier?: GeminiServiceTier;
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  signal?: AbortSignal;
  onRetry?: (input: { attempt: number; delayMs: number; error: unknown }) => void;
}

const sleepWithSignal = (
  sleep: (delayMs: number) => Promise<void>,
  delayMs: number,
  signal?: AbortSignal
) => {
  if (!signal) return sleep(delayMs);
  signal.throwIfAborted();

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('Request aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    sleep(delayMs).then(
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
};

export async function withGeminiFlexRetry<T>(
  operation: () => Promise<T>,
  options: GeminiFlexRetryOptions = {}
): Promise<T> {
  const serviceTier = resolveGeminiServiceTier(options.serviceTier);
  if (serviceTier !== 'flex') return operation();

  const maxRetries = options.maxRetries ?? parsePositiveInteger(
    process.env.GEMINI_FLEX_MAX_RETRIES,
    DEFAULT_FLEX_MAX_RETRIES,
    MAX_FLEX_RETRIES
  );
  const baseDelayMs = options.baseDelayMs ?? parsePositiveInteger(
    process.env.GEMINI_FLEX_RETRY_BASE_DELAY_MS,
    DEFAULT_FLEX_RETRY_BASE_DELAY_MS
  );
  const sleep = options.sleep ?? ((delayMs: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

  for (let attempt = 0; ; attempt += 1) {
    options.signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries || !isRetryableGeminiFlexError(error)) {
        throw error;
      }

      const delayMs = baseDelayMs * (2 ** attempt);
      options.onRetry?.({ attempt: attempt + 1, delayMs, error });
      await sleepWithSignal(sleep, delayMs, options.signal);
    }
  }
}
