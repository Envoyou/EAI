import { describe, expect, test } from 'vitest';
import { AiTelemetryCollector } from '../ai-telemetry';

describe('AI telemetry service-tier pricing', () => {
  test('records Flex tier and halves Gemini token cost estimates', () => {
    const telemetry = new AiTelemetryCollector();

    telemetry.recordGemini({
      stage: 'flex_smoke_test',
      model: 'gemini-3.5-flash',
      serviceTier: 'flex',
      durationMs: 100,
      usage: {
        promptTokenCount: 1_000_000,
        candidatesTokenCount: 1_000_000,
        totalTokenCount: 2_000_000,
      },
    });

    const snapshot = telemetry.snapshot();
    expect(snapshot.pricingVersion).toBe('2026-07-19');
    expect(snapshot.estimatedCostUsd).toBe(5.25);
    expect(snapshot.stages[0]).toEqual(expect.objectContaining({
      serviceTier: 'flex',
      estimatedCostUsd: 5.25,
    }));
  });
});
