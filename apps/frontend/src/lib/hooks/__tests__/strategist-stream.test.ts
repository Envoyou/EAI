import { describe, expect, test } from 'vitest';
import {
  beginStrategistContentAnimation,
  completeStrategistMessageStream,
  getStrategistStreamError,
  parseStrategistSseLine,
  shouldShowAssistantSpinner,
  shouldShowStrategistMessageSupport,
  updateStrategistContentAnimation,
} from '../../strategist-stream';
import type { StrategistMessageSupportState } from '../../strategist-stream';

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

  test('reveals message support only after the stream and final animation complete', () => {
    let state: StrategistMessageSupportState = {
      lifecycle: 'pending',
      isStreamComplete: false,
      isSupportReady: false,
      ...beginStrategistContentAnimation(),
    };

    expect(shouldShowStrategistMessageSupport(state)).toBe(false);

    state = {
      ...state,
      ...completeStrategistMessageStream(state),
    };
    expect(state.lifecycle).toBe('success');
    expect(state.isSupportReady).toBe(false);
    expect(shouldShowStrategistMessageSupport(state)).toBe(false);

    state = {
      ...state,
      ...updateStrategistContentAnimation(state, true),
    };
    expect(state.isSupportReady).toBe(true);
    expect(shouldShowStrategistMessageSupport(state)).toBe(true);
  });

  test('reveals message support when the animation finishes before stream completion', () => {
    let state: StrategistMessageSupportState = {
      lifecycle: 'pending',
      isStreamComplete: false,
      isSupportReady: false,
      ...beginStrategistContentAnimation(),
    };

    state = {
      ...state,
      ...updateStrategistContentAnimation(state, true),
    };
    expect(shouldShowStrategistMessageSupport(state)).toBe(false);

    state = {
      ...state,
      ...completeStrategistMessageStream(state),
    };
    expect(state.isSupportReady).toBe(true);
    expect(shouldShowStrategistMessageSupport(state)).toBe(true);
  });
});
