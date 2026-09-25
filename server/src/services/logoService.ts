import path from 'path';
import { promises as fs } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger.js';

export class LogoService {
  static logoDir(userId: string) {
    return path.join(process.cwd(), 'videos', 'logos', userId);
  }

  static async findUserLogo(userId: string): Promise<string | null> {
    const dir = this.logoDir(userId);
    try {
      const files = await fs.readdir(dir);
      const logo = files.find((f) =>
        /\.(png|jpg|jpeg|webp)$/i.test(f),
      );
      if (!logo) return null;
      return path.join(dir, logo);
    } catch {
      return null;
    }
  }

  /**
   * Overlay logo bottom-right on 1080x1920 vertical clip (small watermark).
   */
  static async applyLogo(options: {
    videoPath: string;
    logoPath: string;
    outputDir?: string;
  }): Promise<string | null> {
    const { videoPath, logoPath } = options;
    const outputDir = options.outputDir || './videos';

    try {
      await fs.access(logoPath);
      const outPath = path.join(outputDir, `${uuid()}-logo.mp4`);

      // Scale logo to ~12% of width (~130px), 40px margin from edges
      const filter =
        '[1:v]scale=130:-1[logo];[0:v][logo]overlay=W-w-40:H-h-160';

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(videoPath)
          .input(logoPath)
          .complexFilter(filter)
          .outputOptions([
            '-c:v libx264',
            '-preset fast',
            '-crf 23',
            '-c:a copy',
            '-movflags +faststart',
          ])
          .output(outPath)
          .on('start', (cmd) => logger.info('Applying logo:', cmd))
          .on('end', () => {
            logger.info(`Logo applied: ${outPath}`);
            resolve();
          })
          .on('error', (err) => {
            logger.error('Logo overlay failed:', err.message);
            reject(err);
          })
          .run();
      });

      return outPath;
    } catch (e: any) {
      logger.warn(`Logo skipped: ${e.message}`);
      return null;
    }
  }
}
