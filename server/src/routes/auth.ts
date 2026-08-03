import express, { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { prisma } from '../index.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

function getOAuthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

router.get('/google/url', (_req: Request, res: Response) => {
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
  res.json({ url });
});

router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    if (!code) {
      throw new AppError('No authorization code provided', 400);
    }

    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    const userInfo = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    ).then((r) => r.json());

    let user = await prisma.user.findUnique({
      where: { email: userInfo.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userInfo.email,
          name: userInfo.name,
          avatar: userInfo.picture,
          googleId: userInfo.id,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: userInfo.name,
          avatar: userInfo.picture,
          googleId: userInfo.id,
        },
      });
    }

    const token = jwt.sign(
      {
        user: {
          userId: user.id,
          email: user.email,
        },
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' },
    );

    await prisma.oAuthToken.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        accessToken: tokens.access_token || '',
        refreshToken: tokens.refresh_token || undefined,
        expiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : undefined,
      },
      update: {
        accessToken: tokens.access_token || '',
        ...(tokens.refresh_token
          ? { refreshToken: tokens.refresh_token }
          : {}),
        expiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : undefined,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const userParam = encodeURIComponent(
      JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      }),
    );

    res.redirect(`${frontendUrl}/login?token=${token}&user=${userParam}`);
  } catch (error: any) {
    logger.error('Auth callback error:', error.message);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
});

router.post('/google', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      throw new AppError('No authorization code provided', 400);
    }

    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    const userInfo = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    ).then((r) => r.json());

    let user = await prisma.user.findUnique({
      where: { email: userInfo.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userInfo.email,
          name: userInfo.name,
          avatar: userInfo.picture,
          googleId: userInfo.id,
        },
      });
    }

    const token = jwt.sign(
      {
        user: {
          userId: user.id,
          email: user.email,
        },
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' },
    );

    await prisma.oAuthToken.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        accessToken: tokens.access_token || '',
        refreshToken: tokens.refresh_token || undefined,
        expiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : undefined,
      },
      update: {
        accessToken: tokens.access_token || '',
        ...(tokens.refresh_token
          ? { refreshToken: tokens.refresh_token }
          : {}),
        expiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : undefined,
      },
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch (error: any) {
    logger.error('Auth error:', error.message);
    throw error;
  }
});

router.post('/refresh', (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || 'refresh_secret',
    ) as any;

    const newToken = jwt.sign(
      { user: decoded.user },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' },
    );

    res.json({ token: newToken });
  } catch (error: any) {
    logger.error('Refresh error:', error.message);
    throw new AppError('Invalid refresh token', 401);
  }
});

export default router;
