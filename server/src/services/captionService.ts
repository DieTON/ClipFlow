import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger.js';

interface SrtCue {
  start: number;
  end: number;
  text: string;
}

function parseTimestamp(ts: string): number {
  // 00:00:01,000 or 00:00:01.000
  const norm = ts.trim().replace(',', '.');
  const parts = norm.split(':');
  if (parts.length === 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(norm) || 0;
}

function formatSrtTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const whole = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function parseSrt(content: string): SrtCue[] {
  const blocks = content.replace(/\r\n/g, '\n').split(/\n\n+/);
  const cues: SrtCue[] = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split('-->').map((x) => x.trim());
    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!text) continue;
    cues.push({
      start: parseTimestamp(startRaw),
      end: parseTimestamp(endRaw),
      text,
    });
  }
  return cues;
}

function sliceSrt(
  cues: SrtCue[],
  startSeconds: number,
  duration: number,
): SrtCue[] {
  const endSeconds = startSeconds + duration;
  return cues
    .filter((c) => c.end > startSeconds && c.start < endSeconds)
    .map((c) => ({
      start: Math.max(0, c.start - startSeconds),
      end: Math.min(duration, c.end - startSeconds),
      text: c.text,
    }))
    .filter((c) => c.end > c.start + 0.05);
}

function cuesToSrt(cues: SrtCue[]): string {
  return cues
    .map(
      (c, i) =>
        `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`,
    )
    .join('\n');
}

/** Escape path for ffmpeg subtitles filter on Windows */
function ffmpegSubPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

export class CaptionService {
  /**
   * Download YouTube auto-captions (SRT) next to the video if available.
   */
  static async downloadYoutubeSubs(
    videoId: string,
    outputDir: string,
  ): Promise<string | null> {
    await fs.mkdir(outputDir, { recursive: true });
    const outBase = path.join(outputDir, 'subs');

    return new Promise((resolve) => {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const args = [
        url,
        '--skip-download',
        '--write-auto-sub',
        '--write-sub',
        '--sub-langs',
        'en.*,en,en-US,en-GB',
        '--convert-subs',
        'srt',
        '--sub-format',
        'srt/best',
        '-o',
        outBase,
        '--no-playlist',
        '--no-warnings',
        '--extractor-args',
        'youtube:player_client=android,web',
      ];

      const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('error', () => resolve(null));
      proc.on('close', async () => {
        try {
          const files = await fs.readdir(outputDir);
          const srt = files.find(
            (f) => f.startsWith('subs') && f.endsWith('.srt'),
          );
          if (srt) {
            const full = path.join(outputDir, srt);
            logger.info(`Downloaded captions: ${full}`);
            resolve(full);
          } else {
            logger.warn(`No captions found for ${videoId}: ${stderr.slice(0, 200)}`);
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });
  }

  /**
   * Try local Whisper CLI for uploaded files (optional).
   * Install: pip install openai-whisper
   */
  static async transcribeWithWhisper(
    videoPath: string,
    outputDir: string,
  ): Promise<string | null> {
    await fs.mkdir(outputDir, { recursive: true });
    return new Promise((resolve) => {
      const args = [
        videoPath,
        '--model',
        'base',
        '--output_format',
        'srt',
        '--output_dir',
        outputDir,
        '--fp16',
        'False',
      ];
      const proc = spawn('whisper', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('error', () => {
        logger.warn('Whisper not installed — skip captions for upload');
        resolve(null);
      });
      proc.on('close', async (code) => {
        if (code !== 0) {
          logger.warn(`Whisper exited ${code}: ${stderr.slice(0, 300)}`);
          return resolve(null);
        }
        try {
          const base = path.basename(videoPath, path.extname(videoPath));
          const srtPath = path.join(outputDir, `${base}.srt`);
          await fs.access(srtPath);
          logger.info(`Whisper captions: ${srtPath}`);
          resolve(srtPath);
        } catch {
          resolve(null);
        }
      });
    });
  }

  /**
   * Slice full-video SRT to clip window and burn into vertical video.
   */
  static async burnCaptions(options: {
    videoPath: string;
    srtPath: string;
    startSeconds: number;
    duration: number;
    outputDir?: string;
  }): Promise<string | null> {
    const { videoPath, srtPath, startSeconds, duration } = options;
    const outputDir = options.outputDir || './videos';

    try {
      const raw = await fs.readFile(srtPath, 'utf8');
      const cues = sliceSrt(parseSrt(raw), startSeconds, duration);
      if (cues.length === 0) {
        logger.warn('No caption cues in clip time range');
        return null;
      }

      const clipSrtPath = path.join(outputDir, `${uuid()}-clip.srt`);
      await fs.writeFile(clipSrtPath, cuesToSrt(cues), 'utf8');

      const outPath = path.join(outputDir, `${uuid()}-captioned.mp4`);
      const style =
        'FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=0,Alignment=2,MarginV=80';

      await new Promise<void>((resolve, reject) => {
        const filter = `subtitles='${ffmpegSubPath(path.resolve(clipSrtPath))}':force_style='${style}'`;
        ffmpeg(videoPath)
          .videoFilters([filter])
          .outputOptions([
            '-c:v libx264',
            '-preset fast',
            '-crf 23',
            '-c:a copy',
            '-movflags +faststart',
          ])
          .output(outPath)
          .on('start', (cmd) => logger.info('Burning captions:', cmd))
          .on('end', () => {
            logger.info(`Captioned video: ${outPath}`);
            resolve();
          })
          .on('error', (err) => {
            logger.error('Caption burn failed:', err.message);
            reject(err);
          })
          .run();
      });

      return outPath;
    } catch (e: any) {
      logger.warn(`Captions skipped: ${e.message}`);
      return null;
    }
  }

  /**
   * Copy finished clip to a friendly user folder: ~/Videos/ClipFlow
   */
  static async exportToUserVideos(
    filePath: string,
    displayName: string,
  ): Promise<string | null> {
    try {
      const dir = path.join(os.homedir(), 'Videos', 'ClipFlow');
      await fs.mkdir(dir, { recursive: true });
      const safe = displayName.replace(/[^a-zA-Z0-9._\- ]+/g, '_').slice(0, 80);
      const dest = path.join(dir, `${safe}-${Date.now()}.mp4`);
      await fs.copyFile(filePath, dest);
      logger.info(`Exported to user folder: ${dest}`);
      return dest;
    } catch (e: any) {
      logger.warn(`Export to Videos/ClipFlow failed: ${e.message}`);
      return null;
    }
  }
}
