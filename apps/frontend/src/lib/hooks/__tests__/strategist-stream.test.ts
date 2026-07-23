import { describe, expect, test } from 'vitest';
import {
  getStrategistStreamError,
  parseStrategistSseLine,
  shouldShowAssistantSpinner,
} from '../../strategist-stream';

describe('Strategist SSE error contract', () => {
  test('preserves reasoning and grounding thinking kinds', () => {
    const reasoning = parseStrategistSseLine(
      'data: {"type":"thinking","kind":"reasoning","chunk":"Analyzing intent"}'
    );
    const grounding = parseStrategistSseLine(
      'data: {"type":"thinking","kind":"grounding","chunk":"Reviewing sources"}'
    );

    expect(reasoning).toMatchObject({
      type: 'thinking',
      kind: 'reasoning',
      chunk: 'Analyzing intent',
    });
    expect(grounding).toMatchObject({
      type: 'thinking',
      kind: 'grounding',
      chunk: 'Reviewing sources',
    });
  });

  test('accepts backend message, error, and data error shapes', () => {
    const messageEvent = parseStrategistSseLine('data: {"type":"error","message":"Stream failed"}');
    const errorEvent = parseStrategistSseLine('data: {"type":"error","error":"Grounding disabled"}');
    const dataEvent = parseStrategistSseLine('data: {"type":"error","data":"Rate limit reached"}');

    expect(messageEvent && getStrategistStreamError(messageEvent)).toBe('Stream failed');
    expect(errorEvent && getStrategistStreamError(errorEvent)).toBe('Grounding disabled');
    expect(dataEvent && getStrategistStreamError(dataEvent)).toBe('Rate limit reached');
  });

  test('ignores malformed and non-SSE lines', () => {
    expect(parseStrategistSseLine('not data')).toBeNull();
    expect(parseStrategistSseLine('data: {bad json')).toBeNull();
  });

  test('shows assistant spinner only for a pending lifecycle with status text', () => {
    expect(shouldShowAssistantSpinner('pending', 'Thinking...')).toBe(true);
    expect(shouldShowAssistantSpinner('success', 'Thinking...')).toBe(false);
    expect(shouldShowAssistantSpinner('error', 'Thinking...')).toBe(false);
    expect(shouldShowAssistantSpinner('cancelled', 'Thinking...')).toBe(false);
    expect(shouldShowAssistantSpinner('pending', undefined)).toBe(false);
  });
});
