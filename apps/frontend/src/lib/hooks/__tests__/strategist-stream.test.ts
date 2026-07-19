import { describe, expect, test } from 'vitest';
import {
  getStrategistStreamError,
  parseStrategistSseLine,
} from '../../strategist-stream';

describe('Strategist SSE error contract', () => {
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
});
