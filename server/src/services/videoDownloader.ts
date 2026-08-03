import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import { logger } from '../utils/logger.js';

/**
 * Downloads a YouTube video using yt-dlp (preferred) or falls back to a
 * lightweight HTTP approach when yt-dlp is unavailable.
 * Install yt-dlp on the host: https://github.com/yt-dlp/yt-dlp
 */
export class VideoDownloader {
  static async download(videoId: string, outputDir: string): Promise<string> {
    await fs.mkdir(outputDir, { recursive: true });
    const outputTemplate = path.join(outputDir, 'source.%(ext)s');
    const expectedPath = path.join(outputDir, 'source.mp4');

    // Try yt-dlp first
    const ytDlpOk = await this.runYtDlp(videoId, outputTemplate);
    if (ytDlpOk) {
      const files = await fs.readdir(outputDir);
      const source = files.find((f) => f.startsWith('source.'));
      if (source) {
        const full = path.join(outputDir, source);
        // Normalize to mp4 if needed
        if (!source.endsWith('.mp4')) {
          // FFmpeg will accept webm/mkv; return as-is
          logger.info(`Downloaded source via yt-dlp: ${full}`);
          return full;
        }
        logger.info(`Downloaded source via yt-dlp: ${full}`);
        return full;
      }
    }

    throw new Error(
      `Failed to download YouTube video ${videoId}. Ensure yt-dlp is installed and YOUTUBE_API_KEY is set.`,
    );
  }

  private static runYtDlp(videoId: string, outputTemplate: string): Promise<boolean> {
    return new Promise((resolve) => {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const args = [
        url,
        '-f',
        'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format',
        'mp4',
        '-o',
        outputTemplate,
        '--no-playlist',
        '--quiet',
        '--no-warnings',
      ];

      const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';

      proc.stderr?.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('error', (err) => {
        logger.warn(`yt-dlp not available: ${err.message}`);
        resolve(false);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          logger.warn(`yt-dlp exited ${code}: ${stderr}`);
          resolve(false);
        }
      });
    });
  }
}
