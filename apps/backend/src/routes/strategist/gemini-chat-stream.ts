import type {
  StrategistSseEvent,
  StrategistThinkingKind,
} from './chat-protocol';

type GeminiInteractionStreamEvent = {
  event_type?: string;
  error?: {
    code?: string;
    message?: string;
  };
  interaction?: {
    status?: string;
  };
  delta?: {
    type?: string;
    text?: string;
    content?: {
      type?: string;
      text?: string;
    };
    annotations?: Array<{
      type?: string;
      url?: string;
      title?: string;
    }>;
  };
};

export class GeminiInteractionStreamError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'GeminiInteractionStreamError';
    this.code = code;
  }
}

export function requireStrategistStreamOutput(text: string): string {
  if (!text.trim()) {
    throw new GeminiInteractionStreamError(
      'Gemini returned an empty strategist response',
      'UNAVAILABLE'
    );
  }
  return text;
}

export function readStrategistStreamFailure(
  rawEvent: unknown
): GeminiInteractionStreamError | null {
  const event = rawEvent as GeminiInteractionStreamEvent;
  if (event.event_type === 'error') {
    return new GeminiInteractionStreamError(
      event.error?.message || 'Gemini interaction stream failed',
      event.error?.code
    );
  }

  const completedStatus = event.interaction?.status?.toLowerCase();
  if (
    event.event_type === 'interaction.completed' &&
    (completedStatus === 'failed' || completedStatus === 'cancelled')
  ) {
    return new GeminiInteractionStreamError(
      `Gemini interaction completed with status ${completedStatus}`,
      completedStatus === 'cancelled' ? 'CANCELLED' : 'UNAVAILABLE'
    );
  }

  return null;
}

export function buildStrategistChatGenerationConfig(
  maxOutputTokens: number,
  isSearchEnabled: boolean
) {
  return {
    max_output_tokens: maxOutputTokens,
    thinking_level: isSearchEnabled ? 'medium' as const : 'low' as const,
    thinking_summaries: 'auto' as const,
  };
}

export function readStrategistThinkingEvent(
  rawEvent: unknown,
  kind: StrategistThinkingKind
): Extract<StrategistSseEvent, { type: 'thinking' }> | null {
  const event = rawEvent as GeminiInteractionStreamEvent;
  if (
    event.event_type !== 'step.delta' ||
    event.delta?.type !== 'thought_summary'
  ) {
    return null;
  }

  const chunk = event.delta.content?.text ?? '';
  if (!chunk) return null;

  return {
    type: 'thinking',
    kind,
    chunk,
  };
}

export type { GeminiInteractionStreamEvent };
