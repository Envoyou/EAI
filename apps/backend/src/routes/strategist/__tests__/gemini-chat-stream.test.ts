import { describe, expect, test } from 'vitest';
import {
  buildStrategistChatGenerationConfig,
  readStrategistThinkingEvent,
} from '../gemini-chat-stream';

describe('Gemini Strategist chat stream adapter', () => {
  test('requests thought summaries with balanced reasoning for grounded chat', () => {
    expect(buildStrategistChatGenerationConfig(2048, true)).toEqual({
      max_output_tokens: 2048,
      thinking_level: 'medium',
      thinking_summaries: 'auto',
    });
  });

  test('requests thought summaries with low reasoning for chat without search', () => {
    expect(buildStrategistChatGenerationConfig(1024, false)).toEqual({
      max_output_tokens: 1024,
      thinking_level: 'low',
      thinking_summaries: 'auto',
    });
  });

  test('converts a Gemini thought summary delta to the public SSE contract', () => {
    expect(readStrategistThinkingEvent({
      event_type: 'step.delta',
      index: 0,
      delta: {
        type: 'thought_summary',
        content: {
          type: 'text',
          text: 'Comparing the available editorial signals.',
        },
      },
    }, 'reasoning')).toEqual({
      type: 'thinking',
      kind: 'reasoning',
      chunk: 'Comparing the available editorial signals.',
    });
  });

  test('ignores signatures, answer text, and empty thought summaries', () => {
    expect(readStrategistThinkingEvent({
      event_type: 'step.delta',
      delta: { type: 'thought_signature', signature: 'signed' },
    }, 'reasoning')).toBeNull();

    expect(readStrategistThinkingEvent({
      event_type: 'step.delta',
      delta: { type: 'text', text: 'Final answer' },
    }, 'reasoning')).toBeNull();

    expect(readStrategistThinkingEvent({
      event_type: 'step.delta',
      delta: {
        type: 'thought_summary',
        content: { type: 'text', text: '' },
      },
    }, 'reasoning')).toBeNull();
  });
});
