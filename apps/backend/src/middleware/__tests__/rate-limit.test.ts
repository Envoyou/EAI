import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({
  ensureRequestRedisConnection: vi.fn(),
  requestRedisConnection: { eval: vi.fn() },
}));

import { ensureRequestRedisConnection } from '@/lib/redis';
import { consumeRateLimit, redisRateLimiter } from '../rate-limit';

const options = {
  namespace: 'test:endpoint',
  windowMs: 60_000,
  max: 5,
  message: 'Too many requests',
};

describe('consumeRateLimit', () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_REDIS_PREFIX;
    delete process.env.RATE_LIMIT_FAIL_OPEN;
    vi.clearAllMocks();
  });

  test('allows requests within the distributed Redis window', async () => {
    const evalMock = vi.fn().mockResolvedValue([2, 45_000]);
    const result = await consumeRateLimit(
      { eval: evalMock } as never,
      options,
      'user_123'
    );

    expect(result).toEqual({
      count: 2,
      remaining: 3,
      retryAfterMs: 45_000,
      allowed: true,
    });
    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR', KEYS[1])"),
      1,
      expect.stringMatching(/^eai:rate-limit:test:endpoint:[a-f0-9]{32}$/),
      '60000'
    );
  });

  test('rejects requests after the shared limit is exhausted', async () => {
    const result = await consumeRateLimit(
      { eval: vi.fn().mockResolvedValue([6, 5_000]) } as never,
      options,
      'user_123'
    );

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBe(5_000);
  });

  test('rejects malformed Redis results', async () => {
    await expect(
      consumeRateLimit(
        { eval: vi.fn().mockResolvedValue('invalid') } as never,
        options,
        'user_123'
      )
    ).rejects.toThrow('Invalid Redis rate-limit response');
  });

  test('fails closed when Redis protection is unavailable', async () => {
    vi.mocked(ensureRequestRedisConnection).mockRejectedValueOnce(
      new Error('Redis unavailable')
    );
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();

    await redisRateLimiter(options)(
      { auth: { userId: 'user_123' } } as never,
      { setHeader: vi.fn(), status } as never,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      error: 'Request protection is temporarily unavailable. Please try again later.',
    });
  });
});
