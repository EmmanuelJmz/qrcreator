import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiApp } from './src/server/app.ts';
import { isDatabaseConfigured } from './src/server/db/index.ts';
import { seedStarterTemplatesIfEmpty } from './src/server/db/seed.ts';
import { isAdminAuthConfigured } from './src/server/services/admin-auth.service.ts';
import { isStorageConfigured } from './src/server/services/storage/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  if (isDatabaseConfigured() && isStorageConfigured()) {
    await seedStarterTemplatesIfEmpty().catch((err) => {
      console.error('No se pudieron inicializar las plantillas base:', err);
    });
  } else {
    if (!isDatabaseConfigured()) {
      console.warn('Neon PostgreSQL aún no está configurado (falta DATABASE_URL).');
    }
    if (!isStorageConfigured()) {
      console.warn('Cloudflare R2 aún no está configurado (faltan R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).');
    }
  }
  if (!isAdminAuthConfigured()) {
    console.warn('Acceso administrativo pendiente (faltan ADMIN_USERNAME y ADMIN_PASSWORD o ADMIN_PASSWORD_HASH).');
  }

  const app = createApiApp();
  const isProd = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT || 3000);

  if (isProd) {
    const distDir = path.resolve(__dirname, '..', 'dist');
    const fallbackDistDir = path.resolve(__dirname, 'dist');
    const staticDir =
      process.cwd() === path.dirname(__dirname) ? distDir : fallbackDistDir;

    app.use(express.static(staticDir, { index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`CascoQR ejecutándose en http://0.0.0.0:${port} (${isProd ? 'producción' : 'desarrollo'})`);
  });
}

startServer().catch((err) => {
  console.error('Error fatal al iniciar CascoQR:', err);
  process.exit(1);
});
