import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { AI_QUEUE_NAME, BILLING_QUEUE_NAME, redisConnection, billingQueue } from './lib/queue';
import { runMonthlyCreditAllocation } from './jobs/monthly-credit-allocation';
import { runActivateQueuedDowngrade } from './jobs/activate-queued-downgrade';

console.log('[Worker] Starting AI worker process...');

const aiWorker = new Worker(
  AI_QUEUE_NAME,
  async (job: Job) => {
    console.log(`[Worker] Processing job ${job.id} of type ${job.name}`);
    
    // Simulate AI processing for now
    if (job.name === 'analyze') {
      console.log(`[Worker] Extracting data for analyze...`);
      // TODO: Move logic from routes/analyze.ts here
      await new Promise(resolve => setTimeout(resolve, 5000)); 
      
      return {
        success: true,
        message: 'Mock processing completed',
        originalJobData: job.data
      };
    }

    throw new Error(`Unknown job type: ${job.name}`);
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connection: redisConnection as any,
    concurrency: 1, // Limit concurrency to 1 due to 512MB RAM constraints
  }
);

aiWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} has completed successfully.`);
});

aiWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} has failed with error: ${err.message}`);
});

console.log('[Worker] Starting Billing worker process...');

const billingWorker = new Worker(
  BILLING_QUEUE_NAME,
  async (job: Job) => {
    console.log(`[Worker] Processing billing job ${job.id} of type ${job.name}`);
    if (job.name === 'monthly-credit-allocation') {
      await runMonthlyCreditAllocation();
      return { success: true };
    }
    if (job.name === 'activate-queued-downgrade') {
      await runActivateQueuedDowngrade();
      return { success: true };
    }
    throw new Error(`Unknown billing job type: ${job.name}`);
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connection: redisConnection as any,
    concurrency: 1,
  }
);

billingWorker.on('completed', (job) => {
  console.log(`[Worker] Billing Job ${job.id} has completed successfully.`);
});

billingWorker.on('failed', (job, err) => {
  console.error(`[Worker] Billing Job ${job?.id} has failed with error: ${err.message}`);
});

// Add repeatable scheduler jobs on worker startup
async function setupBillingSchedulers() {
  try {
    // Clean up existing repeatable jobs to avoid stale/multiple triggers
    const repeatableJobs = await billingQueue.getRepeatableJobs();
    for (const rj of repeatableJobs) {
      await billingQueue.removeRepeatableByKey(rj.key);
    }

    // Schedule monthly credit allocation refill job (every day at 01:00 AM)
    await billingQueue.add(
      'monthly-credit-allocation',
      {},
      {
        repeat: {
          pattern: '0 1 * * *',
        },
      }
    );

    // Schedule activate queued downgrade job (every day at 02:00 AM)
    await billingQueue.add(
      'activate-queued-downgrade',
      {},
      {
        repeat: {
          pattern: '0 2 * * *',
        },
      }
    );

    console.log('[Worker] Billing scheduler jobs registered successfully.');
  } catch (error) {
    console.error('[Worker] Failed to setup billing schedulers:', error);
  }
}

void setupBillingSchedulers();

process.on('SIGINT', async () => {
  console.log('[Worker] Shutting down gracefully...');
  await Promise.all([
    aiWorker.close(),
    billingWorker.close(),
  ]);
  process.exit(0);
});

console.log(`[Worker] Listening for jobs on queues: ${AI_QUEUE_NAME}, ${BILLING_QUEUE_NAME}`);
