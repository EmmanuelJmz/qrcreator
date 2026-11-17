import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export class TokenEncryptionNotConfiguredError extends Error {
  constructor() {
    super(
      'Falta la variable TOKEN_ENCRYPTION_KEY en el servidor (obligatoria en producción/Vercel para cifrar y descifrar tokens QR).',
    );
    this.name = 'TokenEncryptionNotConfiguredError';
  }
}

function isProductionOrVercel(): boolean {
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

function isPlaceholderSecret(val?: string): boolean {
  const trimmed = val?.trim();
  return !trimmed || trimmed.includes('CHANGE_ME');
}

let cachedDevKeys: { tokenKey: string; sessionSecret: string } | null = null;

function getOrLoadServerKeys(): { tokenKey: string; sessionSecret: string } {
  if (
    !isPlaceholderSecret(process.env.TOKEN_ENCRYPTION_KEY) &&
    !isPlaceholderSecret(process.env.SESSION_SECRET)
  ) {
    return {
      tokenKey: process.env.TOKEN_ENCRYPTION_KEY!.trim(),
      sessionSecret: process.env.SESSION_SECRET!.trim(),
    };
  }
  if (cachedDevKeys) return cachedDevKeys;

  const keyFilePath = path.resolve('./.data/.server-keys.json');
  try {
    if (fs.existsSync(keyFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(keyFilePath, 'utf-8'));
      if (parsed.tokenKey && parsed.sessionSecret) {
        cachedDevKeys = parsed;
        return cachedDevKeys!;
      }
    }
  } catch {
    // Regenerate below if unreadable
  }

  const generated = {
    tokenKey: crypto.randomBytes(32).toString('hex'),
    sessionSecret: crypto.randomBytes(32).toString('hex'),
  };
  try {
    fs.mkdirSync(path.dirname(keyFilePath), { recursive: true });
    fs.writeFileSync(keyFilePath, JSON.stringify(generated), { mode: 0o600 });
  } catch {
    // Fallback to in-memory keys if filesystem is read-only
  }
  cachedDevKeys = generated;
  return generated;
}

function getAesKeyBuffer(): Buffer {
  const envKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!isPlaceholderSecret(envKey)) {
    return crypto.createHash('sha256').update(envKey!.trim()).digest();
  }
  if (isProductionOrVercel()) {
    throw new TokenEncryptionNotConfiguredError();
  }
  const raw = getOrLoadServerKeys().tokenKey;
  return crypto.createHash('sha256').update(raw).digest();
}

export function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET;
  if (!isPlaceholderSecret(envSecret)) {
    return envSecret!.trim();
  }
  return getOrLoadServerKeys().sessionSecret;
}

/** Generates a cryptographically secure 256-bit unpredictable URL-safe token. */
export function generatePublicToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashPublicToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function encryptPublicToken(token: string): string {
  const key = getAesKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptPublicToken(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('Formato de token cifrado inválido.');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const key = getAesKeyBuffer();
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const data = Buffer.from(dataB64, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

export function resolvePublicBaseUrl(requestOrigin?: string): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl !== 'MY_APP_URL') {
    return envUrl.replace(/\/+$/, '');
  }
  if (requestOrigin) {
    return requestOrigin.replace(/\/+$/, '');
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

export function buildPublicCardUrl(token: string, requestOrigin?: string): string {
  return `${resolvePublicBaseUrl(requestOrigin)}/ficha/${encodeURIComponent(token)}`;
}
