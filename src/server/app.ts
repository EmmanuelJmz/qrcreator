import express from 'express';
import { errorHandler } from './middleware/auth.middleware.ts';
import { authRouter } from './routes/auth.routes.ts';
import { labelsRouter } from './routes/labels.routes.ts';
import { documentsAdminRouter, ownersRouter } from './routes/owners.routes.ts';
import { publicRouter } from './routes/public.routes.ts';
import { templatesRouter } from './routes/templates.routes.ts';

export function createApiApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/v1/public', publicRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/templates', templatesRouter);
  app.use('/api/v1/owners', ownersRouter);
  app.use('/api/v1/documents', documentsAdminRouter);
  app.use('/api/v1', labelsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ruta de API no encontrada.' });
  });

  app.use(errorHandler);
  return app;
}
