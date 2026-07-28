import {
  AiRuntimeConfigSchema,
  type AiFunctionKey,
  type AiProviderModel,
  type AiProviderName,
  type AiRuntimeConfig,
  isProviderAllowedForAiFunction,
} from '@eai/shared';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/redis';

const CACHE_TTL_SECONDS = 3600;

export interface AiConfig extends AiRuntimeConfig {
  /** Backward-compatible aliases consumed by legacy callers. */
  provider: AiProviderName;
  modelOverride: string | null;
}

const getEnvironmentDefault = (): AiProviderModel => ({
  provider: (
    ['gemini', 'groq', 'openrouter'].includes(
      process.env.ACTIVE_AI_PROVIDER || ''
    )
      ? process.env.ACTIVE_AI_PROVIDER
      : 'gemini'
  ) as AiProviderName,
  model: null,
});

export const createDefaultAiRuntimeConfig = (): AiRuntimeConfig => ({
  version: 1,
  default: getEnvironmentDefault(),
  functions: {},
});

export function parseStoredAiRuntimeConfig(
  stored: string | null | undefined
): AiRuntimeConfig {
  const fallback = createDefaultAiRuntimeConfig();
  if (!stored) return fallback;

  if (stored.trim().startsWith('{')) {
    try {
      const parsed = AiRuntimeConfigSchema.safeParse(JSON.parse(stored));
      if (parsed.success) return parsed.data;
    } catch {
      return fallback;
    }
    return fallback;
  }

  const separatorIndex = stored.indexOf(':');
  const providerValue =
    separatorIndex >= 0 ? stored.slice(0, separatorIndex) : stored;
  const modelValue =
    separatorIndex >= 0 ? stored.slice(separatorIndex + 1) : '';
  const provider = (
    ['gemini', 'groq', 'openrouter'].includes(providerValue)
      ? providerValue
      : fallback.default.provider
  ) as AiProviderName;

  return {
    version: 1,
    default: {
      provider,
      model: modelValue || null,
    },
    functions: {},
  };
}

export const serializeAiRuntimeConfig = (config: AiRuntimeConfig): string =>
  JSON.stringify(AiRuntimeConfigSchema.parse(config));

const withLegacyAliases = (config: AiRuntimeConfig): AiConfig => ({
  ...config,
  provider: config.default.provider,
  modelOverride: config.default.model,
});

const parseCachedConfig = (cached: string): AiConfig | null => {
  try {
    const value = JSON.parse(cached) as unknown;
    const modern = AiRuntimeConfigSchema.safeParse(value);
    if (modern.success) return withLegacyAliases(modern.data);

    if (
      typeof value === 'object' &&
      value !== null &&
      'provider' in value
    ) {
      const legacy = value as {
        provider?: unknown;
        modelOverride?: unknown;
      };
      if (
        typeof legacy.provider === 'string' &&
        ['gemini', 'groq', 'openrouter'].includes(legacy.provider)
      ) {
        return withLegacyAliases({
          version: 1,
          default: {
            provider: legacy.provider as AiProviderName,
            model:
              typeof legacy.modelOverride === 'string'
                ? legacy.modelOverride
                : null,
          },
          functions: {},
        });
      }
    }
  } catch {
    return null;
  }
  return null;
};

export const resolveActiveAiConfig = async (
  userId: string,
  organizationId?: string | null
): Promise<AiConfig> => {
  const cacheKey = organizationId
    ? `ai_config:org:${organizationId}`
    : `ai_config:user:${userId}`;

  try {
    const cachedConfig = await redisConnection.get(cacheKey);
    if (cachedConfig) {
      const parsed = parseCachedConfig(cachedConfig);
      if (parsed) return parsed;
    }

    let providerOverride: string | null = null;
    if (organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { aiProviderOverride: true },
      });
      providerOverride = org?.aiProviderOverride || null;
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { aiProviderOverride: true },
      });
      providerOverride = user?.aiProviderOverride || null;
    }

    const config = withLegacyAliases(
      parseStoredAiRuntimeConfig(providerOverride)
    );
    await redisConnection.setex(
      cacheKey,
      CACHE_TTL_SECONDS,
      JSON.stringify(config)
    );
    return config;
  } catch (error) {
    console.error('[AI Config Resolver] Error resolving AI config:', error);
    return withLegacyAliases(createDefaultAiRuntimeConfig());
  }
};

export function resolveAiFunctionConfig(
  config: AiRuntimeConfig,
  key: AiFunctionKey
): AiProviderModel {
  const requested = config.functions[key] ?? config.default;
  if (isProviderAllowedForAiFunction(key, requested.provider)) {
    return requested;
  }

  return {
    provider: 'gemini',
    model: null,
  };
}

export const resolveActiveAiFunctionConfig = async (
  userId: string,
  organizationId: string | null | undefined,
  key: AiFunctionKey
): Promise<AiProviderModel> =>
  resolveAiFunctionConfig(
    await resolveActiveAiConfig(userId, organizationId),
    key
  );

export const resolveActiveAiProvider = async (
  userId: string,
  organizationId?: string | null
): Promise<AiProviderName> => {
  const config = await resolveActiveAiConfig(userId, organizationId);
  return config.default.provider;
};
