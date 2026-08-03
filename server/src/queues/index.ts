import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../utils/logger.js';
import { processClipJob } from './processors/clipProcessor.js';
import { processPublishJob } from './processors/publishProcessor.js';
import { processScheduleJob } from './processors/scheduleProcessor.js';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

export const clipQueue = new Queue('clip-processing', { connection });
export const publishQueue = new Queue('clip-publishing', { connection });
export const scheduleQueue = new Queue('scheduled-posts', { connection });

let workersStarted = false;

export function startWorkers() {
  if (workersStarted) return;
  if (process.env.DISABLE_WORKERS === 'true') {
    logger.warn('Workers disabled via DISABLE_WORKERS=true');
    return;
  }
  workersStarted = true;

  const clipWorker = new Worker(
    'clip-processing',
    async (job: Job) => processClipJob(job),
    { connection, concurrency: 2 },
  );

  const publishWorker = new Worker(
    'clip-publishing',
    async (job: Job) => processPublishJob(job),
    { connection, concurrency: 1 },
  );

  const scheduleWorker = new Worker(
    'scheduled-posts',
    async (job: Job) => processScheduleJob(job),
    { connection, concurrency: 1 },
  );

  for (const worker of [clipWorker, publishWorker, scheduleWorker]) {
    worker.on('completed', (job) => {
      logger.info(`Job ${job.id} completed on queue ${worker.name}`);
    });
    worker.on('failed', (job, err) => {
      logger.error(`Job ${job?.id} failed on queue ${worker.name}: ${err.message}`);
    });
  }

  logger.info('BullMQ workers started');
}

export async function enqueueClipProcessing(data: {
  clipId: string;
  userId: string;
  videoId: string;
  startSeconds: number;
  duration: number;
  platform: string;
}) {
  return clipQueue.add('process-clip', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}

export async function enqueuePublish(data: {
  clipId: string;
  userId: string;
  title: string;
  description?: string;
  tags?: string[];
  scheduleId?: string;
}) {
  return publishQueue.add('publish-clip', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}

export async function enqueueScheduledPost(
  data: { scheduleId: string },
  delayMs: number,
) {
  return scheduleQueue.add('run-scheduled', data, {
    delay: Math.max(0, delayMs),
    attempts: 3,
    backoff: { type: 'exponential', delay: 15000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}
