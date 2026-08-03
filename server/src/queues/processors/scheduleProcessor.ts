import { Job } from 'bullmq';
import { prisma } from '../../index.js';
import { logger } from '../../utils/logger.js';
import { enqueuePublish } from '../index.js';

export async function processScheduleJob(job: Job) {
  const { scheduleId } = job.data;
  logger.info(`Running scheduled post ${scheduleId}`);

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { clip: true },
  });

  if (!schedule) {
    throw new Error('Schedule not found');
  }
  if (schedule.status === 'published') {
    return { skipped: true };
  }

  await prisma.schedule.update({
    where: { id: scheduleId },
    data: { status: 'scheduled' },
  });

  if (
    schedule.clip.status !== 'ready' &&
    schedule.clip.status !== 'published'
  ) {
    throw new Error(
      `Clip ${schedule.clipId} is not ready (status: ${schedule.clip.status})`,
    );
  }

  await enqueuePublish({
    clipId: schedule.clipId,
    userId: schedule.userId,
    title: schedule.clip.title,
    description: schedule.clip.description || undefined,
    scheduleId: schedule.id,
  });

  return { enqueued: true, scheduleId };
}
