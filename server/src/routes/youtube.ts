import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { YouTubeService } from '../services/youtubeService.js';
import { prisma } from '../index.js';
import { AppError } from '../middleware/errorHandler.js';
import { enqueuePublish } from '../queues/index.js';

const router = express.Router();

router.get('/channels', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    const oAuthToken = await prisma.oAuthToken.findUnique({
      where: { userId: userId! },
    });

    if (!oAuthToken?.accessToken) {
      throw new AppError('No YouTube connection — sign in with Google again', 401);
    }

    let accessToken = oAuthToken.accessToken;
    if (
      oAuthToken.expiresAt &&
      oAuthToken.expiresAt < new Date() &&
      oAuthToken.refreshToken
    ) {
      accessToken = await YouTubeService.refreshAccessToken(
        oAuthToken.refreshToken,
        userId!,
      );
    }

    const channels = await YouTubeService.getUserChannels(accessToken);
    res.json({ channels });
  } catch (error: any) {
    logger.error('Channels error:', error.message);
    throw error;
  }
});

router.post('/publish', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { clipId, title, description, tags } = req.body;
    const userId = req.user?.userId;

    if (!clipId) {
      throw new AppError('Clip ID is required', 400);
    }

    const clip = await prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip || clip.userId !== userId) {
      throw new AppError('Clip not found', 404);
    }

    if (clip.status !== 'ready' && clip.status !== 'published') {
      throw new AppError(
        `Clip must be processed first (current status: ${clip.status})`,
        400,
      );
    }

    const oAuthToken = await prisma.oAuthToken.findUnique({
      where: { userId: userId! },
    });
    if (!oAuthToken?.accessToken) {
      throw new AppError('No YouTube connection', 401);
    }

    await enqueuePublish({
      clipId,
      userId: userId!,
      title: title || clip.title,
      description: description || clip.description || undefined,
      tags: tags || ['Shorts', 'ClipFlow'],
    });

    res.json({
      message: 'Clip queued for publishing to YouTube Shorts',
      clipId,
      status: 'queued',
    });
  } catch (error: any) {
    logger.error('Publish error:', error.message);
    throw error;
  }
});

export default router;
