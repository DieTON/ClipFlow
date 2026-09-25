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

/** Group words into lines of max ~3–4 words for Shorts look */
function chunkWords(words: string[], maxPerLine = 4): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < words.length; i += maxPerLine) {
    chunks.push(words.slice(i, i + maxPerLine));
  }
  return chunks.length ? chunks : [['']];
}

/**
 * Karaoke-style ASS: active word in bright yellow, others white.
 * Bottom third, bold, strong outline — modern Shorts look.
 */
function cuesToKaraokeAss(cues: SrtCue[]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,Arial Black,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,2,60,60,160,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];

  for (const cue of cues) {
    const words = cue.text.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const chunks = chunkWords(words, 4);
    const cueDur = Math.max(0.15, cue.end - cue.start);
    // Time share per word across full cue
    const allWords = chunks.flat();
    const wordDur = cueDur / allWords.length;
    let t = cue.start;

    let globalIdx = 0;
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i++) {
        const wStart = t;
        const wEnd = Math.min(cue.end, t + wordDur);
        t = wEnd;

        // Build line: highlight current word in yellow (ASS BGR: &H00FFFF& = yellow)
        const parts = chunk.map((w, j) => {
          if (j === i) {
            return `{\\c&H0000FFFF&\\b1}${w}{\\c&H00FFFFFF&\\b0}`;
          }
          return w;
        });
        const line = parts.join(' ');

        events.push(
          `Dialogue: 0,${formatAssTime(wStart)},${formatAssTime(wEnd)},Karaoke,,0,0,0,,${line}`,
        );
        globalIdx++;
      }
    }
  }

  return header + events.join('\n') + '\n';
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
   * Burn modern karaoke captions (word highlight) onto vertical Short.
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

      const clipAssPath = path.join(outputDir, `${uuid()}-karaoke.ass`);
      await fs.writeFile(clipAssPath, cuesToKaraokeAss(cues), 'utf8');

      const outPath = path.join(outputDir, `${uuid()}-captioned.mp4`);

      await new Promise<void>((resolve, reject) => {
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
          .on('start', (cmd) => logger.info('Burning karaoke captions:', cmd))
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
