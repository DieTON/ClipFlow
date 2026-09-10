import express, { Request, Response } from 'express';
import { YouTubeService } from '../services/youtubeService.js';
import { VideoProcessor } from '../services/videoProcessor.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../index.js';

const router = express.Router();

await VideoProcessor.initialize();

/**
 * GET /api/videos/analyses
 * List saved analyses for the current user (so Generator can reopen them).
 */
router.get('/analyses', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const list = await prisma.videoAnalysis.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        videoId: true,
        sourceUrl: true,
        title: true,
        thumbnail: true,
        duration: true,
        channelTitle: true,
        updatedAt: true,
        createdAt: true,
      },
    });
    res.json({ analyses: list });
  } catch (error: any) {
    logger.error('List analyses error:', error.message);
    throw error;
  }
});

/**
 * GET /api/videos/analyses/:videoId
 * Full analysis + suggestions for one YouTube video.
 */
router.get(
  '/analyses/:videoId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { videoId } = req.params;

      const analysis = await prisma.videoAnalysis.findUnique({
        where: {
          userId_videoId: { userId: userId!, videoId },
        },
      });

      if (!analysis) {
        throw new AppError('Analysis not found', 404);
      }

      const suggestions = JSON.parse(analysis.suggestions || '[]');

      // Which suggestions already have clips?
      const existingClips = await prisma.clip.findMany({
        where: { userId, videoId },
        select: { startSeconds: true, duration: true, status: true, id: true },
      });

      const suggestionsWithStatus = suggestions.map((s: any) => {
        const match = existingClips.find(
          (c) =>
            c.startSeconds === s.startSeconds && c.duration === s.duration,
        );
        return {
          ...s,
          alreadyCreated: !!match,
          clipStatus: match?.status,
          clipId: match?.id,
        };
      });

      res.json({
        analysis: {
          id: analysis.id,
          videoId: analysis.videoId,
          sourceUrl: analysis.sourceUrl,
          updatedAt: analysis.updatedAt,
        },
        videoInfo: {
          videoId: analysis.videoId,
          title: analysis.title,
          description: analysis.description,
          duration: analysis.duration,
          thumbnail: analysis.thumbnail,
          channelTitle: analysis.channelTitle,
        },
        suggestions: suggestionsWithStatus,
      });
    } catch (error: any) {
      logger.error('Get analysis error:', error.message);
      throw error;
    }
  },
);

/**
 * POST /api/videos/analyze
 * Analyze a YouTube URL, save results, return suggestions.
 */
router.post('/analyze', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { url, goal, platforms } = req.body;
    const userId = req.user?.userId;

    if (!url) {
      throw new AppError('URL is required', 400);
    }

    logger.info(`Analyzing video: ${url}`);

    const videoId = YouTubeService.extractVideoId(url);
    if (!videoId) {
      throw new AppError('Invalid YouTube URL', 400);
    }

    const metadata = await YouTubeService.getVideoMetadata(videoId);

    const clips = await VideoProcessor.generateClips({
      videoId,
      metadata,
      goal: goal || 'Viral highlights',
      platforms: platforms || ['youtube'],
    });

    const suggestions = clips.map((c) => ({
      startSeconds: c.startSeconds,
      duration: c.duration,
      score: c.score,
      reason: c.reason || c.label,
      label: c.label,
      platform: c.platform,
      hook: c.hook,
      hashtags: c.hashtags,
    }));

    const videoInfo = {
      videoId,
      title: metadata.title,
      description: metadata.description?.slice(0, 300),
      duration: metadata.duration,
      thumbnail: metadata.thumbnail,
      views: metadata.views,
      channelTitle: metadata.channelTitle,
    };

    // Persist so user can reopen later without pasting the link again
    await prisma.videoAnalysis.upsert({
      where: {
        userId_videoId: { userId: userId!, videoId },
      },
      create: {
        userId: userId!,
        videoId,
        sourceUrl: url,
        title: videoInfo.title || 'Untitled',
        description: videoInfo.description,
        duration: String(videoInfo.duration ?? ''),
        thumbnail: videoInfo.thumbnail,
        channelTitle: videoInfo.channelTitle,
        suggestions: JSON.stringify(suggestions),
      },
      update: {
        sourceUrl: url,
        title: videoInfo.title || 'Untitled',
        description: videoInfo.description,
        duration: String(videoInfo.duration ?? ''),
        thumbnail: videoInfo.thumbnail,
        channelTitle: videoInfo.channelTitle,
        suggestions: JSON.stringify(suggestions),
      },
    });

    const existingClips = await prisma.clip.findMany({
      where: { userId, videoId },
      select: { startSeconds: true, duration: true, status: true, id: true },
    });

    const suggestionsWithStatus = suggestions.map((s) => {
      const match = existingClips.find(
        (c) =>
          c.startSeconds === s.startSeconds && c.duration === s.duration,
      );
      return {
        ...s,
        alreadyCreated: !!match,
        clipStatus: match?.status,
        clipId: match?.id,
      };
    });

    res.json({
      videoId,
      videoInfo,
      suggestions: suggestionsWithStatus,
      metadata,
      clips,
      totalClips: clips.length,
      saved: true,
    });
  } catch (error: any) {
    logger.error('Analysis error:', error.message);
    throw error;
  }
});

export default router;
