import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// BullMQ requires maxRetriesPerRequest to be null
export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

redisConnection.on('error', (error) => {
  console.error('[Redis] Connection error:', error);
});

export const AI_QUEUE_NAME = 'ai-processing-queue';

export const aiQueue = new Queue(AI_QUEUE_NAME, {
  connection: redisConnection as never,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

export const aiQueueEvents = new QueueEvents(AI_QUEUE_NAME, {
  connection: redisConnection as never,
});
