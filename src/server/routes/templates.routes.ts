import crypto from 'crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import { getDb } from '../db/index.ts';
import { labels, templates } from '../db/schema.ts';
import {
  installCircularTemplatesPack,
  seedStarterTemplatesIfEmpty,
} from '../db/seed.ts';
import { requireAdmin } from '../middleware/auth.middleware.ts';
import { templateCreateSchema, uuidParamSchema } from '../schemas/index.ts';
import {
  MAX_IMAGE_SIZE_BYTES,
  validateUploadedImage,
} from '../services/file-validation.ts';
import { getStorageProvider } from '../services/storage/index.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 1 },
});

export const templatesRouter = Router();
templatesRouter.use(requireAdmin);

templatesRouter.get('/', async (_req, res, next) => {
  try {
    await seedStarterTemplatesIfEmpty();

    const db = getDb();
    const rows = await db
      .select({
        id: templates.id,
        name: templates.name,
        originalName: templates.originalName,
        mimeType: templates.mimeType,
        width: templates.width,
        height: templates.height,
        createdAt: templates.createdAt,
        usageCount: sql<number>`count(${labels.id})::int`,
      })
      .from(templates)
      .leftJoin(labels, eq(labels.templateId, templates.id))
      .groupBy(templates.id)
      .orderBy(desc(templates.createdAt));

    res.json({
      templates: rows.map((row) => ({
        id: row.id,
        name: row.name,
        originalName: row.originalName,
        mimeType: row.mimeType,
        width: row.width,
        height: row.height,
        usageCount: Number(row.usageCount || 0),
        inUse: Number(row.usageCount || 0) > 0,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      })),
    });
  } catch (err) {
    next(err);
  }
});

templatesRouter.post('/circular-pack', async (_req, res, next) => {
  try {
    const result = await installCircularTemplatesPack();
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

templatesRouter.get('/:id', async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador de plantilla inválido.' });
      return;
    }

    const db = getDb();
    const rows = await db
      .select({
        id: templates.id,
        name: templates.name,
        originalName: templates.originalName,
        mimeType: templates.mimeType,
        width: templates.width,
        height: templates.height,
        createdAt: templates.createdAt,
        usageCount: sql<number>`count(${labels.id})::int`,
      })
      .from(templates)
      .leftJoin(labels, eq(labels.templateId, templates.id))
      .where(eq(templates.id, idCheck.data))
      .groupBy(templates.id)
      .limit(1);

    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: 'Plantilla no encontrada.' });
      return;
    }

    res.json({
      template: {
        id: row.id,
        name: row.name,
        originalName: row.originalName,
        mimeType: row.mimeType,
        width: row.width,
        height: row.height,
        usageCount: Number(row.usageCount || 0),
        inUse: Number(row.usageCount || 0) > 0,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      },
    });
  } catch (err) {
    next(err);
  }
});

templatesRouter.get('/:id/image', async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const db = getDb();
    const rows = await db
      .select({
        storageKey: templates.storageKey,
        mimeType: templates.mimeType,
      })
      .from(templates)
      .where(eq(templates.id, idCheck.data))
      .limit(1);

    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: 'Plantilla no encontrada.' });
      return;
    }

    const buffer = await getStorageProvider().getObject(row.storageKey);
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

templatesRouter.post('/', upload.single('image'), async (req, res, next) => {
  let savedStorageKey: string | null = null;

  try {
    const parsed = templateCreateSchema.safeParse({ name: req.body?.name });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Nombre inválido.' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Debes seleccionar una imagen JPG o PNG para la plantilla.' });
      return;
    }

    let validated;
    try {
      validated = await validateUploadedImage(req.file.buffer, req.file.originalname);
    } catch (validationErr) {
      res.status(400).json({
        error: validationErr instanceof Error ? validationErr.message : 'Imagen no válida.',
      });
      return;
    }

    const storage = getStorageProvider();
    const id = crypto.randomUUID();
    const ext = validated.mimeType === 'image/png' ? 'png' : 'jpg';
    const storageKey = `templates/${id}.${ext}`;

    await storage.putObject(storageKey, req.file.buffer, validated.mimeType);
    savedStorageKey = storageKey;

    const now = new Date();
    const db = getDb();
    await db.insert(templates).values({
      id,
      name: parsed.data.name,
      originalName: req.file.originalname,
      storageKey,
      mimeType: validated.mimeType,
      width: validated.width,
      height: validated.height,
      createdAt: now,
    });

    res.status(201).json({
      template: {
        id,
        name: parsed.data.name,
        originalName: req.file.originalname,
        mimeType: validated.mimeType,
        width: validated.width,
        height: validated.height,
        usageCount: 0,
        inUse: false,
        createdAt: now.toISOString(),
      },
    });
  } catch (err) {
    if (savedStorageKey) {
      await getStorageProvider().deleteObject(savedStorageKey).catch(() => undefined);
    }
    next(err);
  }
});

templatesRouter.delete('/:id', async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const db = getDb();
    const tplRows = await db
      .select({ id: templates.id, storageKey: templates.storageKey })
      .from(templates)
      .where(eq(templates.id, idCheck.data))
      .limit(1);

    const tpl = tplRows[0];
    if (!tpl) {
      res.status(404).json({ error: 'Plantilla no encontrada.' });
      return;
    }

    const usageRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(labels)
      .where(eq(labels.templateId, idCheck.data));

    if ((usageRows[0]?.total || 0) > 0) {
      res.status(409).json({
        error: 'No se puede eliminar esta plantilla porque está asociada a una o más etiquetas.',
      });
      return;
    }

    await db.delete(templates).where(eq(templates.id, idCheck.data));
    await getStorageProvider().deleteObject(tpl.storageKey);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
