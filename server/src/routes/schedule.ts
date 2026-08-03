import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../index.js';
import { AppError } from '../middleware/errorHandler.js';
import { enqueueScheduledPost } from '../queues/index.js';

const router = express.Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    const schedule = await prisma.schedule.findMany({
      where: { userId },
      include: { clip: true },
      orderBy: { scheduledAt: 'asc' },
    });

    const items = schedule.map((s) => ({
      id: s.id,
      clipId: s.clipId,
      platform: s.clip?.platform || 'youtube',
      scheduledTime: s.scheduledAt.toISOString(),
      status: s.status,
      title: s.clip?.title,
      youtubeVideoId: s.youtubeVideoId,
      publishedAt: s.publishedAt,
    }));

    res.json(items);
  } catch (error: any) {
    logger.error('Fetch schedule error:', error.message);
    throw error;
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId!;
    const { clipId, platform, scheduledTime, clips, startDate } = req.body;

    if (clipId && scheduledTime) {
      const clip = await prisma.clip.findUnique({ where: { id: clipId } });
      if (!clip || clip.userId !== userId) {
        throw new AppError('Clip not found', 404);
      }

      if (platform && platform !== clip.platform) {
        await prisma.clip.update({
          where: { id: clipId },
          data: { platform },
        });
      }

      const when = new Date(scheduledTime);
      if (Number.isNaN(when.getTime())) {
        throw new AppError('Invalid scheduledTime', 400);
      }

      const item = await prisma.schedule.create({
        data: {
          userId,
          clipId,
          scheduledAt: when,
          status: 'pending',
        },
      });

      const delayMs = when.getTime() - Date.now();
      await enqueueScheduledPost({ scheduleId: item.id }, delayMs);

      return res.status(201).json({
        message: 'Clip scheduled',
        id: item.id,
        clipId,
        scheduledTime: when.toISOString(),
        platform: platform || clip.platform,
      });
    }

    if (clips && Array.isArray(clips)) {
      const base = startDate ? new Date(startDate) : new Date();
      const scheduleItems = await Promise.all(
        clips.map(async (clip: any, index: number) => {
          const scheduledDate = new Date(base);
          scheduledDate.setDate(scheduledDate.getDate() + index);

          const item = await prisma.schedule.create({
            data: {
              userId,
              clipId: clip.id || clip.clipId,
              scheduledAt: scheduledDate,
              status: 'pending',
            },
          });

          const delayMs = scheduledDate.getTime() - Date.now();
          await enqueueScheduledPost({ scheduleId: item.id }, delayMs);
          return item;
        }),
      );

      return res.status(201).json({
        message: 'Schedule created',
        items: scheduleItems.length,
      });
    }

    throw new AppError(
      'Provide either { clipId, scheduledTime } or { clips, startDate }',
      400,
    );
  } catch (error: any) {
    logger.error('Create schedule error:', error.message);
    throw error;
  }
});

export default router;
