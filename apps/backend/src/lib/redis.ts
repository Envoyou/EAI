import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// BullMQ requires unlimited command retries for its long-lived blocking clients.
export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// HTTP request paths must fail quickly instead of waiting indefinitely for Redis.
export const requestRedisConnection = new Redis(redisUrl, {
  connectTimeout: 2_000,
  enableOfflineQueue: false,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

redisConnection.on('error', (error) => {
  console.error('[Redis] Connection error:', error);
});

requestRedisConnection.on('error', (error) => {
  console.error('[Redis Request] Connection error:', error);
});

let requestRedisConnectPromise: Promise<void> | null = null;

export async function ensureRequestRedisConnection(): Promise<void> {
  if (requestRedisConnection.status === 'ready') return;

  if (!requestRedisConnectPromise) {
    requestRedisConnectPromise =
      requestRedisConnection.status === 'wait' || requestRedisConnection.status === 'end'
        ? requestRedisConnection.connect()
        : new Promise<void>((resolve, reject) => {
            requestRedisConnection.once('ready', resolve);
            requestRedisConnection.once('end', () => reject(new Error('Redis connection ended')));
          });
  }

  try {
    await requestRedisConnectPromise;
  } finally {
    requestRedisConnectPromise = null;
  }

  const statusAfterConnect: string = requestRedisConnection.status;
  if (statusAfterConnect !== 'ready') {
    throw new Error(`Redis request connection is ${statusAfterConnect}`);
  }
}
