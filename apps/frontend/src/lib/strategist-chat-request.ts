import { REQUEST_TIMEOUT_MS, type TimeoutRequestInit } from '@/lib/fetch-utils';

type DirectFetch = (
  path: string,
  options?: TimeoutRequestInit
) => Promise<Response>;

export type StrategistChatResult = {
  sessionId: string;
  text: string;
  sources: { url: string; domain: string }[];
};

export type StrategistChatRecovery =
  | { status: 'completed'; result: StrategistChatResult }
  | {
      status: 'failed';
      error: { code: string; message: string };
    };

type StatusResponse = StrategistChatRecovery | { status: 'pending' };

type RecoveryOptions = {
  attempts?: number;
  delayMs?: number;
  signal?: AbortSignal;
  wait?: (delayMs: number) => Promise<void>;
};

const defaultWait = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export async function recoverStrategistChatRequest(
  directFetch: DirectFetch,
  requestId: string,
  options: RecoveryOptions = {}
): Promise<StrategistChatRecovery | null> {
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
        `/api/strategist/chat/request/${requestId}`,
        {
          signal,
          timeoutMs: REQUEST_TIMEOUT_MS.polling,
        }
      );
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) return null;
        continue;
      }

      const status = (await response.json()) as StatusResponse;
      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }
    } catch {
      if (signal?.aborted) return null;
    }
  }

  return null;
}
