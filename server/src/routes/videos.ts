import express, { Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import { YouTubeService } from '../services/youtubeService.js';
import { VideoProcessor } from '../services/videoProcessor.js';
import { LogoService } from '../services/logoService.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../index.js';

const router = express.Router();

await VideoProcessor.initialize();

const uploadDir = path.join(process.cwd(), 'videos', 'uploads');
await fs.mkdir(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const userId = (req as any).user?.userId || 'anonymous';
      const dir = path.join(uploadDir, userId);
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    } catch (e: any) {
      cb(e, uploadDir);
    }
  },
  filename: (_req, file, cb) => {
    const id = `file_${uuid().replace(/-/g, '').slice(0, 16)}`;
    const ext = path.extname(file.originalname || '').toLowerCase() || '.mp4';
    const safeExt = ['.mp4', '.mov', '.webm', '.mkv'].includes(ext) ? ext : '.mp4';
    cb(null, `${id}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype?.startsWith('video/') ||
      /\.(mp4|mov|webm|mkv)$/i.test(file.originalname || '');
    if (ok) cb(null, true);
    else cb(new Error('Only video files are allowed (mp4, mov, webm, mkv)'));
  },
});

const logoStorage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const userId = (req as any).user?.userId || 'anonymous';
      const dir = LogoService.logoDir(userId);
      await fs.mkdir(dir, { recursive: true });
      try {
        const existing = await fs.readdir(dir);
        for (const f of existing) {
          await fs.unlink(path.join(dir, f)).catch(() => {});
        }
      } catch {
        /* empty */
      }
      cb(null, dir);
    } catch (e: any) {
      cb(e, path.join(process.cwd(), 'videos', 'logos'));
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    const safe = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '.png';
    cb(null, `brand-logo${safe}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype?.startsWith('image/') ||
      /\.(png|jpg|jpeg|webp)$/i.test(file.originalname || '');
    if (ok) cb(null, true);
    else cb(new Error('Logo must be PNG, JPG, or WEBP'));
  },
});

function ffprobeDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const sec = data?.format?.duration;
      resolve(typeof sec === 'number' && sec > 0 ? sec : 600);
    });
  });
}

function secondsToIso(total: number): string {
  const s = Math.floor(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  let out = 'PT';
  if (h) out += `${h}H`;
  if (m) out += `${m}M`;
  out += `${sec}S`;
  return out;
}

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
          sourceType: String(analysis.videoId).startsWith('file_')
            ? 'upload'
            : 'youtube',
        },
        suggestions: suggestionsWithStatus,
      });
    } catch (error: any) {
      logger.error('Get analysis error:', error.message);
      throw error;
    }
  },
);

/** Load playlist videos so user can pick one */
router.post('/playlist', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) throw new AppError('Playlist URL is required', 400);

    const playlistId = YouTubeService.extractPlaylistId(url);
    if (!playlistId) {
      throw new AppError(
        'Not a playlist link. Paste a URL that contains list=... (YouTube playlist)',
        400,
      );
    }

    logger.info(`Loading playlist: ${playlistId}`);
    const videos = await YouTubeService.getPlaylistItems(playlistId);

    res.json({
      playlistId,
      count: videos.length,
      videos,
    });
  } catch (error: any) {
    logger.error('Playlist error:', error.message);
    if (error instanceof AppError) throw error;
    throw new AppError(error.message || 'Failed to load playlist', 400);
  }
});

router.post(
  '/logo',
  authMiddleware,
  (req, res, next) => {
    logoUpload.single('logo')(req, res, (err) => {
      if (err) return next(new AppError(err.message || 'Logo upload failed', 400));
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!req.file) throw new AppError('No logo file', 400);
      const userId = req.user?.userId!;
      const logoPath = await LogoService.findUserLogo(userId);
      res.json({
        ok: true,
        path: logoPath,
        message: 'Brand logo saved',
      });
    } catch (error: any) {
      logger.error('Logo upload error:', error.message);
      throw error;
    }
  },
);

router.get('/logo', authMiddleware, async (req: Request, res: Response) => {
  const logoPath = await LogoService.findUserLogo(req.user?.userId!);
  res.json({ hasLogo: !!logoPath });
});

router.post(
  '/analyze-upload',
  authMiddleware,
  (req, res, next) => {
    upload.single('video')(req, res, (err) => {
      if (err) {
        logger.error('Upload error:', err.message);
        return next(new AppError(err.message || 'Upload failed', 400));
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!req.file) throw new AppError('No video file uploaded', 400);

      const filePath = req.file.path;
      const baseName = path.basename(req.file.filename, path.extname(req.file.filename));
      const videoId = baseName.startsWith('file_') ? baseName : `file_${baseName}`;
      const title =
        (req.body?.title as string) ||
        path.basename(req.file.originalname || 'Uploaded video', path.extname(req.file.originalname || ''));

      logger.info(`Analyzing uploaded file: ${filePath}`);

      const durationSec = await ffprobeDurationSeconds(filePath);
      const isoDuration = secondsToIso(durationSec);

      const metadata = {
        title,
        description: 'Uploaded file (not YouTube)',
        duration: isoDuration,
        channelTitle: 'Local upload',
      };

      const clips = await VideoProcessor.generateClips({
        videoId,
        metadata,
        goal: (req.body?.goal as string) || 'Viral highlights',
        platforms: ['youtube'],
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
        title,
        description: metadata.description,
        duration: isoDuration,
        durationSeconds: Math.floor(durationSec),
        thumbnail: undefined as string | undefined,
        channelTitle: 'Local upload',
        sourceType: 'upload' as const,
        sourcePath: filePath,
      };

      await prisma.videoAnalysis.upsert({
        where: { userId_videoId: { userId: userId!, videoId } },
        create: {
          userId: userId!,
          videoId,
          sourceUrl: filePath,
          title,
          description: metadata.description,
          duration: isoDuration,
          thumbnail: null,
          channelTitle: 'Local upload',
          suggestions: JSON.stringify(suggestions),
        },
        update: {
          sourceUrl: filePath,
          title,
          description: metadata.description,
          duration: isoDuration,
          channelTitle: 'Local upload',
          suggestions: JSON.stringify(suggestions),
        },
      });

      res.json({
        videoId,
        videoInfo,
        suggestions,
        totalClips: clips.length,
        saved: true,
        sourceType: 'upload',
      });
    } catch (error: any) {
      logger.error('Upload analysis error:', error.message);
      throw error;
    }
  },
);

router.post('/analyze', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { url, goal, platforms, videoId: bodyVideoId } = req.body;
    const userId = req.user?.userId;

    // Allow analyze by videoId alone (from playlist pick)
    let videoId = bodyVideoId as string | undefined;
    if (!videoId && url) {
      videoId = YouTubeService.extractVideoId(url) || undefined;
    }
    if (!videoId) {
      throw new AppError(
        'Invalid YouTube URL. Use a single video, or load a playlist and pick a video.',
        400,
      );
    }

    logger.info(`Analyzing video: ${videoId}`);

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
      sourceType: 'youtube' as const,
    };

    const sourceUrl = url || `https://www.youtube.com/watch?v=${videoId}`;

    await prisma.videoAnalysis.upsert({
      where: { userId_videoId: { userId: userId!, videoId } },
      create: {
        userId: userId!,
        videoId,
        sourceUrl,
        title: videoInfo.title || 'Untitled',
        description: videoInfo.description,
        duration: String(videoInfo.duration ?? ''),
        thumbnail: videoInfo.thumbnail,
        channelTitle: videoInfo.channelTitle,
        suggestions: JSON.stringify(suggestions),
      },
      update: {
        sourceUrl,
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
      sourceType: 'youtube',
    });
  } catch (error: any) {
    logger.error('Analysis error:', error.message);
    throw error;
  }
});

export default router;
