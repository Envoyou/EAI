import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type Redis from 'ioredis';
import {
  ensureRequestRedisConnection,
  requestRedisConnection,
} from '@/lib/redis';

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

type RateLimitRedis = Pick<Redis, 'eval'>;

export interface RateLimitOptions {
  namespace: string;
  windowMs: number;
  max: number;
  message: string;
}

export interface RateLimitResult {
  count: number;
  remaining: number;
  retryAfterMs: number;
  allowed: boolean;
}

const hashIdentity = (identity: string) =>
  createHash('sha256').update(identity).digest('hex').slice(0, 32);

export async function consumeRateLimit(
  redis: RateLimitRedis,
  options: RateLimitOptions,
  identity: string
): Promise<RateLimitResult> {
  const prefix = process.env.RATE_LIMIT_REDIS_PREFIX || 'eai:rate-limit';
  const key = `${prefix}:${options.namespace}:${hashIdentity(identity)}`;
  const rawResult = await redis.eval(
    RATE_LIMIT_SCRIPT,
    1,
    key,
    String(options.windowMs)
  );
  if (!Array.isArray(rawResult) || rawResult.length < 2) {
    throw new Error('Invalid Redis rate-limit response');
  }

  const count = Number(rawResult[0]);
  const ttl = Math.max(Number(rawResult[1]), 0);
  if (!Number.isFinite(count) || !Number.isFinite(ttl)) {
    throw new Error('Invalid Redis rate-limit counters');
  }

  return {
    count,
    remaining: Math.max(options.max - count, 0),
    retryAfterMs: ttl,
    allowed: count <= options.max,
  };
}

const getRequestIdentity = (req: Request) =>
  req.auth?.userId || req.ip || req.socket.remoteAddress || 'unknown';

async function withRateLimitTimeout<T>(operation: Promise<T>): Promise<T> {
  const configuredTimeout = Number(process.env.RATE_LIMIT_REDIS_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 2_500;
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Redis rate-limit operation timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function redisRateLimiter(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await withRateLimitTimeout(ensureRequestRedisConnection());
      const result = await withRateLimitTimeout(
        consumeRateLimit(
          requestRedisConnection,
          options,
          getRequestIdentity(req)
        )
      );

      res.setHeader('RateLimit-Limit', String(options.max));
      res.setHeader('RateLimit-Remaining', String(result.remaining));
      res.setHeader(
        'RateLimit-Reset',
        String(Math.ceil((Date.now() + result.retryAfterMs) / 1000))
      );

      if (!result.allowed) {
        res.setHeader('Retry-After', String(Math.max(Math.ceil(result.retryAfterMs / 1000), 1)));
        return res.status(429).json({ error: options.message });
      }

      next();
    } catch (error) {
      console.error(`[Rate Limit:${options.namespace}] Redis unavailable:`, error);
      if (process.env.NODE_ENV !== 'production' && process.env.RATE_LIMIT_FAIL_OPEN === 'true') {
        return next();
      }
      return res.status(503).json({
        error: 'Request protection is temporarily unavailable. Please try again later.',
      });
    }
  };
}
