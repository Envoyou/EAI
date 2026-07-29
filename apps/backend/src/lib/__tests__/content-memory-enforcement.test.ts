import { describe, expect, it } from 'vitest';
import type { DuplicateGuardResult } from '@eai/shared';
import {
  contentMemoryRolloutBucket,
  resolveContentMemoryEnforcement,
} from '@/lib/content-memory-enforcement';

const probable = (
  overrides: Partial<DuplicateGuardResult> = {}
): DuplicateGuardResult => ({
  verdict: 'probable_duplicate',
  confidence: 0.96,
  reasons: ['semantic_similarity', 'same_search_intent'],
  matchedArtifacts: [],
  recommendedAction: 'require_confirmation',
  ...overrides,
});

const config = {
  confidenceThreshold: 0.92,
  minimumLabeledSamples: 50,
  targetPrecision: 0.95,
  rolloutPercent: 10,
};

describe('Content Memory controlled enforcement', () => {
  it('assigns a stable organization rollout bucket', () => {
    expect(contentMemoryRolloutBucket('org_123')).toBe(
      contentMemoryRolloutBucket('org_123')
    );
    expect(contentMemoryRolloutBucket('org_123')).toBeGreaterThanOrEqual(0);
    expect(contentMemoryRolloutBucket('org_123')).toBeLessThan(100);
  });

  it('keeps probable duplicates in shadow mode until labels are sufficient', () => {
    const result = resolveContentMemoryEnforcement({
      result: probable(),
      featureEnabled: true,
      inRollout: true,
      allowOverride: false,
      labeledSampleCount: 49,
      confirmedDuplicateCount: 49,
      config,
    });

    expect(result.recommendedAction).toBe('require_confirmation');
    expect(result.enforcement).toMatchObject({
      mode: 'shadow',
      reason: 'insufficient_labeled_samples',
      overrideAllowed: false,
    });
  });

  it('does not enforce when measured precision misses the target', () => {
    const result = resolveContentMemoryEnforcement({
      result: probable(),
      featureEnabled: true,
      inRollout: true,
      allowOverride: false,
      labeledSampleCount: 100,
      confirmedDuplicateCount: 94,
      config,
    });

    expect(result.enforcement?.reason).toBe('precision_below_target');
    expect(result.enforcement?.measuredPrecision).toBe(0.94);
  });

  it('blocks only calibrated high-confidence probable duplicates', () => {
    const result = resolveContentMemoryEnforcement({
      result: probable(),
      featureEnabled: true,
      inRollout: true,
      allowOverride: false,
      labeledSampleCount: 100,
      confirmedDuplicateCount: 97,
      config,
    });

    expect(result.recommendedAction).toBe('block');
    expect(result.enforcement).toMatchObject({
      mode: 'enforced',
      reason: 'calibrated_probable_duplicate',
      measuredPrecision: 0.97,
      overrideAllowed: true,
    });
  });

  it('requires an explicit override and never overrides deterministic blocks', () => {
    const overridden = resolveContentMemoryEnforcement({
      result: probable(),
      featureEnabled: true,
      inRollout: true,
      allowOverride: true,
      labeledSampleCount: 100,
      confirmedDuplicateCount: 97,
      config,
    });
    expect(overridden.recommendedAction).toBe('continue_with_context');
    expect(overridden.enforcement?.reason).toBe('explicit_override');

    const exact = resolveContentMemoryEnforcement({
      result: probable({
        verdict: 'exact_duplicate',
        confidence: 1,
        reasons: ['same_title'],
        recommendedAction: 'block',
      }),
      featureEnabled: true,
      inRollout: true,
      allowOverride: true,
      labeledSampleCount: 100,
      confirmedDuplicateCount: 100,
      config,
    });
    expect(exact.recommendedAction).toBe('block');
    expect(exact.enforcement?.overrideAllowed).toBe(false);
    expect(exact.enforcement?.reason).toBe('deterministic_block');
  });
});
