import { describe, expect, test } from 'vitest';
import { estimateCost, PRICING_CATALOG } from '../pricing';

describe('prompt pricing estimates', () => {
  test('uses current Gemini 3.5 Flash Standard list pricing', () => {
    expect(PRICING_CATALOG['gemini-3.5-flash']).toEqual({
      inputCostPer1M: 1.5,
      inputCachedCostPer1M: 0.15,
      outputCostPer1M: 9,
    });
    expect(estimateCost('gemini-3.5-flash', 1_000_000, 1_000_000)).toEqual({
      inputUsd: 1.5,
      outputUsd: 9,
      totalUsd: 10.5,
    });
  });

  test('applies the documented 50 percent Flex discount', () => {
    expect(estimateCost(
      'gemini-3.1-flash-lite',
      1_000_000,
      1_000_000,
      0,
      'flex'
    )).toEqual({
      inputUsd: 0.125,
      outputUsd: 0.75,
      totalUsd: 0.875,
    });
  });
});
