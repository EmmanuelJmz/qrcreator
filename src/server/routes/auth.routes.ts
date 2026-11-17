import { Router } from 'express';
import { isDatabaseConfigured } from '../db/index.ts';
import { requireAdmin, type AdminRequest } from '../middleware/auth.middleware.ts';
import { loginSchema } from '../schemas/index.ts';
import {
  assertLoginAllowed,
  clearLoginAttempts,
  computeIpHmac,
  createAdminSessionToken,
  isAdminAuthConfigured,
  recordFailedLoginAttempt,
  SESSION_COOKIE_NAME,
  verifyAdminCredentials,
} from '../services/admin-auth.service.ts';
import { isStorageConfigured } from '../services/storage/index.ts';

export const authRouter = Router();

authRouter.get('/config', (_req, res) => {
  res.json({
    authConfigured: isAdminAuthConfigured(),
    dbConfigured: isDatabaseConfigured(),
    storageConfigured: isStorageConfigured(),
  });
});

authRouter.post('/login', async (req, res, next) => {
  try {
    if (!isAdminAuthConfigured()) {
      res.status(503).json({
        error:
          'El acceso administrativo no está configurado (faltan ADMIN_USERNAME y ADMIN_PASSWORD o ADMIN_PASSWORD_HASH).',
      });
      return;
    }

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Datos inválidos.' });
      return;
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const ipHash = computeIpHmac(clientIp);

    await assertLoginAllowed(ipHash);

    const valid = verifyAdminCredentials(parsed.data.username, parsed.data.password);
    if (!valid) {
      await recordFailedLoginAttempt(ipHash);
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    await clearLoginAttempts(ipHash);

    const expectedUsername = process.env.ADMIN_USERNAME!.trim();
    const token = await createAdminSessionToken(expectedUsername);
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: isHttps ? 'none' : 'lax',
      secure: isHttps,
      path: '/',
      maxAge: 1000 * 60 * 60 * 12,
    });

    res.json({
      admin: {
        username: expectedUsername,
      },
      sessionToken: token,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (req, res) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
  });
  res.json({ ok: true });
});

authRouter.get('/me', requireAdmin, (req: AdminRequest, res) => {
  res.json({
    admin: {
      username: req.admin!.username,
    },
  });
});
