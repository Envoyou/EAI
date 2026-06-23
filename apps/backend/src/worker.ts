import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { AI_QUEUE_NAME, redisConnection } from './lib/queue';

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

process.on('SIGINT', async () => {
  console.log('[Worker] Shutting down gracefully...');
  await aiWorker.close();
  process.exit(0);
});

console.log(`[Worker] Listening for jobs on queue: ${AI_QUEUE_NAME}`);
