import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import {
  DEFAULT_PUBLIC_CARD_THEME,
  normalizePublicCardTheme,
  type PublicCardTheme,
} from '../../lib/public-card-theme.ts';
import { getDb } from '../db/index.ts';
import { publicCardSettings } from '../db/schema.ts';
import { requireAdmin } from '../middleware/auth.middleware.ts';
import { publicCardThemeSchema } from '../schemas/index.ts';
import { validateUploadedImage } from '../services/file-validation.ts';
import { getStorageProvider } from '../services/storage/index.ts';

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_SIZE_BYTES, files: 1 },
});

export const cardThemeRouter = Router();
cardThemeRouter.use(requireAdmin);

function isMissingRelationError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  const message = (err as { message?: string }).message || '';
  return code === '42P01' || message.includes('public_card_settings');
}

function buildLogoVersion(updatedAt: Date | string | null | undefined): string | null {
  if (!updatedAt) return null;
  const dt = updatedAt instanceof Date ? updatedAt : new Date(String(updatedAt));
  return Number.isNaN(dt.getTime()) ? null : String(dt.getTime());
}

cardThemeRouter.get('/', async (_req, res, next) => {
  try {
    const db = getDb();
    let row:
      | {
          theme: PublicCardTheme;
          logoStorageKey: string | null;
          updatedAt: Date;
        }
      | undefined;
    let migrationPending = false;

    try {
      const rows = await db
        .select({
          theme: publicCardSettings.theme,
          logoStorageKey: publicCardSettings.logoStorageKey,
          updatedAt: publicCardSettings.updatedAt,
        })
        .from(publicCardSettings)
        .where(eq(publicCardSettings.id, 1))
        .limit(1);
      row = rows[0];
    } catch (err) {
      if (isMissingRelationError(err)) {
        migrationPending = true;
      } else {
        throw err;
      }
    }

    const theme = normalizePublicCardTheme({
      ...(row?.theme ?? DEFAULT_PUBLIC_CARD_THEME),
      hasCustomLogo: Boolean(row?.logoStorageKey),
    });

    const version = buildLogoVersion(row?.updatedAt);
    res.json({
      theme,
      logoUrl: row?.logoStorageKey
        ? `/api/v1/public/theme-logo${version ? `?v=${version}` : ''}`
        : null,
      migrationPending,
    });
  } catch (err) {
    next(err);
  }
});

cardThemeRouter.put('/', async (req, res, next) => {
  try {
    const parsed = publicCardThemeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Configuración visual inválida.',
      });
      return;
    }

    const db = getDb();
    const now = new Date();

    let existingLogoKey: string | null = null;
    try {
      const existing = await db
        .select({ logoStorageKey: publicCardSettings.logoStorageKey })
        .from(publicCardSettings)
        .where(eq(publicCardSettings.id, 1))
        .limit(1);
      existingLogoKey = existing[0]?.logoStorageKey ?? null;
    } catch (err) {
      if (isMissingRelationError(err)) {
        res.status(503).json({
          error:
            'Falta crear la tabla public_card_settings en Neon PostgreSQL. Ejecuta la migración SQL indicada primero.',
        });
        return;
      }
      throw err;
    }

    const normalizedTheme = normalizePublicCardTheme({
      ...parsed.data,
      hasCustomLogo: Boolean(existingLogoKey),
    });

    await db
      .insert(publicCardSettings)
      .values({
        id: 1,
        theme: normalizedTheme,
        logoStorageKey: existingLogoKey,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: publicCardSettings.id,
        set: {
          theme: normalizedTheme,
          updatedAt: now,
        },
      });

    const version = String(now.getTime());
    res.json({
      theme: normalizedTheme,
      logoUrl: existingLogoKey ? `/api/v1/public/theme-logo?v=${version}` : null,
    });
  } catch (err) {
    next(err);
  }
});

cardThemeRouter.post('/logo', upload.single('logo'), async (req, res, next) => {
  let uploadedKey: string | null = null;

  try {
    if (!req.file) {
      res.status(400).json({ error: 'Debes seleccionar una imagen JPG o PNG para el logo.' });
      return;
    }

    let validated;
    try {
      validated = await validateUploadedImage(req.file.buffer, req.file.originalname);
    } catch (validationErr) {
      res.status(400).json({
        error:
          validationErr instanceof Error ? validationErr.message : 'Imagen de logo inválida.',
      });
      return;
    }

    const db = getDb();
    let existingRow:
      | {
          theme: PublicCardTheme;
          logoStorageKey: string | null;
        }
      | undefined;

    try {
      const existing = await db
        .select({
          theme: publicCardSettings.theme,
          logoStorageKey: publicCardSettings.logoStorageKey,
        })
        .from(publicCardSettings)
        .where(eq(publicCardSettings.id, 1))
        .limit(1);
      existingRow = existing[0];
    } catch (err) {
      if (isMissingRelationError(err)) {
        res.status(503).json({
          error:
            'Falta crear la tabla public_card_settings en Neon PostgreSQL. Ejecuta la migración SQL indicada primero.',
        });
        return;
      }
      throw err;
    }

    const storage = getStorageProvider();
    const ext = validated.mimeType === 'image/png' ? 'png' : 'jpg';
    const newKey = `branding/card-logo-${crypto.randomUUID()}.${ext}`;
    await storage.putObject(newKey, req.file.buffer, validated.mimeType);
    uploadedKey = newKey;

    const now = new Date();
    const nextTheme = normalizePublicCardTheme({
      ...(existingRow?.theme ?? DEFAULT_PUBLIC_CARD_THEME),
      logoVisible: true,
      hasCustomLogo: true,
    });

    await db
      .insert(publicCardSettings)
      .values({
        id: 1,
        theme: nextTheme,
        logoStorageKey: newKey,
        logoMimeType: validated.mimeType,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: publicCardSettings.id,
        set: {
          theme: nextTheme,
          logoStorageKey: newKey,
          logoMimeType: validated.mimeType,
          updatedAt: now,
        },
      });

    if (existingRow?.logoStorageKey && existingRow.logoStorageKey !== newKey) {
      await storage.deleteObject(existingRow.logoStorageKey).catch(() => undefined);
    }

    res.json({
      theme: nextTheme,
      logoUrl: `/api/v1/public/theme-logo?v=${now.getTime()}`,
    });
  } catch (err) {
    if (uploadedKey) {
      await getStorageProvider().deleteObject(uploadedKey).catch(() => undefined);
    }
    next(err);
  }
});

cardThemeRouter.delete('/logo', async (_req, res, next) => {
  try {
    const db = getDb();
    let existingRow:
      | {
          theme: PublicCardTheme;
          logoStorageKey: string | null;
        }
      | undefined;

    try {
      const existing = await db
        .select({
          theme: publicCardSettings.theme,
          logoStorageKey: publicCardSettings.logoStorageKey,
        })
        .from(publicCardSettings)
        .where(eq(publicCardSettings.id, 1))
        .limit(1);
      existingRow = existing[0];
    } catch (err) {
      if (isMissingRelationError(err)) {
        res.json({
          theme: DEFAULT_PUBLIC_CARD_THEME,
          logoUrl: null,
        });
        return;
      }
      throw err;
    }

    const now = new Date();
    const nextTheme = normalizePublicCardTheme({
      ...(existingRow?.theme ?? DEFAULT_PUBLIC_CARD_THEME),
      hasCustomLogo: false,
    });

    await db
      .insert(publicCardSettings)
      .values({
        id: 1,
        theme: nextTheme,
        logoStorageKey: null,
        logoMimeType: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: publicCardSettings.id,
        set: {
          theme: nextTheme,
          logoStorageKey: null,
          logoMimeType: null,
          updatedAt: now,
        },
      });

    if (existingRow?.logoStorageKey) {
      await getStorageProvider().deleteObject(existingRow.logoStorageKey).catch(() => undefined);
    }

    res.json({
      theme: nextTheme,
      logoUrl: null,
    });
  } catch (err) {
    next(err);
  }
});
