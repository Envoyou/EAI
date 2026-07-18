import { Queue, QueueEvents } from 'bullmq';
import { redisConnection } from './redis';

export { redisConnection } from './redis';

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

export const BILLING_QUEUE_NAME = 'billing-queue';

export const billingQueue = new Queue(BILLING_QUEUE_NAME, {
  connection: redisConnection as never,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: 100,
  },
});
