import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        youtubeChannelId?: string;
      };
      token?: string;
    }
  }
}

export const authMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      throw new AppError('No token provided', 401);
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'secret',
    ) as any;
    req.user = decoded.user;
    req.token = token;
    next();
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Invalid or expired token', 401);
  }
};

export const optionalAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'secret',
      ) as any;
      req.user = decoded.user;
      req.token = token;
    }
  } catch {
    // Optional auth — ignore invalid tokens
  }
  next();
};
