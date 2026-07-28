import { describe, expect, test } from 'vitest';
import {
  buildStrategistChatGenerationConfig,
  GeminiInteractionStreamError,
  isEmptyStrategistStreamError,
  readStrategistThinkingEvent,
  readStrategistStreamFailure,
  requireStrategistStreamOutput,
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

  test('surfaces provider error events so the full stream can be retried', () => {
    const error = readStrategistStreamFailure({
      event_type: 'error',
      error: {
        code: 'UNAVAILABLE',
        message: 'Temporary provider capacity failure',
      },
    });

    expect(error).toMatchObject({
      name: 'GeminiInteractionStreamError',
      code: 'UNAVAILABLE',
      message: 'Temporary provider capacity failure',
    });
  });

  test('treats failed interaction completion as a retryable provider failure', () => {
    expect(readStrategistStreamFailure({
      event_type: 'interaction.completed',
      interaction: { status: 'failed' },
    })).toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  test('allows completed and incomplete interactions with usable text', () => {
    expect(readStrategistStreamFailure({
      event_type: 'interaction.completed',
      interaction: { status: 'completed' },
    })).toBeNull();
    expect(readStrategistStreamFailure({
      event_type: 'interaction.completed',
      interaction: { status: 'incomplete' },
    })).toBeNull();
  });

  test('marks an empty completed stream as retryable provider unavailability', () => {
    expect(() => requireStrategistStreamOutput(' \n ')).toThrow(
      expect.objectContaining({
        name: 'GeminiInteractionStreamError',
        code: 'UNAVAILABLE',
        message: 'Gemini returned an empty strategist response',
      })
    );
  });

  test('preserves non-empty stream output', () => {
    expect(requireStrategistStreamOutput('Completed response')).toBe(
      'Completed response'
    );
  });

  test('identifies only the empty-stream failure for fallback handling', () => {
    expect(isEmptyStrategistStreamError(
      new GeminiInteractionStreamError(
        'Gemini returned an empty strategist response',
        'UNAVAILABLE'
      )
    )).toBe(true);
    expect(isEmptyStrategistStreamError(
      new GeminiInteractionStreamError('Other provider failure', 'UNAVAILABLE')
    )).toBe(false);
    expect(isEmptyStrategistStreamError(new Error('Other failure'))).toBe(false);
  });
});
