import { createHash } from 'node:crypto';
import type {
  ContentMemoryEnforcement,
  DuplicateGuardResult,
} from '@eai/shared';
import { getAllFeatureFlags } from '@eai/shared/server';
import { prisma } from '@/lib/db';

const numberSetting = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback;
};

export const getContentMemoryEnforcementConfig = () => ({
  confidenceThreshold: numberSetting(
    process.env.CONTENT_MEMORY_ENFORCEMENT_CONFIDENCE,
    0.92,
    0.82,
    1
  ),
  minimumLabeledSamples: Math.trunc(
    numberSetting(
      process.env.CONTENT_MEMORY_ENFORCEMENT_MIN_LABELS,
      50,
      10,
      10_000
    )
  ),
  targetPrecision: numberSetting(
    process.env.CONTENT_MEMORY_ENFORCEMENT_TARGET_PRECISION,
    0.95,
    0.8,
    1
  ),
  rolloutPercent: Math.trunc(
    numberSetting(
      process.env.CONTENT_MEMORY_ENFORCEMENT_ROLLOUT_PERCENT,
      10,
      0,
      100
    )
  ),
});

export const contentMemoryRolloutBucket = (organizationId: string): number => {
  const digest = createHash('sha256').update(organizationId).digest();
  return digest.readUInt32BE(0) % 100;
};

export const getContentMemoryCalibration = async (organizationId: string) => {
  const labels = await prisma.duplicateGuardEvent.groupBy({
    by: ['laterConfirmedDuplicate'],
    where: {
      organizationId,
      verdict: 'probable_duplicate',
      laterConfirmedDuplicate: { not: null },
    },
    _count: { _all: true },
  });
  const labeledSampleCount = labels.reduce(
    (total, item) => total + item._count._all,
    0
  );
  const confirmedDuplicateCount =
    labels.find((item) => item.laterConfirmedDuplicate === true)?._count
      ._all ?? 0;
  return {
    labeledSampleCount,
    confirmedDuplicateCount,
    measuredPrecision:
      labeledSampleCount > 0
        ? Number(
            (confirmedDuplicateCount / labeledSampleCount).toFixed(4)
          )
        : null,
  };
};

export const resolveContentMemoryEnforcement = (params: {
  result: DuplicateGuardResult;
  featureEnabled: boolean;
  inRollout: boolean;
  allowOverride: boolean;
  labeledSampleCount: number;
  confirmedDuplicateCount: number;
  config?: ReturnType<typeof getContentMemoryEnforcementConfig>;
}): DuplicateGuardResult => {
  const config = params.config ?? getContentMemoryEnforcementConfig();
  const measuredPrecision =
    params.labeledSampleCount > 0
      ? params.confirmedDuplicateCount / params.labeledSampleCount
      : null;
  const metadata = (
    overrides: Pick<
      ContentMemoryEnforcement,
      'mode' | 'reason' | 'overrideAllowed'
    >
  ): ContentMemoryEnforcement => ({
    ...overrides,
    confidenceThreshold: config.confidenceThreshold,
    minimumLabeledSamples: config.minimumLabeledSamples,
    labeledSampleCount: params.labeledSampleCount,
    measuredPrecision:
      measuredPrecision === null
        ? null
        : Number(measuredPrecision.toFixed(4)),
    targetPrecision: config.targetPrecision,
    rolloutPercent: config.rolloutPercent,
  });

  if (params.result.recommendedAction === 'block') {
    return {
      ...params.result,
      enforcement: metadata({
        mode: 'enforced',
        reason: params.result.reasons.includes('active_reservation')
          ? 'reservation_collision'
          : 'deterministic_block',
        overrideAllowed: false,
      }),
    };
  }

  if (params.result.verdict !== 'probable_duplicate') {
    return {
      ...params.result,
      enforcement: metadata({
        mode: 'advisory',
        reason: 'not_applicable',
        overrideAllowed: false,
      }),
    };
  }

  if (params.result.confidence < config.confidenceThreshold) {
    return {
      ...params.result,
      enforcement: metadata({
        mode: 'advisory',
        reason: 'below_confidence_threshold',
        overrideAllowed: false,
      }),
    };
  }

  let shadowReason: ContentMemoryEnforcement['reason'] | null = null;
  if (!params.featureEnabled) {
    shadowReason = 'feature_disabled';
  } else if (!params.inRollout) {
    shadowReason = 'outside_rollout';
  } else if (params.labeledSampleCount < config.minimumLabeledSamples) {
    shadowReason = 'insufficient_labeled_samples';
  } else if (
    measuredPrecision === null ||
    measuredPrecision < config.targetPrecision
  ) {
    shadowReason = 'precision_below_target';
  }

  if (shadowReason) {
    return {
      ...params.result,
      enforcement: metadata({
        mode: 'shadow',
        reason: shadowReason,
        overrideAllowed: false,
      }),
    };
  }

  if (params.allowOverride) {
    return {
      ...params.result,
      recommendedAction: 'continue_with_context',
      enforcement: metadata({
        mode: 'enforced',
        reason: 'explicit_override',
        overrideAllowed: true,
      }),
    };
  }

  return {
    ...params.result,
    recommendedAction: 'block',
    enforcement: metadata({
      mode: 'enforced',
      reason: 'calibrated_probable_duplicate',
      overrideAllowed: true,
    }),
  };
};

export const applyContentMemoryEnforcement = async (params: {
  organizationId: string;
  result: DuplicateGuardResult;
  allowOverride?: boolean;
}): Promise<DuplicateGuardResult> => {
  const config = getContentMemoryEnforcementConfig();
  if (
    params.result.recommendedAction === 'block' ||
    params.result.verdict !== 'probable_duplicate' ||
    params.result.confidence < config.confidenceThreshold
  ) {
    return resolveContentMemoryEnforcement({
      result: params.result,
      featureEnabled: false,
      inRollout: false,
      allowOverride: false,
      labeledSampleCount: 0,
      confirmedDuplicateCount: 0,
      config,
    });
  }

  const [flags, calibration] = await Promise.all([
    getAllFeatureFlags(),
    getContentMemoryCalibration(params.organizationId),
  ]);

  return resolveContentMemoryEnforcement({
    result: params.result,
    featureEnabled: flags.content_memory_enforcement_enabled,
    inRollout:
      contentMemoryRolloutBucket(params.organizationId) <
      config.rolloutPercent,
    allowOverride: params.allowOverride ?? false,
    labeledSampleCount: calibration.labeledSampleCount,
    confirmedDuplicateCount: calibration.confirmedDuplicateCount,
    config,
  });
};
