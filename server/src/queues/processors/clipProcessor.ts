import { Job } from 'bullmq';
import path from 'path';
import { promises as fs } from 'fs';
import { prisma } from '../../index.js';
import { logger } from '../../utils/logger.js';
import { VideoDownloader } from '../../services/videoDownloader.js';
import { VideoProcessor } from '../../services/videoProcessor.js';

/**
 * Process a clip: download source, cut, transcode, thumbnail.
 * Saves files locally under ./videos/ready (no AWS S3 required for local dev).
 */
export async function processClipJob(job: Job) {
  const { clipId, userId, videoId, startSeconds, duration, platform } = job.data;
  logger.info(`Processing clip ${clipId} for video ${videoId}`);

  await prisma.clip.update({
    where: { id: clipId },
    data: { status: 'processing' },
  });

  const workDir = path.join('./videos', userId, clipId);
  const readyDir = path.join('./videos', 'ready');
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(readyDir, { recursive: true });

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

    // Keep final files locally (no S3 needed for development)
    const finalVideoName = `${clipId}.mp4`;
    const finalThumbName = `${clipId}.jpg`;
    const finalVideoPath = path.join(readyDir, finalVideoName);
    const finalThumbPath = path.join(readyDir, finalThumbName);

    await fs.copyFile(transcodedPath, finalVideoPath);
    await fs.copyFile(thumbPath, finalThumbPath);

    const baseUrl = process.env.API_PUBLIC_URL || 'http://localhost:5000';
    const videoUrl = `${baseUrl}/videos/ready/${finalVideoName}`;
    const thumbnailUrl = `${baseUrl}/videos/ready/${finalThumbName}`;

    const clip = await prisma.clip.update({
      where: { id: clipId },
      data: {
        status: 'ready',
        videoUrl,
        thumbnailUrl,
      },
    });

    // Clean work folder (keep ready/ files)
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

    logger.info(`Clip ${clipId} ready: ${videoUrl}`);
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
