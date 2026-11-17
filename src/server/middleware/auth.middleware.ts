import type { NextFunction, Request, Response } from 'express';
import { DatabaseNotConfiguredError } from '../db/index.ts';
import {
  AuthNotConfiguredError,
  SESSION_COOKIE_NAME,
  SessionSecretNotConfiguredError,
  TooManyLoginAttemptsError,
  verifyAdminSessionToken,
  type VerifiedAdminContext,
} from '../services/admin-auth.service.ts';
import { StorageNotConfiguredError } from '../services/storage/index.ts';
import { TokenEncryptionNotConfiguredError } from '../services/token.service.ts';

export interface AdminRequest extends Request {
  admin?: VerifiedAdminContext;
}

function extractCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    if (name === SESSION_COOKIE_NAME) {
      const value = pair.slice(idx + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

export async function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    token = extractCookieToken(req.headers.cookie);
  }

  if (!token) {
    res.status(401).json({ error: 'Sesión administrativa requerida.' });
    return;
  }

  try {
    req.admin = await verifyAdminSessionToken(token);
    next();
  } catch (err) {
    if (
      err instanceof DatabaseNotConfiguredError ||
      err instanceof AuthNotConfiguredError ||
      err instanceof SessionSecretNotConfiguredError
    ) {
      res.status(503).json({ error: err.message });
      return;
    }
    res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
}

const publicHits = new Map<string, { count: number; resetAt: number }>();

export function rateLimitPublic(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 120;

  const entry = publicHits.get(ip);
  if (!entry || entry.resetAt <= now) {
    publicHits.set(ip, { count: 1, resetAt: now + windowMs });
    next();
    return;
  }

  if (entry.count >= maxRequests) {
    res.status(429).json({ error: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.' });
    return;
  }

  entry.count += 1;
  next();
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (
    err instanceof DatabaseNotConfiguredError ||
    err instanceof AuthNotConfiguredError ||
    err instanceof SessionSecretNotConfiguredError ||
    err instanceof TokenEncryptionNotConfiguredError ||
    err instanceof StorageNotConfiguredError
  ) {
    res.status(503).json({ error: err.message });
    return;
  }

  if (err instanceof TooManyLoginAttemptsError) {
    res.status(429).json({ error: err.message });
    return;
  }

  if (err && typeof err === 'object' && 'code' in err) {
    const pgCode = (err as { code?: string }).code;
    const message = 'message' in err ? String((err as { message?: unknown }).message) : '';

    if (pgCode === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'El archivo excede el límite máximo permitido de 4 MB.' });
      return;
    }

    if (pgCode === '23514') {
      if (message.includes('max_documents_reached')) {
        res.status(400).json({
          error: 'Límite excedido: cada propietario puede tener un máximo de 5 documentos.',
        });
        return;
      }
      if (message.includes('qr_too_small')) {
        res.status(400).json({ error: 'El ancho mínimo permitido para el código QR es 5%.' });
        return;
      }
      if (message.includes('qr_not_square')) {
        res.status(400).json({
          error: 'El código QR debe mantener una proporción cuadrada exacta (1:1).',
        });
        return;
      }
      res.status(400).json({
        error: 'Los datos enviados no cumplen las restricciones de validación.',
      });
      return;
    }

    if (pgCode === '22P02') {
      res.status(400).json({ error: 'Formato de identificador o parámetro inválido.' });
      return;
    }
  }

  console.error('Error en API:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Ocurrió un error interno al procesar la solicitud.' });
}
