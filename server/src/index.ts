import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.js';
import videoRoutes from './routes/videos.js';
import clipsRoutes from './routes/clips.js';
import youtubeRoutes from './routes/youtube.js';
import scheduleRoutes from './routes/schedule.js';
import analyticsRoutes from './routes/analytics.js';
import { errorHandler } from './middleware/errorHandler.js';
import swaggerUi from 'swagger-ui-express';
import swaggerDocs from './config/swagger.js';
import { startWorkers } from './queues/index.js';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 5000;
export const prisma = new PrismaClient();

const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(
  cors({
    origin: [frontendOrigin, 'http://localhost:5173', 'http://localhost:5000'],
    credentials: true,
  }),
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.1.0',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/clips', clipsRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info(`🚀 ClipFlow Server running on port ${PORT}`);
  logger.info(`📚 Swagger docs at http://localhost:${PORT}/api/docs`);

  // Start background workers (requires Redis)
  try {
    startWorkers();
  } catch (err: any) {
    logger.warn(
      `Could not start workers (is Redis running?): ${err.message}`,
    );
  }
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default app;
