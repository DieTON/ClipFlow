import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import { logger } from '../utils/logger.js';

/**
 * Downloads a YouTube video using yt-dlp.
 * Install: https://github.com/yt-dlp/yt-dlp
 */
export class VideoDownloader {
  static async download(videoId: string, outputDir: string): Promise<string> {
    await fs.mkdir(outputDir, { recursive: true });
    const outputTemplate = path.join(outputDir, 'source.%(ext)s');

    const ytDlpOk = await this.runYtDlp(videoId, outputTemplate);
    if (ytDlpOk) {
      const files = await fs.readdir(outputDir);
      const source = files.find((f) => f.startsWith('source.'));
      if (source) {
        const full = path.join(outputDir, source);
        logger.info(`Downloaded source via yt-dlp: ${full}`);
        return full;
      }
    }

    throw new Error(
      `Failed to download YouTube video ${videoId}. Update yt-dlp (yt-dlp -U) or try another video. YouTube may block some downloads (403).`,
    );
  }

  private static runYtDlp(
    videoId: string,
    outputTemplate: string,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      // player_client android/web helps avoid many 403 errors from YouTube
      const args = [
        url,
        '-f',
        'best[height<=720][ext=mp4]/best[height<=720]/best',
        '-o',
        outputTemplate,
        '--no-playlist',
        '--no-warnings',
        '--extractor-args',
        'youtube:player_client=android,web',
        '--retries',
        '3',
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
