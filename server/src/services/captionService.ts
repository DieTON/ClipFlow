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

function formatAssTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const whole = Math.floor(s % 60);
  const cs = Math.round((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
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
      .replace(/\s+/g, ' ')
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

/** Keep lines short so text stays in a small bottom band */
function wrapCaptionText(text: string, maxChars = 28): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = w;
      if (lines.length >= 2) {
        // Max 2 lines — put rest on second line truncated lightly
        break;
      }
    } else {
      current = next;
    }
  }
  if (current && lines.length < 2) lines.push(current);
  else if (current && lines.length >= 2) {
    lines[1] = `${lines[1]} ${current}`.slice(0, maxChars + 8);
  }
  return lines.join('\\N');
}

function cuesToAss(cues: SrtCue[]): string {
  // PlayRes must match vertical Short so Fontsize is predictable
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,36,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,2,50,50,140,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = cues
    .map((c) => {
      const body = wrapCaptionText(c.text);
      return `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},Default,,0,0,0,,${body}`;
    })
    .join('\n');

  return header + events + '\n';
}

function ffmpegSubPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

export class CaptionService {
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
   * Burn smaller bottom captions (1080x1920 ASS) so faces stay clear.
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

      const clipAssPath = path.join(outputDir, `${uuid()}-clip.ass`);
      await fs.writeFile(clipAssPath, cuesToAss(cues), 'utf8');

      const outPath = path.join(outputDir, `${uuid()}-captioned.mp4`);

      await new Promise<void>((resolve, reject) => {
        // No force_style — sizes come from ASS PlayRes 1080x1920
        const filter = `ass='${ffmpegSubPath(path.resolve(clipAssPath))}'`;
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
          .on('start', (cmd) => logger.info('Burning captions (compact):', cmd))
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
