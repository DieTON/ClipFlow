import express, { Request, Response } from 'express';
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

    if (!clip || clip.userId !== userId) {
      throw new AppError('Clip not found', 404);
    }

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
        status: process ? 'draft' : 'draft',
      },
    });

    if (process) {
      await enqueueClipProcessing({
        clipId: clip.id,
        userId: userId!,
        videoId,
        startSeconds: clip.startSeconds,
        duration: clip.duration,
        platform: clip.platform,
      });

      await prisma.clip.update({
        where: { id: clip.id },
        data: { status: 'processing' },
      });
      clip.status = 'processing';
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
      const clip = await prisma.clip.findUnique({
        where: { id: req.params.id },
      });

      if (!clip || clip.userId !== userId) {
        throw new AppError('Clip not found', 404);
      }

      await enqueueClipProcessing({
        clipId: clip.id,
        userId: userId!,
        videoId: clip.videoId,
        startSeconds: clip.startSeconds,
        duration: clip.duration,
        platform: clip.platform,
      });

      await prisma.clip.update({
        where: { id: clip.id },
        data: { status: 'processing' },
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

    if (!clip || clip.userId !== userId) {
      throw new AppError('Clip not found', 404);
    }

    await prisma.clip.delete({ where: { id } });

    res.json({ message: 'Clip deleted' });
  } catch (error: any) {
    logger.error('Delete clip error:', error.message);
    throw error;
  }
});

export default router;
