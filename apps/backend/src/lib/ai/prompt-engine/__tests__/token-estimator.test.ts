import { describe, test, expect, vi, beforeEach } from 'vitest';
import { PromptTokenEstimator } from '../token-estimator';
import { getProvider } from '../../providers/registry';
import type { AIProvider } from '../../providers/interface';

vi.mock('../../providers/registry', () => ({
  getProvider: vi.fn(),
}));

describe('PromptTokenEstimator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PromptTokenEstimator.clearCache();
  });

  test('estimateOffline should calculate based on XML vs text densities', () => {
    const text = 'Hello world, this is a plain text.';
    // plainText: 34 characters / 4.2 ≈ 9 tokens
    const est = PromptTokenEstimator.estimateOffline(text);
    expect(est).toBe(9);

    const xmlText = '<system_rule>Do not lie</system_rule>';
    // xmlTags: <system_rule></system_rule> (27 characters / 3.5 ≈ 8 tokens)
    // plainText: "Do not lie" (10 characters / 4.2 ≈ 3 tokens)
    // total: 11 tokens
    const estXml = PromptTokenEstimator.estimateOffline(xmlText);
    expect(estXml).toBe(11);
  });

  test('estimateOnlineCached should cache countTokens API call', async () => {
    const mockProvider = {
      name: 'gemini' as const,
      stream: vi.fn(),
      generate: vi.fn(),
      getCapabilities: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(15),
    };
    vi.mocked(getProvider).mockReturnValue(mockProvider as unknown as AIProvider);

    const text = 'Mock prompt for testing cache.';
    const model = 'gemini-3.5-flash';

    // First call: Should trigger API call
    const res1 = await PromptTokenEstimator.estimateOnlineCached(text, 'gemini', model);
    expect(res1).toBe(15);
    expect(mockProvider.countTokens).toHaveBeenCalledTimes(1);

    // Second call: Should read from in-memory cache
    const res2 = await PromptTokenEstimator.estimateOnlineCached(text, 'gemini', model);
    expect(res2).toBe(15);
    expect(mockProvider.countTokens).toHaveBeenCalledTimes(1); // Still 1
  });

  test('estimateOnlineCached should fall back to offline if countTokens is not supported', async () => {
    const mockProviderWithoutCount = {
      name: 'groq' as const,
      stream: vi.fn(),
      generate: vi.fn(),
      getCapabilities: vi.fn(),
    };
    vi.mocked(getProvider).mockReturnValue(mockProviderWithoutCount as unknown as AIProvider);

    const text = 'Fallback text count tokens.';
    const res = await PromptTokenEstimator.estimateOnlineCached(text, 'groq', 'qwen/qwen3-32b');
    expect(res).toBe(PromptTokenEstimator.estimateOffline(text));
  });
});
