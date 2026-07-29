export type StrategistStreamEvent = {
  type?: string;
  kind?: 'reasoning' | 'grounding';
  chunk?: string;
  text?: string;
  message?: string;
  error?: string;
  code?: string;
  data?: unknown;
  [key: string]: unknown;
};

export type StrategistMessageSupportState = {
  lifecycle?: 'pending' | 'success' | 'error' | 'cancelled';
  isContentAnimating?: boolean;
  isStreamComplete?: boolean;
  isSupportReady?: boolean;
};

export function parseStrategistSseLine(line: string): StrategistStreamEvent | null {
  if (!line.trim().startsWith('data: ')) return null;
  try {
    return JSON.parse(line.trim().slice(6)) as StrategistStreamEvent;
  } catch {
    return null;
  }
}

export function getStrategistStreamError(event: StrategistStreamEvent): string {
  if (typeof event.message === 'string' && event.message.trim()) return event.message;
  if (typeof event.error === 'string' && event.error.trim()) return event.error;
  if (typeof event.data === 'string' && event.data.trim()) return event.data;
  return 'Strategist stream failed.';
}

export function shouldShowAssistantSpinner(
  lifecycle: string | undefined,
  status: string | undefined
): boolean {
  return lifecycle === 'pending' && Boolean(status);
}

export function beginStrategistContentAnimation(): Pick<
  StrategistMessageSupportState,
  'isContentAnimating' | 'isSupportReady'
> {
  return {
    isContentAnimating: true,
    isSupportReady: false,
  };
}

export function updateStrategistContentAnimation(
  state: StrategistMessageSupportState | undefined,
  complete: boolean
): Pick<
  StrategistMessageSupportState,
  'isContentAnimating' | 'isSupportReady'
> {
  return {
    isContentAnimating: !complete,
    isSupportReady: complete && state?.isStreamComplete === true,
  };
}

export function completeStrategistMessageStream(
  state: StrategistMessageSupportState | undefined
): Required<
  Pick<
    StrategistMessageSupportState,
    'lifecycle' | 'isStreamComplete' | 'isSupportReady'
  >
> {
  return {
    lifecycle: 'success',
    isStreamComplete: true,
    isSupportReady: state?.isContentAnimating !== true,
  };
}

export function shouldShowStrategistMessageSupport(
  state: StrategistMessageSupportState | undefined
): boolean {
  if (state?.lifecycle === 'pending') return false;
  if (state?.isContentAnimating === true) return false;
  if (state?.lifecycle === 'success') return state.isSupportReady !== false;
  return true;
}
