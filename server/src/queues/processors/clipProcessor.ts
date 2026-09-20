import { Job } from 'bullmq';
import path from 'path';
import { promises as fs } from 'fs';
import { prisma } from '../../index.js';
import { logger } from '../../utils/logger.js';
import { VideoDownloader } from '../../services/videoDownloader.js';
import { VideoProcessor } from '../../services/videoProcessor.js';

/**
 * Process a clip: get source (YouTube download OR local upload), cut, transcode, thumbnail.
 * Saves files under ./videos/ready (no AWS S3 required for local dev).
 */
export async function processClipJob(job: Job) {
  const {
    clipId,
    userId,
    videoId,
    startSeconds,
    duration,
    platform,
    sourcePath: jobSourcePath,
  } = job.data;
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
    let sourcePath: string;

    // Local uploaded file (Content Rewards / non-YouTube)
    if (jobSourcePath) {
      sourcePath = jobSourcePath;
      await fs.access(sourcePath);
      logger.info(`Using uploaded source file: ${sourcePath}`);
    } else if (typeof videoId === 'string' && videoId.startsWith('file_')) {
      const extCandidates = ['.mp4', '.mov', '.webm', '.mkv'];
      const base = path.join('./videos/uploads', userId, videoId);
      let found: string | null = null;
      for (const ext of extCandidates) {
        try {
          await fs.access(base + ext);
          found = base + ext;
          break;
        } catch {
          /* try next */
        }
      }
      if (!found) {
        throw new Error(`Uploaded file not found for ${videoId}`);
      }
      sourcePath = found;
      logger.info(`Using uploaded source file: ${sourcePath}`);
    } else {
      // YouTube download
      sourcePath = await VideoDownloader.download(videoId, workDir);
    }

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
