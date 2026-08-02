import { REQUEST_TIMEOUT_MS, type TimeoutRequestInit } from '@/lib/fetch-utils';
import type { DuplicateGuardResult } from '@eai/shared';

type DirectFetch = (
  path: string,
  options?: TimeoutRequestInit
) => Promise<Response>;

export type StrategistPlanResult<TPlan = unknown> = {
  reply?: string;
  suggestions?: string[];
  plan?: TPlan;
  sessionId?: string | null;
  sourceRef?: string;
  duplicateGuard?: DuplicateGuardResult | null;
};

type PlanRequestStatus<TPlan> = {
  status?: 'pending' | 'completed' | 'failed';
  result?: StrategistPlanResult<TPlan>;
  error?: string | null;
};

type RecoveryOptions = {
  attempts?: number;
  delayMs?: number;
  signal?: AbortSignal;
  wait?: (delayMs: number) => Promise<void>;
};

const defaultWait = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export async function recoverStrategistPlanResult<TPlan>(
  directFetch: DirectFetch,
  requestId: string,
  options: RecoveryOptions = {}
): Promise<StrategistPlanResult<TPlan> | null> {
  const {
    attempts = 4,
    delayMs = 750,
    signal,
    wait = defaultWait,
  } = options;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) return null;

    if (attempt > 0) {
      await wait(delayMs);
      if (signal?.aborted) return null;
    }

    try {
      const response = await directFetch(
        `/api/strategist/generate-plan/${requestId}`,
        {
          signal,
          timeoutMs: REQUEST_TIMEOUT_MS.polling,
        }
      );

      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) return null;
        continue;
      }

      const status = (await response.json()) as PlanRequestStatus<TPlan>;
      if (status.status === 'completed' && status.result) {
        return status.result;
      }
      if (status.status === 'failed') {
        return null;
      }
    } catch {
      if (signal?.aborted) return null;
    }
  }

  return null;
}
