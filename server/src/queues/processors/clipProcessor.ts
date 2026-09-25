import { Job } from 'bullmq';
import path from 'path';
import { promises as fs } from 'fs';
import { prisma } from '../../index.js';
import { logger } from '../../utils/logger.js';
import { VideoDownloader } from '../../services/videoDownloader.js';
import { VideoProcessor } from '../../services/videoProcessor.js';
import { CaptionService } from '../../services/captionService.js';
import { LogoService } from '../../services/logoService.js';

async function setProgress(
  clipId: string,
  percent: number,
  label: string,
  status?: string,
) {
  await prisma.clip.update({
    where: { id: clipId },
    data: {
      progressPercent: Math.min(100, Math.max(0, Math.round(percent))),
      progressLabel: label,
      ...(status ? { status } : {}),
    },
  });
  logger.info(`Clip ${clipId}: ${percent}% — ${label}`);
}

export async function processClipJob(job: Job) {
  const {
    clipId,
    userId,
    videoId,
    startSeconds,
    duration,
    platform,
    sourcePath: jobSourcePath,
    burnCaptions = true,
    addLogo = false,
  } = job.data;
  logger.info(
    `Processing clip ${clipId} (captions: ${burnCaptions ? 'on' : 'off'}, logo: ${addLogo ? 'on' : 'off'})`,
  );

  await setProgress(clipId, 5, 'Queued', 'processing');

  const workDir = path.join('./videos', userId, clipId);
  const readyDir = path.join('./videos', 'ready');
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(readyDir, { recursive: true });

  try {
    let sourcePath: string;
    let srtPath: string | null = null;
    const isLocalFile =
      !!jobSourcePath ||
      (typeof videoId === 'string' && videoId.startsWith('file_'));

    if (jobSourcePath) {
      await setProgress(clipId, 15, 'Loading uploaded file');
      sourcePath = jobSourcePath;
      await fs.access(sourcePath);
    } else if (typeof videoId === 'string' && videoId.startsWith('file_')) {
      await setProgress(clipId, 15, 'Loading uploaded file');
      const extCandidates = ['.mp4', '.mov', '.webm', '.mkv'];
      const base = path.join('./videos/uploads', userId, videoId);
      let found: string | null = null;
      for (const ext of extCandidates) {
        try {
          await fs.access(base + ext);
          found = base + ext;
          break;
        } catch {
          /* next */
        }
      }
      if (!found) throw new Error(`Uploaded file not found for ${videoId}`);
      sourcePath = found;
    } else {
      await setProgress(clipId, 10, 'Downloading from YouTube');
      sourcePath = await VideoDownloader.download(videoId, workDir);
      await setProgress(clipId, 40, 'Download complete');
    }

    if (burnCaptions) {
      await setProgress(clipId, isLocalFile ? 25 : 45, 'Fetching captions');
      if (!isLocalFile) {
        srtPath = await CaptionService.downloadYoutubeSubs(videoId, workDir);
      } else {
        srtPath = await CaptionService.transcribeWithWhisper(sourcePath, workDir);
      }
    }

    await setProgress(clipId, 55, 'Cutting clip');
    const clipPath = await VideoProcessor.extractClip({
      videoId,
      inputPath: sourcePath,
      start: startSeconds,
      duration,
      platform,
    });

    await setProgress(clipId, 70, 'Making vertical (9:16)');
    let transcodedPath = await VideoProcessor.transcodeForPlatform(
      clipPath,
      platform,
    );

    if (burnCaptions && srtPath) {
      await setProgress(clipId, 82, 'Adding captions');
      const captioned = await CaptionService.burnCaptions({
        videoPath: transcodedPath,
        srtPath,
        startSeconds,
        duration,
        outputDir: './videos',
      });
      if (captioned) transcodedPath = captioned;
    }

    if (addLogo) {
      await setProgress(clipId, 90, 'Adding brand logo');
      const logoPath = await LogoService.findUserLogo(userId);
      if (logoPath) {
        const withLogo = await LogoService.applyLogo({
          videoPath: transcodedPath,
          logoPath,
          outputDir: './videos',
        });
        if (withLogo) transcodedPath = withLogo;
      } else {
        logger.warn('addLogo requested but no logo file found for user');
      }
    }

    await setProgress(clipId, 95, 'Thumbnail & export');
    const thumbPath = await VideoProcessor.generateThumbnail(transcodedPath, 1);

    const finalVideoName = `${clipId}.mp4`;
    const finalThumbName = `${clipId}.jpg`;
    const finalVideoPath = path.join(readyDir, finalVideoName);
    const finalThumbPath = path.join(readyDir, finalThumbName);

    await fs.copyFile(transcodedPath, finalVideoPath);
    await fs.copyFile(thumbPath, finalThumbPath);

    const clipRow = await prisma.clip.findUnique({ where: { id: clipId } });
    await CaptionService.exportToUserVideos(
      finalVideoPath,
      clipRow?.title || clipId,
    );

    const baseUrl = process.env.API_PUBLIC_URL || 'http://localhost:5000';
    const videoUrl = `${baseUrl}/videos/ready/${finalVideoName}`;
    const thumbnailUrl = `${baseUrl}/videos/ready/${finalThumbName}`;

    const clip = await prisma.clip.update({
      where: { id: clipId },
      data: {
        status: 'ready',
        videoUrl,
        thumbnailUrl,
        progressPercent: 100,
        progressLabel: 'Ready',
      },
    });

    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

    logger.info(`Clip ${clipId} ready: ${videoUrl}`);
    return { clipId, status: 'ready', videoUrl: clip.videoUrl };
  } catch (error: any) {
    logger.error(`Clip processing failed for ${clipId}: ${error.message}`);
    await prisma.clip.update({
      where: { id: clipId },
      data: {
        status: 'failed',
        progressPercent: 0,
        progressLabel: `Failed: ${error.message?.slice(0, 80) || 'error'}`,
      },
    });
    throw error;
  }
}
