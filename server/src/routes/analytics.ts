import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../index.js';
import { YouTubeService } from '../services/youtubeService.js';

const router = express.Router();

async function getDashboard(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;

    const totalClips = await prisma.clip.count({ where: { userId } });
    const totalScheduled = await prisma.schedule.count({ where: { userId } });
    const publishedClips = await prisma.schedule.count({
      where: { userId, status: 'published' },
    });

    const published = await prisma.schedule.findMany({
      where: { userId, status: 'published', youtubeVideoId: { not: null } },
      select: { youtubeVideoId: true, viewCount: true, likeCount: true },
    });

    let totalViews = published.reduce((s, p) => s + (p.viewCount || 0), 0);
    let totalLikes = published.reduce((s, p) => s + (p.likeCount || 0), 0);

    for (const p of published.slice(0, 10)) {
      if (!p.youtubeVideoId) continue;
      try {
        const stats = await YouTubeService.getVideoStats(p.youtubeVideoId);
        totalViews += Math.max(0, stats.views - (p.viewCount || 0));
        totalLikes += Math.max(0, stats.likes - (p.likeCount || 0));
      } catch {
        // ignore
      }
    }

    const avgEngagement =
      totalViews > 0 ? Number(((totalLikes / totalViews) * 100).toFixed(1)) : 0;

    res.json({
      totalClips,
      totalScheduled,
      scheduledClips: totalScheduled,
      publishedClips,
      totalViews,
      avgEngagement,
      estimatedEarnings: publishedClips * 4.2,
      performance: {
        avgViewsPerClip:
          publishedClips > 0 ? Math.round(totalViews / publishedClips) : 0,
        avgEngagementRate: avgEngagement,
      },
    });
  } catch (error: any) {
    logger.error('Analytics error:', error.message);
    throw error;
  }
}

router.get('/dashboard', authMiddleware, getDashboard);
router.get('/overview', authMiddleware, getDashboard);

router.get('/clips', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    const schedules = await prisma.schedule.findMany({
      where: { userId },
      include: { clip: true },
      orderBy: { createdAt: 'desc' },
    });

    const analytics = await Promise.all(
      schedules.map(async (s) => {
        let views = s.viewCount || 0;
        let likes = s.likeCount || 0;

        if (s.youtubeVideoId) {
          try {
            const stats = await YouTubeService.getVideoStats(s.youtubeVideoId);
            views = stats.views;
            likes = stats.likes;
            await prisma.schedule.update({
              where: { id: s.id },
              data: { viewCount: views, likeCount: likes },
            });
          } catch {
            // keep stored
          }
        }

        const engagement = views > 0 ? (likes / views) * 100 : 0;

        return {
          clipId: s.clipId,
          title: s.clip?.title || 'Untitled',
          views,
          likes,
          shares: 0,
          engagement: Number(engagement.toFixed(1)),
          status: s.status,
          platform: s.clip?.platform || 'youtube',
        };
      }),
    );

    res.json(analytics);
  } catch (error: any) {
    logger.error('Clip analytics error:', error.message);
    throw error;
  }
});

export default router;
