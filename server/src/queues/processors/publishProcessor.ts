import { Job } from 'bullmq';
import path from 'path';
import { promises as fs } from 'fs';
import axios from 'axios';
import { prisma } from '../../index.js';
import { logger } from '../../utils/logger.js';
import { YouTubeService } from '../../services/youtubeService.js';

export async function processPublishJob(job: Job) {
  const { clipId, userId, title, description, tags, scheduleId } = job.data;
  logger.info(`Publishing clip ${clipId} to YouTube Shorts`);

  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  if (!clip || clip.userId !== userId) {
    throw new Error('Clip not found');
  }
  if (!clip.videoUrl) {
    throw new Error('Clip has no video URL — process it first');
  }

  const oAuthToken = await prisma.oAuthToken.findUnique({ where: { userId } });
  if (!oAuthToken?.accessToken) {
    throw new Error('No YouTube OAuth token');
  }

  let accessToken = oAuthToken.accessToken;
  if (
    oAuthToken.expiresAt &&
    oAuthToken.expiresAt < new Date() &&
    oAuthToken.refreshToken
  ) {
    accessToken = await YouTubeService.refreshAccessToken(
      oAuthToken.refreshToken,
      userId,
    );
  }

  const tmpDir = path.join('./videos', 'upload', clipId);
  await fs.mkdir(tmpDir, { recursive: true });
  const localPath = path.join(tmpDir, 'clip.mp4');

  const response = await axios.get(clip.videoUrl, {
    responseType: 'arraybuffer',
  });
  await fs.writeFile(localPath, Buffer.from(response.data));

  try {
    const result = await YouTubeService.publishShort(
      accessToken,
      localPath,
      title || clip.title,
      description || clip.description || '',
      tags || ['Shorts', 'ClipFlow'],
    );

    await prisma.clip.update({
      where: { id: clipId },
      data: { status: 'published' },
    });

    if (scheduleId) {
      await prisma.schedule.update({
        where: { id: scheduleId },
        data: {
          status: 'published',
          youtubeVideoId: result.videoId,
          publishedAt: new Date(),
        },
      });
    }

    logger.info(`Published clip ${clipId} as YouTube video ${result.videoId}`);
    return result;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
