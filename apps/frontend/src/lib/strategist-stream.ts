export type StrategistStreamEvent = {
  type?: string;
  chunk?: string;
  text?: string;
  message?: string;
  error?: string;
  data?: unknown;
  [key: string]: unknown;
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
