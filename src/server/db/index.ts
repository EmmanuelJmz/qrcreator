import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema.ts';

if (typeof globalThis.WebSocket !== 'undefined') {
  neonConfig.webSocketConstructor = globalThis.WebSocket;
}

export type AppDb = NeonDatabase<typeof schema>;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('La base de datos Neon PostgreSQL no está configurada (falta DATABASE_URL válida).');
    this.name = 'DatabaseNotConfiguredError';
  }
}

let adminPoolInstance: Pool | null = null;
let publicPoolInstance: Pool | null = null;
let dbInstance: AppDb | null = null;

function isValidPostgresUrl(raw?: string): boolean {
  const url = raw?.trim();
  if (!url) return false;
  if (
    url.includes('USER:PASSWORD@ENDPOINT') ||
    url.includes('AUN NO LAS PONDRÉ') ||
    url.includes(':PASSWORD@') ||
    url === 'MY_DATABASE_URL' ||
    /\s/.test(url)
  ) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

export function isDatabaseConfigured(): boolean {
  return isValidPostgresUrl(process.env.DATABASE_URL);
}

export function isPublicDatabaseConfigured(): boolean {
  return isValidPostgresUrl(process.env.DATABASE_PUBLIC_URL) || isDatabaseConfigured();
}

export function getDb(): AppDb {
  if (dbInstance) return dbInstance;

  if (!isDatabaseConfigured()) {
    throw new DatabaseNotConfiguredError();
  }

  adminPoolInstance = new Pool({
    connectionString: process.env.DATABASE_URL!.trim(),
    max: 10,
  });
  adminPoolInstance.on('error', (err: unknown) => {
    console.error('Error en el pool admin de Neon PostgreSQL:', err);
  });

  dbInstance = drizzle(adminPoolInstance, { schema });
  return dbInstance;
}

export function getPublicPool(): Pool {
  if (publicPoolInstance) return publicPoolInstance;

  const publicUrl = isValidPostgresUrl(process.env.DATABASE_PUBLIC_URL)
    ? process.env.DATABASE_PUBLIC_URL!.trim()
    : isDatabaseConfigured()
      ? process.env.DATABASE_URL!.trim()
      : '';

  if (!publicUrl) {
    throw new DatabaseNotConfiguredError();
  }

  publicPoolInstance = new Pool({
    connectionString: publicUrl,
    max: 10,
  });
  publicPoolInstance.on('error', (err: unknown) => {
    console.error('Error en el pool público de Neon PostgreSQL:', err);
  });

  return publicPoolInstance;
}

export interface PublicCardSqlRow {
  owner_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  template_storage_key: string;
  template_mime: string;
  template_width: number;
  template_height: number;
  qr_x: string | number;
  qr_y: string | number;
  qr_width: string | number;
  qr_height: string | number;
  qr_style?: string | null;
}

export interface PublicDocumentSqlRow {
  document_id: string;
  original_name: string;
  mime_type: string;
}

export interface PublicDocumentFileSqlRow {
  storage_key: string;
  mime_type: string;
}

export interface PublicQueryExecutor {
  getCardByHash(tokenHash: string): Promise<PublicCardSqlRow | null>;
  getDocumentsByHash(tokenHash: string): Promise<PublicDocumentSqlRow[]>;
  getDocumentFile(tokenHash: string, docId: string): Promise<PublicDocumentFileSqlRow | null>;
  recordScanByHash?(tokenHash: string): Promise<void>;
}

let customPublicExecutorForTests: PublicQueryExecutor | null = null;

export function setPublicQueryExecutorForTests(executor: PublicQueryExecutor | null): void {
  customPublicExecutorForTests = executor;
}

export function getPublicQueryExecutor(): PublicQueryExecutor {
  if (customPublicExecutorForTests) return customPublicExecutorForTests;

  return {
    async getCardByHash(tokenHash: string) {
      const pool = getPublicPool();
      const result = await pool.query<PublicCardSqlRow>(
        'SELECT * FROM public_card_by_hash($1::char(64))',
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },
    async getDocumentsByHash(tokenHash: string) {
      const pool = getPublicPool();
      const result = await pool.query<PublicDocumentSqlRow>(
        'SELECT * FROM public_documents_by_hash($1::char(64))',
        [tokenHash],
      );
      return result.rows;
    },
    async getDocumentFile(tokenHash: string, docId: string) {
      const pool = getPublicPool();
      const result = await pool.query<PublicDocumentFileSqlRow>(
        'SELECT * FROM public_document_file($1::char(64), $2::uuid)',
        [tokenHash, docId],
      );
      return result.rows[0] ?? null;
    },
    async recordScanByHash(tokenHash: string) {
      const pool = getPublicPool();
      await pool.query('SELECT public_record_scan($1::char(64))', [tokenHash]);
    },
  };
}

export function setDbForTests(customDb: AppDb | null): void {
  dbInstance = customDb;
  if (!customDb) {
    adminPoolInstance = null;
    publicPoolInstance = null;
  }
}
