import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/queue';
import { AiProvider } from '@/lib/ai/provider-runtime';

const CACHE_TTL_SECONDS = 3600; // 1 hour

export const resolveActiveAiProvider = async (
  userId: string,
  organizationId?: string | null
): Promise<AiProvider> => {
  const defaultProvider = (process.env.ACTIVE_AI_PROVIDER || 'gemini') as AiProvider;
  
  // Create a unique cache key based on org or user
  const cacheKey = organizationId 
    ? `ai_provider:org:${organizationId}` 
    : `ai_provider:user:${userId}`;

  try {
    // 1. Check Redis Cache
    const cachedProvider = await redisConnection.get(cacheKey);
    if (cachedProvider) {
      return cachedProvider as AiProvider;
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

    // 3. Resolve final provider
    const resolvedProvider = (providerOverride || defaultProvider) as AiProvider;

    // 4. Save to Redis Cache
    await redisConnection.setex(cacheKey, CACHE_TTL_SECONDS, resolvedProvider);

    return resolvedProvider;
  } catch (error) {
    console.error('[AI Provider Resolver] Error resolving AI provider:', error);
    return defaultProvider; // Safe fallback on error
  }
};
