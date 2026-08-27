import AWS from 'aws-sdk';
import { promises as fs } from 'fs';
import { logger } from '../utils/logger.js';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

export class S3Service {
  static async uploadFile(
    filePath: string,
    key: string,
    contentType: string = 'video/mp4',
  ): Promise<string> {
    try {
      const fileContent = await fs.readFile(filePath);
      const params = {
        Bucket: process.env.AWS_S3_BUCKET || 'clipflow-videos',
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        ACL: 'public-read' as const,
      };

      const result = await s3.upload(params).promise();
      logger.info(`File uploaded to S3: ${result.Location}`);
      return result.Location;
    } catch (error: any) {
      logger.error('S3 upload error:', error.message);
      throw error;
    }
  }

  static async deleteFile(key: string): Promise<void> {
    try {
      const params = {
        Bucket: process.env.AWS_S3_BUCKET || 'clipflow-videos',
        Key: key,
      };
      await s3.deleteObject(params).promise();
      logger.info(`File deleted from S3: ${key}`);
    } catch (error: any) {
      logger.error('S3 delete error:', error.message);
      throw error;
    }
  }

  static async getSignedUrl(
    key: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      const params = {
        Bucket: process.env.AWS_S3_BUCKET || 'clipflow-videos',
        Key: key,
        Expires: expiresIn,
      };
      return s3.getSignedUrl('getObject', params);
    } catch (error: any) {
      logger.error('S3 signed URL error:', error.message);
      throw error;
    }
  }

  static async uploadVideoFile(
    filePath: string,
    userId: string,
    fileName: string,
  ): Promise<{ url: string; key: string }> {
    const key = `videos/${userId}/${Date.now()}-${fileName}`;
    const url = await this.uploadFile(filePath, key, 'video/mp4');
    return { url, key };
  }

  static async uploadThumbnail(
    filePath: string,
    userId: string,
    fileName: string,
  ): Promise<{ url: string; key: string }> {
    const key = `thumbnails/${userId}/${Date.now()}-${fileName}`;
    const url = await this.uploadFile(filePath, key, 'image/jpeg');
    return { url, key };
  }
}
