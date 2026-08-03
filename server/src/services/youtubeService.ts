import axios from 'axios';
import { google } from 'googleapis';
import { createReadStream } from 'fs';
import { logger } from '../utils/logger.js';
import { prisma } from '../index.js';

export class YouTubeService {
  private static API_KEY = process.env.YOUTUBE_API_KEY;
  private static BASE_URL = 'https://www.googleapis.com/youtube/v3';

  static extractVideoId(url: string): string | null {
    const match = url.match(
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    );
    return match ? match[1] : null;
  }

  static async getVideoMetadata(videoId: string) {
    try {
      const response = await axios.get(`${this.BASE_URL}/videos`, {
        params: {
          id: videoId,
          key: this.API_KEY,
          part: 'snippet,contentDetails,statistics',
        },
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('Video not found');
      }

      const video = response.data.items[0];
      return {
        id: videoId,
        title: video.snippet.title,
        description: video.snippet.description,
        duration: video.contentDetails.duration,
        views: parseInt(video.statistics.viewCount || '0', 10),
        likes: parseInt(video.statistics.likeCount || '0', 10),
        thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url,
        channelId: video.snippet.channelId,
        channelTitle: video.snippet.channelTitle,
        publishedAt: video.snippet.publishedAt,
      };
    } catch (error: any) {
      logger.error('Error fetching video metadata:', error.message);
      throw error;
    }
  }

  static async publishShort(
    accessToken: string,
    videoPath: string,
    title: string,
    description: string,
    tags: string[],
  ): Promise<{ videoId: string; status: string }> {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
      );
      oauth2Client.setCredentials({ access_token: accessToken });

      const youtube = google.youtube({
        version: 'v3',
        auth: oauth2Client,
      });

      const shortTitle = title.length > 100 ? title.slice(0, 97) + '...' : title;
      const shortDescription = `${description}\n\n#Shorts`.slice(0, 5000);

      const res = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: shortTitle,
            description: shortDescription,
            tags: [...tags, 'Shorts'],
            categoryId: '22',
          },
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: createReadStream(videoPath),
        },
      });

      const videoId = res.data.id;
      if (!videoId) {
        throw new Error('YouTube upload returned no video ID');
      }

      logger.info(`Published YouTube Short: ${videoId}`);
      return { videoId, status: 'uploaded' };
    } catch (error: any) {
      logger.error('Error publishing to YouTube:', error.message);
      throw error;
    }
  }

  static async getUserChannels(accessToken: string) {
    try {
      const response = await axios.get(`${this.BASE_URL}/channels`, {
        params: {
          part: 'snippet,statistics',
          mine: true,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return (response.data.items || []).map((ch: any) => ({
        id: ch.id,
        title: ch.snippet.title,
        thumbnail: ch.snippet.thumbnails?.default?.url,
        subscriberCount: ch.statistics?.subscriberCount,
      }));
    } catch (error: any) {
      logger.error('Error fetching channels:', error.message);
      throw error;
    }
  }

  static async refreshAccessToken(refreshToken: string, userId: string): Promise<string> {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();
    const accessToken = credentials.access_token;
    if (!accessToken) {
      throw new Error('Failed to refresh access token');
    }

    await prisma.oAuthToken.update({
      where: { userId },
      data: {
        accessToken,
        expiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : undefined,
      },
    });

    return accessToken;
  }

  static async getVideoStats(youtubeVideoId: string) {
    try {
      const response = await axios.get(`${this.BASE_URL}/videos`, {
        params: {
          id: youtubeVideoId,
          key: this.API_KEY,
          part: 'statistics',
        },
      });
      const item = response.data.items?.[0];
      if (!item) return { views: 0, likes: 0, comments: 0 };
      return {
        views: parseInt(item.statistics.viewCount || '0', 10),
        likes: parseInt(item.statistics.likeCount || '0', 10),
        comments: parseInt(item.statistics.commentCount || '0', 10),
      };
    } catch (error: any) {
      logger.error('Error fetching video stats:', error.message);
      return { views: 0, likes: 0, comments: 0 };
    }
  }
}
