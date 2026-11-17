import crypto from 'crypto';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { loginAttempts } from '../db/schema.ts';

export const SESSION_COOKIE_NAME = 'cascoqr_session';
const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_WINDOW_MINUTES = 15;
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export interface VerifiedAdminContext {
  username: string;
}

export class AuthNotConfiguredError extends Error {
  constructor() {
    super(
      'El acceso administrativo no está configurado (faltan ADMIN_USERNAME y ADMIN_PASSWORD o ADMIN_PASSWORD_HASH).',
    );
    this.name = 'AuthNotConfiguredError';
  }
}

export class SessionSecretNotConfiguredError extends Error {
  constructor() {
    super(
      'Falta la variable SESSION_SECRET en el servidor (obligatoria en producción/Vercel para mantener sesiones administrativas).',
    );
    this.name = 'SessionSecretNotConfiguredError';
  }
}

export class TooManyLoginAttemptsError extends Error {
  constructor() {
    super('Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentar.');
    this.name = 'TooManyLoginAttemptsError';
  }
}

function getConfiguredAdminUsername(): string {
  return process.env.ADMIN_USERNAME?.trim() || '';
}

function getConfiguredPasswordSecret(): { hash?: string; plain?: string } {
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim();
  const plain = process.env.ADMIN_PASSWORD?.trim();
  return {
    hash: hash || undefined,
    plain: plain || undefined,
  };
}

export function isAdminAuthConfigured(): boolean {
  const username = getConfiguredAdminUsername();
  const { hash, plain } = getConfiguredPasswordSecret();
  return Boolean(username && (hash || plain));
}

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function resolvePersistentSecret(): string {
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (sessionSecret && !sessionSecret.includes('CHANGE_ME')) {
    return sessionSecret;
  }
  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (tokenKey && !tokenKey.includes('CHANGE_ME')) {
    return tokenKey;
  }
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    throw new SessionSecretNotConfiguredError();
  }
  return EPHEMERAL_SECRET;
}

function getSessionSecretBytes(): Uint8Array {
  const derived = crypto.createHash('sha256').update(resolvePersistentSecret()).digest();
  return new Uint8Array(derived);
}

function getIpHmacKey(): string {
  return resolvePersistentSecret();
}

export function computeIpHmac(clientIp: string): string {
  const normalized = clientIp.trim() || 'unknown';
  return crypto.createHmac('sha256', getIpHmacKey()).update(normalized).digest('hex');
}

function safeEqualText(a: string, b: string): boolean {
  const da = crypto.createHash('sha256').update(a).digest();
  const db = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(da, db);
}

export function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPasswordScrypt(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, saltHex, expectedHex] = parts;
  if (!saltHex || !expectedHex || !/^[0-9a-f]+$/i.test(expectedHex)) {
    return false;
  }
  const derived = crypto.scryptSync(password, saltHex, expectedHex.length / 2);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  if (!isAdminAuthConfigured()) {
    throw new AuthNotConfiguredError();
  }

  const expectedUsername = getConfiguredAdminUsername();
  if (!safeEqualText(username, expectedUsername)) {
    return false;
  }

  const { hash, plain } = getConfiguredPasswordSecret();
  if (hash) {
    return verifyPasswordScrypt(password, hash);
  }
  if (plain) {
    return safeEqualText(password, plain);
  }
  return false;
}

export async function assertLoginAllowed(ipHash: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const db = getDb();
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000);

  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ipHash, ipHash), gte(loginAttempts.attemptedAt, windowStart)));

  if ((rows[0]?.total || 0) >= MAX_FAILED_ATTEMPTS) {
    throw new TooManyLoginAttemptsError();
  }
}

export async function recordFailedLoginAttempt(ipHash: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const db = getDb();
  await db.insert(loginAttempts).values({ ipHash });
}

export async function clearLoginAttempts(ipHash: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const db = getDb();
  const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.delete(loginAttempts).where(eq(loginAttempts.ipHash, ipHash));
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, staleCutoff));
}

export async function createAdminSessionToken(username: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionSecretBytes());
}

export async function verifyAdminSessionToken(token: string): Promise<VerifiedAdminContext> {
  if (!isAdminAuthConfigured()) {
    throw new AuthNotConfiguredError();
  }

  const { payload } = await jwtVerify(token, getSessionSecretBytes());
  const subject = typeof payload.sub === 'string' ? payload.sub : '';
  const expectedUsername = getConfiguredAdminUsername();

  if (!subject || !safeEqualText(subject, expectedUsername)) {
    throw new Error('Sesión administrativa inválida.');
  }

  return { username: expectedUsername };
}
