import { describe, expect, test } from 'vitest';
import {
  getStrategistFastChatModel,
  MODEL,
  STRATEGIST_SEARCH_MODEL,
} from '../utils/helpers';

describe('Strategist Fast Chat model routing', () => {
  test('uses the full grounding model when Search is enabled', () => {
    expect(getStrategistFastChatModel(true)).toBe(STRATEGIST_SEARCH_MODEL);
  });

  test('retains the lightweight model when Search is disabled', () => {
    expect(getStrategistFastChatModel(false)).toBe(MODEL);
  });
});
