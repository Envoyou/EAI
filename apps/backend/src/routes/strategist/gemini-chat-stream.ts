import type {
  StrategistSseEvent,
  StrategistThinkingKind,
} from './chat-protocol';

type GeminiInteractionStreamEvent = {
  event_type?: string;
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
