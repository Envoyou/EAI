import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/queue';
import { AiProvider } from '@/lib/ai/provider-runtime';

const CACHE_TTL_SECONDS = 3600; // 1 hour

export interface AiConfig {
  provider: AiProvider;
  modelOverride: string | null;
}

export const resolveActiveAiConfig = async (
  userId: string,
  organizationId?: string | null
): Promise<AiConfig> => {
  const defaultProvider = (process.env.ACTIVE_AI_PROVIDER || 'gemini') as AiProvider;
  
  // Create a unique cache key based on org or user config
  const cacheKey = organizationId 
    ? `ai_config:org:${organizationId}` 
    : `ai_config:user:${userId}`;

  try {
    // 1. Check Redis Cache
    const cachedConfig = await redisConnection.get(cacheKey);
    if (cachedConfig) {
      return JSON.parse(cachedConfig) as AiConfig;
    }

    // 2. Cache Miss: Query Database
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

    // 3. Resolve config
    let provider: AiProvider = defaultProvider;
    let modelOverride: string | null = null;

    if (providerOverride) {
      if (providerOverride.includes(':')) {
        const parts = providerOverride.split(':');
        provider = parts[0] as AiProvider;
        modelOverride = parts[1] || null;
      } else {
        provider = providerOverride as AiProvider;
      }
    }

    const config: AiConfig = { provider, modelOverride };

    // 4. Save to Redis Cache
    await redisConnection.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(config));

    return config;
  } catch (error) {
    console.error('[AI Config Resolver] Error resolving AI config:', error);
    return { provider: defaultProvider, modelOverride: null };
  }
};

export const resolveActiveAiProvider = async (
  userId: string,
  organizationId?: string | null
): Promise<AiProvider> => {
  const config = await resolveActiveAiConfig(userId, organizationId);
  return config.provider;
};
