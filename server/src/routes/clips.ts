import express, { Request, Response } from 'express';
import path from 'path';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../index.js';
import { AppError } from '../middleware/errorHandler.js';
import { enqueueClipProcessing } from '../queues/index.js';

const router = express.Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const clips = await prisma.clip.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ clips });
  } catch (error: any) {
    logger.error('Fetch clips error:', error.message);
    throw error;
  }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const clip = await prisma.clip.findUnique({ where: { id: req.params.id } });
    if (!clip || clip.userId !== userId) throw new AppError('Clip not found', 404);
    res.json({ clip });
  } catch (error: any) {
    logger.error('Fetch clip error:', error.message);
    throw error;
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      videoId,
      title,
      description,
      startSeconds,
      duration,
      platform,
      process = true,
      sourcePath,
      burnCaptions = true,
      addLogo = false,
    } = req.body;
    const userId = req.user?.userId;

    if (!videoId || !title) {
      throw new AppError('Video ID and title are required', 400);
    }

    const clip = await prisma.clip.create({
      data: {
        userId: userId!,
        videoId,
        title,
        description,
        startSeconds: startSeconds ?? 0,
        duration: duration ?? 30,
        platform: platform || 'youtube',
        status: process ? 'processing' : 'draft',
        progressPercent: process ? 2 : 0,
        progressLabel: process ? 'Queued' : null,
      },
    });

    if (process) {
      let resolvedSource = sourcePath as string | undefined;
      if (!resolvedSource && String(videoId).startsWith('file_')) {
        const base = path.join('./videos/uploads', userId!, String(videoId));
        for (const ext of ['.mp4', '.mov', '.webm', '.mkv']) {
          try {
            const { promises: fs } = await import('fs');
            await fs.access(base + ext);
            resolvedSource = base + ext;
            break;
          } catch {
            /* next */
          }
        }
      }

      await enqueueClipProcessing({
        clipId: clip.id,
        userId: userId!,
        videoId,
        startSeconds: clip.startSeconds,
        duration: clip.duration,
        platform: clip.platform,
        sourcePath: resolvedSource,
        burnCaptions: burnCaptions !== false && burnCaptions !== 'false',
        addLogo: addLogo === true || addLogo === 'true',
      });
    }

    res.status(201).json(clip);
  } catch (error: any) {
    logger.error('Create clip error:', error.message);
    throw error;
  }
});

router.post(
  '/:id/process',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      const burnCaptions = req.body?.burnCaptions !== false;
      const addLogo = req.body?.addLogo === true;
      const clip = await prisma.clip.findUnique({
        where: { id: req.params.id },
      });

      if (!clip || clip.userId !== userId) {
        throw new AppError('Clip not found', 404);
      }

      let sourcePath: string | undefined;
      if (String(clip.videoId).startsWith('file_')) {
        const base = path.join('./videos/uploads', userId!, clip.videoId);
        const { promises: fs } = await import('fs');
        for (const ext of ['.mp4', '.mov', '.webm', '.mkv']) {
          try {
            await fs.access(base + ext);
            sourcePath = base + ext;
            break;
          } catch {
            /* next */
          }
        }
      }

      await prisma.clip.update({
        where: { id: clip.id },
        data: {
          status: 'processing',
          progressPercent: 2,
          progressLabel: 'Queued',
        },
      });

      await enqueueClipProcessing({
        clipId: clip.id,
        userId: userId!,
        videoId: clip.videoId,
        startSeconds: clip.startSeconds,
        duration: clip.duration,
        platform: clip.platform,
        sourcePath,
        burnCaptions,
        addLogo,
      });

      res.json({ message: 'Processing enqueued', clipId: clip.id });
    } catch (error: any) {
      logger.error('Process clip error:', error.message);
      throw error;
    }
  },
);

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const clip = await prisma.clip.findUnique({ where: { id } });
    if (!clip || clip.userId !== userId) throw new AppError('Clip not found', 404);
    await prisma.clip.delete({ where: { id } });
    res.json({ message: 'Clip deleted' });
  } catch (error: any) {
    logger.error('Delete clip error:', error.message);
    throw error;
  }
});

export default router;
