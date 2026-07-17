import { createHash } from 'node:crypto';
import { getProvider } from '../providers/registry';

interface CacheEntry {
  tokenCount: number;
  expiresAt: number;
}

const onlineCountCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 Minutes

export class PromptTokenEstimator {
  /**
   * Estimates token count offline using a weighted character ratio.
   * Tag/XML syntax is estimated at ~3.5 chars/token, regular text at ~4.2 chars/token.
   */
  static estimateOffline(text: string): number {
    if (!text) return 0;
    const xmlTagRegex = /<[^>]+>/g;
    const xmlTags = text.match(xmlTagRegex) || [];
    const plainText = text.replace(xmlTagRegex, '');
    const xmlTagsLength = xmlTags.join('').length;
    const plainTextLength = plainText.length;

    const xmlTokens = Math.ceil(xmlTagsLength / 3.5);
    const plainTokens = Math.ceil(plainTextLength / 4.2);

    return xmlTokens + plainTokens;
  }

  /**
   * Counts tokens online via the provider (if supported).
   * Caches results in memory using SHA-256 for 30 minutes.
   * Falls back to estimateOffline on unsupported providers or failures.
   */
  static async estimateOnlineCached(
    text: string,
    providerName: 'gemini' | 'groq' | 'openrouter',
    model: string
  ): Promise<number> {
    const provider = getProvider(providerName);
    if (!provider.countTokens) {
      return this.estimateOffline(text);
    }

    const sha256 = createHash('sha256').update(`${model}:${text}`).digest('hex');
    const cached = onlineCountCache.get(sha256);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tokenCount;
    }

    try {
      const tokenCount = await provider.countTokens(model, text);
      onlineCountCache.set(sha256, {
        tokenCount,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return tokenCount;
    } catch (err) {
      console.warn(`[TokenEstimator] Online count failed for ${providerName}. Falling back to offline.`, err);
      return this.estimateOffline(text);
    }
  }

  /**
   * Helper to clear token counting cache (mostly for tests).
   */
  static clearCache(): void {
    onlineCountCache.clear();
  }
}
