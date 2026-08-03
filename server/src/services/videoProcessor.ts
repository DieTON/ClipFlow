import ffmpeg from 'fluent-ffmpeg';
import { logger } from '../utils/logger.js';
import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuid } from 'uuid';

function parseDurationSeconds(isoDuration: string | undefined): number {
  if (!isoDuration) return 600;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 600;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  return h * 3600 + m * 60 + s;
}

export class VideoProcessor {
  private static OUTPUT_DIR = './videos';

  static async initialize() {
    try {
      await fs.mkdir(this.OUTPUT_DIR, { recursive: true });
    } catch {
      // Directory might exist
    }
  }

  static async generateClips(options: {
    videoId: string;
    metadata: any;
    goal: string;
    platforms: string[];
  }) {
    logger.info('Generating clips for video:', options.videoId);

    const totalSeconds = parseDurationSeconds(options.metadata?.duration);
    const platforms =
      options.platforms?.length > 0 ? options.platforms : ['youtube'];

    type Template = { name: string; startRatio: number; duration: number; reason: string };

    const GOAL_TEMPLATES: Record<string, Template[]> = {
      'Viral highlights': [
        { name: 'Opening hook', startRatio: 0.02, duration: 30, reason: 'Strong opening moment to stop the scroll' },
        { name: 'Peak energy', startRatio: 0.35, duration: 40, reason: 'High-energy midpoint highlight' },
        { name: 'Surprising twist', startRatio: 0.55, duration: 35, reason: 'Unexpected turn that drives shares' },
        { name: 'Climax moment', startRatio: 0.75, duration: 30, reason: 'Payoff moment near the end' },
      ],
      'Motivational moments': [
        { name: 'Turning point', startRatio: 0.15, duration: 45, reason: 'Emotional low-to-high shift' },
        { name: 'Breakthrough', startRatio: 0.45, duration: 50, reason: 'Key insight or breakthrough' },
        { name: 'Wisdom drop', startRatio: 0.7, duration: 40, reason: 'Memorable takeaway quote' },
      ],
      'Funny/reactions': [
        { name: 'Unexpected moment', startRatio: 0.1, duration: 25, reason: 'Comedy beat early on' },
        { name: 'Reaction peak', startRatio: 0.4, duration: 30, reason: 'Strong reaction shot' },
        { name: 'Absurd scenario', startRatio: 0.65, duration: 35, reason: 'Most shareable funny segment' },
      ],
      'Educational snippets': [
        { name: 'Key insight', startRatio: 0.08, duration: 45, reason: 'Core concept explained clearly' },
        { name: 'Step-by-step', startRatio: 0.4, duration: 55, reason: 'Actionable how-to segment' },
        { name: 'Pro tip', startRatio: 0.72, duration: 35, reason: 'Advanced tip worth saving' },
      ],
      'Story-driven': [
        { name: 'Scene setter', startRatio: 0.0, duration: 35, reason: 'Context that pulls viewers in' },
        { name: 'Rising tension', startRatio: 0.4, duration: 45, reason: 'Builds curiosity' },
        { name: 'Emotional climax', startRatio: 0.75, duration: 40, reason: 'Emotional payoff' },
      ],
      'Product showcase': [
        { name: 'Problem setup', startRatio: 0.05, duration: 30, reason: 'Pain point viewers relate to' },
        { name: 'Product reveal', startRatio: 0.35, duration: 40, reason: 'Clear product demonstration' },
        { name: 'Before/after', startRatio: 0.65, duration: 45, reason: 'Transformation proof' },
      ],
    };

    const templates =
      GOAL_TEMPLATES[options.goal] || GOAL_TEMPLATES['Viral highlights'];

    const minClip = 15;
    const maxClip = 60;

    return templates
      .map((template, i) => {
        let duration = Math.min(maxClip, Math.max(minClip, template.duration));
        let startSeconds = Math.floor(template.startRatio * totalSeconds);

        if (startSeconds + duration > totalSeconds) {
          startSeconds = Math.max(0, totalSeconds - duration);
        }
        if (totalSeconds < minClip) {
          startSeconds = 0;
          duration = Math.max(5, totalSeconds);
        }

        const baseScore =
          template.startRatio < 0.15
            ? 0.88
            : template.startRatio > 0.7
              ? 0.82
              : 0.78;
        const score = Math.min(0.98, baseScore + (i % 3) * 0.03);

        return {
          id: uuid(),
          label: template.name,
          reason: template.reason,
          start: `${Math.floor(startSeconds / 60)}:${String(startSeconds % 60).padStart(2, '0')}`,
          end: `${Math.floor((startSeconds + duration) / 60)}:${String((startSeconds + duration) % 60).padStart(2, '0')}`,
          startSeconds,
          duration,
          platform: platforms[i % platforms.length],
          score,
          hook: `${template.name} — you won't believe what happens next`,
          hashtags: `#${options.goal.replace(/\s/g, '')} #Shorts #Viral #Trending`,
          selected: true,
        };
      })
      .filter((c) => c.duration >= 5 && c.startSeconds >= 0);
  }

  static async extractClip(options: {
    videoId: string;
    inputPath: string;
    start: number;
    duration: number;
    platform: string;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      const { inputPath, start, duration, platform } = options;
      const clipId = uuid();
      const outputPath = path.join(this.OUTPUT_DIR, `${clipId}-${platform}.mp4`);

      logger.info(`Extracting ${duration}s clip from ${inputPath} @ ${start}s`);

      ffmpeg(inputPath)
        .setStartTime(start)
        .duration(duration)
        .outputOptions([
          '-c:v libx264',
          '-preset fast',
          '-crf 23',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart',
        ])
        .output(outputPath)
        .on('start', (cmd) => logger.info('FFmpeg started:', cmd))
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.debug(`Processing: ${Math.round(progress.percent)}% done`);
          }
        })
        .on('end', () => {
          logger.info(`Clip extracted: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error('FFmpeg error:', err.message);
          reject(err);
        })
        .run();
    });
  }

  static async transcodeForPlatform(
    inputPath: string,
    platform: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const clipId = uuid();
      const outputPath = path.join(this.OUTPUT_DIR, `${clipId}-transcoded.mp4`);

      logger.info(`Transcoding for ${platform}`);

      ffmpeg(inputPath)
        .videoFilters([
          'scale=1080:1920:force_original_aspect_ratio=decrease',
          'pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
        ])
        .outputOptions([
          '-c:v libx264',
          '-preset fast',
          '-crf 23',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart',
          '-r 30',
        ])
        .output(outputPath)
        .on('end', () => {
          logger.info(`Transcoded: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error('Transcode error:', err.message);
          reject(err);
        })
        .run();
    });
  }

  static async generateThumbnail(
    inputPath: string,
    timestamp: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const thumbnailId = uuid();
      const filename = `${thumbnailId}-thumb.jpg`;
      const outputPath = path.join(this.OUTPUT_DIR, filename);

      ffmpeg(inputPath)
        .screenshots({
          timestamps: [timestamp],
          filename,
          folder: this.OUTPUT_DIR,
          size: '1080x1920',
        })
        .on('end', () => {
          logger.info(`Thumbnail generated: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error('Thumbnail error:', err.message);
          reject(err);
        });
    });
  }
}
