import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  clampSquareLabelGeometry,
  computeSquareHeightPct,
  validateLabelGeometry,
} from '@/src/lib/qr-geometry';
import { QR_STYLE_IDS, renderStyledQrSvg } from '@/src/lib/qr-styled';
import { labelConfigSchema, ownerInfoSchema } from '@/src/server/schemas';
import { generateQrPngBuffer } from '@/src/server/services/label-render.service';
import {
  createAdminSessionToken,
  SessionSecretNotConfiguredError,
} from '@/src/server/services/admin-auth.service';
import { detectImageSignature } from '@/src/server/services/file-validation';
import {
  decryptPublicToken,
  encryptPublicToken,
  generatePublicToken,
  hashPublicToken,
  TokenEncryptionNotConfiguredError,
} from '@/src/server/services/token.service';

import { isDatabaseConfigured } from '@/src/server/db';
import {
  DEFAULT_R2_S3_API_URL,
  isStorageConfigured,
  resolveR2Config,
} from '@/src/server/services/storage';

describe('Geometría cuadrada 1:1 y límites del editor QR', () => {
  it('mantiene proporción cuadrada 1:1 en plantillas rectangulares (1200x600)', () => {
    const height = computeSquareHeightPct(20, 1200, 600);
    expect(height).toBe(40);
    const check = validateLabelGeometry({ x: 10, y: 10, width: 20, height: 40 }, 1200, 600);
    expect(check.valid).toBe(true);
  });

  it('rechaza coordenadas negativas, ancho menor a 5% o desbordamiento > 100%', () => {
    expect(validateLabelGeometry({ x: -1, y: 10, width: 20, height: 20 }, 1000, 1000).valid).toBe(false);
    expect(validateLabelGeometry({ x: 10, y: -0.5, width: 20, height: 20 }, 1000, 1000).valid).toBe(false);
    expect(validateLabelGeometry({ x: 10, y: 10, width: 0, height: 0 }, 1000, 1000).valid).toBe(false);
    expect(validateLabelGeometry({ x: 10, y: 10, width: 4.5, height: 4.5 }, 1000, 1000).valid).toBe(false);
    expect(validateLabelGeometry({ x: 85, y: 10, width: 20, height: 20 }, 1000, 1000).valid).toBe(false);
    expect(validateLabelGeometry({ x: 10, y: 85, width: 20, height: 20 }, 1000, 1000).valid).toBe(false);
  });

  it('rechaza QR rectangular deformado (> 1 px de diferencia)', () => {
    expect(validateLabelGeometry({ x: 10, y: 10, width: 20, height: 35 }, 1000, 1000).valid).toBe(false);
    expect(validateLabelGeometry({ x: 10, y: 10, width: 20, height: 20.5 }, 1000, 1000).valid).toBe(false);
  });

  it('limita el desplazamiento dentro del área [0, 100]% sin deformar', () => {
    const clamped = clampSquareLabelGeometry({ x: 95, y: 95, width: 20 }, 1200, 600);
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(100);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(100);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
    expect(validateLabelGeometry(clamped, 1200, 600).valid).toBe(true);
  });
});

describe('Seguridad criptográfica de tokens y firma binaria de archivos', () => {
  it('genera tokens únicos de alta entropía, los hashea y los cifra/descifra', () => {
    const t1 = generatePublicToken();
    const t2 = generatePublicToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThanOrEqual(40);
    expect(hashPublicToken(t1)).toHaveLength(64);
    const enc = encryptPublicToken(t1);
    expect(enc).not.toContain(t1);
    expect(decryptPublicToken(enc)).toBe(t1);
  });

  it('valida magic bytes reales de PNG y JPEG y rechaza payloads falsos', () => {
    const fakeSvg = Buffer.from('<svg></svg>');
    expect(detectImageSignature(fakeSvg)).toBeNull();

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(detectImageSignature(pngHeader)).toBe('image/png');

    const jpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectImageSignature(jpgHeader)).toBe('image/jpeg');
  });

  it('resuelve endpoint y bucket de Cloudflare R2 desde S3 API URL y protege URLs placeholder', () => {
    const r2 = resolveR2Config();
    expect(DEFAULT_R2_S3_API_URL).toContain('r2.cloudflarestorage.com/qrimages');
    expect(r2.endpoint).toBe('https://e749a5c3d625e2a80eef9b33b5a97e31.r2.cloudflarestorage.com');
    expect(r2.bucket).toBe('qrimages');
    expect(r2.region).toBe('auto');
    expect(r2.forcePathStyle).toBe(true);
    expect(isStorageConfigured()).toBe(false);

    const prevDb = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      'postgresql://AUN NO LAS PONDRÉ@ep-wandering-water-bdrfb5k6-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require';
    expect(isDatabaseConfigured()).toBe(false);
    if (prevDb === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = prevDb;
    }
  });

  it('exige TOKEN_ENCRYPTION_KEY y SESSION_SECRET explícitos cuando VERCEL=1', async () => {
    const prevVercel = process.env.VERCEL;
    const prevTokenKey = process.env.TOKEN_ENCRYPTION_KEY;
    const prevSession = process.env.SESSION_SECRET;

    process.env.VERCEL = '1';
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.SESSION_SECRET;

    try {
      expect(() => encryptPublicToken('sample-token')).toThrow(TokenEncryptionNotConfiguredError);
      await expect(createAdminSessionToken('admin')).rejects.toThrow(
        SessionSecretNotConfiguredError,
      );
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
      if (prevTokenKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
      else process.env.TOKEN_ENCRYPTION_KEY = prevTokenKey;
      if (prevSession === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = prevSession;
    }
  });

  it('valida que nombre y apellidos solo acepten letras y valida formato de email y teléfono', () => {
    const valid = ownerInfoSchema.safeParse({
      firstName: '  María   José ',
      lastName: "Pérez-O'Connor",
      email: 'maria@ejemplo.com',
      phone: '+52 55 1234-5678',
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.firstName).toBe('María José');
    }

    expect(
      ownerInfoSchema.safeParse({ firstName: 'Juan123', lastName: 'López' }).success,
    ).toBe(false);
    expect(
      ownerInfoSchema.safeParse({ firstName: 'Juan', lastName: 'López@#' }).success,
    ).toBe(false);
    expect(
      ownerInfoSchema.safeParse({
        firstName: 'Juan',
        lastName: 'López',
        email: 'correo-invalido',
      }).success,
    ).toBe(false);
    expect(
      ownerInfoSchema.safeParse({
        firstName: 'Juan',
        lastName: 'López',
        phone: 'abc-tel',
      }).success,
    ).toBe(false);
  });

  it('genera los 4 estilos de QR en SVG y PNG cuadrado', async () => {
    const sampleUrl = 'https://cascoqr.app/ficha/ejemplo-token-123';

    for (const style of QR_STYLE_IDS) {
      const svg = renderStyledQrSvg(sampleUrl, { style });
      expect(svg).toContain('<svg');
      expect(svg).toContain('<path d="M');

      const png = await generateQrPngBuffer(sampleUrl, 240, style);
      const meta = await sharp(png).metadata();
      expect(meta.format).toBe('png');
      expect(meta.width).toBe(240);
      expect(meta.height).toBe(240);
    }

    expect(renderStyledQrSvg(sampleUrl, { style: 'fluid' })).toContain('fill="#DC4C0D"');
    expect(renderStyledQrSvg(sampleUrl, { style: 'dots' })).toContain('<circle');
    expect(renderStyledQrSvg(sampleUrl, { style: 'rounded' })).toContain('<linearGradient');
    expect(renderStyledQrSvg(sampleUrl, { style: 'diamonds' })).toContain('fill="#DC2626"');
  });

  it('valida qrStyle en labelConfigSchema y asigna fluid por defecto', () => {
    const base = {
      templateId: '550e8400-e29b-41d4-a716-446655440000',
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    };

    const withDefault = labelConfigSchema.safeParse(base);
    expect(withDefault.success).toBe(true);
    if (withDefault.success) {
      expect(withDefault.data.qrStyle).toBe('fluid');
    }

    for (const style of QR_STYLE_IDS) {
      const parsed = labelConfigSchema.safeParse({ ...base, qrStyle: style });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.qrStyle).toBe(style);
      }
    }

    expect(labelConfigSchema.safeParse({ ...base, qrStyle: 'invalid-style' }).success).toBe(false);
  });
});
