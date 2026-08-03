import express, { Request, Response } from 'express';
import { YouTubeService } from '../services/youtubeService.js';
import { VideoProcessor } from '../services/videoProcessor.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

await VideoProcessor.initialize();

/**
 * POST /api/videos/analyze
 * Analyze a YouTube URL and return clip suggestions.
 * Response shape matches the frontend GeneratorPage expectations.
 */
router.post('/analyze', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { url, goal, platforms } = req.body;

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

    // Frontend-friendly shape + full backend shape
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

    res.json({
      videoId,
      // Frontend GeneratorPage expects videoInfo
      videoInfo: {
        videoId,
        title: metadata.title,
        description: metadata.description?.slice(0, 300),
        duration: metadata.duration,
        thumbnail: metadata.thumbnail,
        views: metadata.views,
        channelTitle: metadata.channelTitle,
      },
      // Frontend expects suggestions
      suggestions,
      // Also keep backend-oriented fields
      metadata,
      clips,
      totalClips: clips.length,
    });
  } catch (error: any) {
    logger.error('Analysis error:', error.message);
    throw error;
  }
});

export default router;
