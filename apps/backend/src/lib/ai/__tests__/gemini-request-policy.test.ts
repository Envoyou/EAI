import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  getGeminiGenerateConfig,
  getGeminiInteractionConfig,
  getGeminiInteractionRequestOptions,
  isGeminiGroundingDisabledForTests,
  isRetryableGeminiFlexError,
  resolveGeminiServiceTier,
  withGeminiFlexRetry,
} from '../gemini-request-policy';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('Gemini request policy', () => {
  test('defaults to Standard without changing outbound request config', () => {
    delete process.env.GEMINI_SERVICE_TIER;

    expect(resolveGeminiServiceTier()).toBe('standard');
    expect(getGeminiGenerateConfig()).toEqual({});
    expect(getGeminiInteractionConfig()).toEqual({});
    expect(getGeminiInteractionRequestOptions()).toBeUndefined();
  });

  test('maps Flex to both Gemini API request shapes and a long timeout', () => {
    process.env.GEMINI_SERVICE_TIER = 'flex';
    process.env.GEMINI_FLEX_TIMEOUT_MS = '720000';

    expect(getGeminiGenerateConfig()).toEqual({
      serviceTier: 'flex',
      httpOptions: { timeout: 720_000 },
    });
    expect(getGeminiInteractionConfig()).toEqual({ service_tier: 'flex' });
    expect(getGeminiInteractionRequestOptions()).toEqual({ timeout: 720_000 });
  });

  test('disables paid grounding only when the explicit test guard is enabled', () => {
    delete process.env.GEMINI_DISABLE_GROUNDING_FOR_TESTS;
    expect(isGeminiGroundingDisabledForTests()).toBe(false);

    process.env.GEMINI_DISABLE_GROUNDING_FOR_TESTS = 'true';
    expect(isGeminiGroundingDisabledForTests()).toBe(true);
  });

  test('retries only Flex capacity errors with exponential backoff', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ code: 'RESOURCE_EXHAUSTED' })
      .mockResolvedValue('ok');
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withGeminiFlexRetry(operation, {
      serviceTier: 'flex',
      maxRetries: 2,
      baseDelayMs: 100,
      sleep,
    })).resolves.toBe('ok');

    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  test('does not retry validation errors or upgrade to Standard', async () => {
    const error = { status: 400, message: 'Invalid request' };
    const operation = vi.fn().mockRejectedValue(error);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withGeminiFlexRetry(operation, {
      serviceTier: 'flex',
      maxRetries: 2,
      sleep,
    })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('recognizes common Gemini capacity error shapes', () => {
    expect(isRetryableGeminiFlexError({ status: 429 })).toBe(true);
    expect(isRetryableGeminiFlexError({ error: { code: 'UNAVAILABLE' } })).toBe(true);
    expect(isRetryableGeminiFlexError(new Error('Request failed with 503'))).toBe(true);
    expect(isRetryableGeminiFlexError({ status: 500 })).toBe(false);
  });

  test('stops Flex backoff immediately when the request is aborted', async () => {
    const controller = new AbortController();
    const operation = vi.fn().mockRejectedValue({ status: 503 });
    const sleep = vi.fn(() => new Promise<void>(() => undefined));

    const retry = withGeminiFlexRetry(operation, {
      serviceTier: 'flex',
      signal: controller.signal,
      sleep,
    });
    controller.abort(new Error('Client disconnected'));

    await expect(retry).rejects.toThrow('Client disconnected');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
