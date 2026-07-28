export type StrategistChatFailure = {
  code:
    | 'PROVIDER_RATE_LIMIT'
    | 'PROVIDER_UNAVAILABLE'
    | 'PROVIDER_TIMEOUT'
    | 'REQUEST_CANCELLED'
    | 'CHAT_FAILED';
  message: string;
};

const readErrorStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) {
    const match = String(error).match(/\b(408|429|500|502|503|504)\b/);
    return match ? Number(match[1]) : undefined;
  }

  const candidate = error as {
    status?: unknown;
    code?: unknown;
    error?: { status?: unknown; code?: unknown };
    message?: unknown;
  };
  for (const value of [
    candidate.status,
    candidate.code,
    candidate.error?.status,
    candidate.error?.code,
  ]) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  const messageMatch = String(candidate.message ?? '').match(
    /\b(408|429|500|502|503|504)\b/
  );
  if (messageMatch) return Number(messageMatch[1]);
  return undefined;
};

export const classifyStrategistChatFailure = (
  error: unknown
): StrategistChatFailure => {
  const name =
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string'
      ? error.name
      : '';
  const status = readErrorStatus(error);

  if (name === 'AbortError') {
    return {
      code: 'REQUEST_CANCELLED',
      message: 'Chat request was cancelled.',
    };
  }
  if (status === 429) {
    return {
      code: 'PROVIDER_RATE_LIMIT',
      message: 'The AI service is busy. Please retry in a moment.',
    };
  }
  if (status === 408 || status === 504) {
    return {
      code: 'PROVIDER_TIMEOUT',
      message: 'The AI service timed out before completing the response.',
    };
  }
  if (status === 500 || status === 502 || status === 503) {
    return {
      code: 'PROVIDER_UNAVAILABLE',
      message: 'The AI service is temporarily unavailable. Please retry.',
    };
  }
  return {
    code: 'CHAT_FAILED',
    message: 'The strategist could not complete this response.',
  };
};
