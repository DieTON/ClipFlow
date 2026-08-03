import { Job } from 'bullmq';
import path from 'path';
import { promises as fs } from 'fs';
import { prisma } from '../../index.js';
import { logger } from '../../utils/logger.js';
import { VideoDownloader } from '../../services/videoDownloader.js';
import { VideoProcessor } from '../../services/videoProcessor.js';
import { S3Service } from '../../services/s3Service.js';

export async function processClipJob(job: Job) {
  const { clipId, userId, videoId, startSeconds, duration, platform } = job.data;
  logger.info(`Processing clip ${clipId} for video ${videoId}`);

  await prisma.clip.update({
    where: { id: clipId },
    data: { status: 'processing' },
  });

  const workDir = path.join('./videos', userId, clipId);
  await fs.mkdir(workDir, { recursive: true });

  try {
    const sourcePath = await VideoDownloader.download(videoId, workDir);

    const clipPath = await VideoProcessor.extractClip({
      videoId,
      inputPath: sourcePath,
      start: startSeconds,
      duration,
      platform,
    });

    const transcodedPath = await VideoProcessor.transcodeForPlatform(
      clipPath,
      platform,
    );

    const thumbPath = await VideoProcessor.generateThumbnail(transcodedPath, 1);

    const videoUpload = await S3Service.uploadVideoFile(
      transcodedPath,
      userId,
      `${clipId}.mp4`,
    );
    const thumbUpload = await S3Service.uploadThumbnail(
      thumbPath,
      userId,
      `${clipId}.jpg`,
    );

    const clip = await prisma.clip.update({
      where: { id: clipId },
      data: {
        status: 'ready',
        videoUrl: videoUpload.url,
        thumbnailUrl: thumbUpload.url,
      },
    });

    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

    logger.info(`Clip ${clipId} ready: ${videoUpload.url}`);
    return { clipId, status: 'ready', videoUrl: clip.videoUrl };
  } catch (error: any) {
    logger.error(`Clip processing failed for ${clipId}: ${error.message}`);
    await prisma.clip.update({
      where: { id: clipId },
      data: { status: 'failed' },
    });
    throw error;
  }
}
