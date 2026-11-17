import fs from 'fs/promises';
import path from 'path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export const DEFAULT_R2_S3_API_URL =
  'https://e749a5c3d625e2a80eef9b33b5a97e31.r2.cloudflarestorage.com/qrimages';

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      'El almacenamiento privado en Cloudflare R2 no está configurado (faltan R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY).',
    );
    this.name = 'StorageNotConfiguredError';
  }
}

export interface StorageProvider {
  putObject(key: string, buffer: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}

export interface ResolvedR2Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

function sanitizeStorageKey(key: string): string {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || normalized.includes('\0')) {
    throw new Error('Ruta de almacenamiento inválida.');
  }
  return normalized;
}

export function resolveR2Config(): ResolvedR2Config {
  const rawEndpointOrApiUrl = (
    process.env.R2_S3_API_URL ||
    process.env.R2_ENDPOINT ||
    process.env.S3_ENDPOINT ||
    DEFAULT_R2_S3_API_URL
  ).trim();

  let endpoint = rawEndpointOrApiUrl.replace(/\/+$/, '');
  let bucketFromUrl = '';

  try {
    const parsed = new URL(rawEndpointOrApiUrl);
    endpoint = parsed.origin;
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0) {
      bucketFromUrl = pathSegments[0];
    }
  } catch {
    // Keep raw string if not a full URL
  }

  const bucket = (
    process.env.R2_BUCKET ||
    process.env.S3_BUCKET ||
    bucketFromUrl ||
    'qrimages'
  ).trim();

  const region = (
    process.env.R2_REGION ||
    process.env.S3_REGION ||
    'auto'
  ).trim();

  const accessKeyId = (
    process.env.R2_ACCESS_KEY_ID ||
    process.env.S3_ACCESS_KEY_ID ||
    ''
  ).trim();

  const secretAccessKey = (
    process.env.R2_SECRET_ACCESS_KEY ||
    process.env.S3_SECRET_ACCESS_KEY ||
    ''
  ).trim();

  const explicitForcePathStyle = process.env.S3_FORCE_PATH_STYLE;
  const isR2Endpoint = endpoint.includes('.r2.cloudflarestorage.com');
  const forcePathStyle =
    explicitForcePathStyle !== undefined
      ? explicitForcePathStyle === 'true'
      : isR2Endpoint;

  return {
    endpoint,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
  };
}

export function isStorageConfigured(): boolean {
  const driver = (process.env.STORAGE_DRIVER || 'r2').trim().toLowerCase();
  if (driver === 'local') {
    return true;
  }

  const cfg = resolveR2Config();
  if (!cfg.endpoint || !cfg.bucket || !cfg.accessKeyId || !cfg.secretAccessKey) {
    return false;
  }
  if (
    cfg.accessKeyId.includes('MY_') ||
    cfg.secretAccessKey.includes('MY_') ||
    cfg.accessKeyId.includes('CHANGE_ME') ||
    cfg.secretAccessKey.includes('CHANGE_ME')
  ) {
    return false;
  }
  return true;
}

class LocalPrivateStorageProvider implements StorageProvider {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  private resolveSafePath(key: string): string {
    const cleanKey = sanitizeStorageKey(key);
    const fullPath = path.resolve(this.baseDir, cleanKey);
    if (!fullPath.startsWith(this.baseDir + path.sep) && fullPath !== this.baseDir) {
      throw new Error('Acceso fuera del directorio privado de almacenamiento.');
    }
    return fullPath;
  }

  async putObject(key: string, buffer: Buffer): Promise<void> {
    const targetPath = this.resolveSafePath(key);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, buffer);
  }

  async getObject(key: string): Promise<Buffer> {
    const targetPath = this.resolveSafePath(key);
    return fs.readFile(targetPath);
  }

  async deleteObject(key: string): Promise<void> {
    const targetPath = this.resolveSafePath(key);
    try {
      await fs.unlink(targetPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

class CloudflareR2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const cfg = resolveR2Config();
    if (!isStorageConfigured()) {
      throw new StorageNotConfiguredError();
    }
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  async putObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
    const cleanKey = sanitizeStorageKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const cleanKey = sanitizeStorageKey(key);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      }),
    );
    if (!response.Body) {
      throw new Error('Archivo no encontrado en Cloudflare R2.');
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async deleteObject(key: string): Promise<void> {
    const cleanKey = sanitizeStorageKey(key);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      }),
    );
  }
}

let cachedProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cachedProvider) return cachedProvider;

  const driver = (process.env.STORAGE_DRIVER || 'r2').trim().toLowerCase();
  if (driver === 'local') {
    cachedProvider = new LocalPrivateStorageProvider(
      process.env.LOCAL_STORAGE_DIR || './.data/storage',
    );
  } else {
    cachedProvider = new CloudflareR2StorageProvider();
  }
  return cachedProvider;
}

export function resetStorageProviderForTests(): void {
  cachedProvider = null;
}
