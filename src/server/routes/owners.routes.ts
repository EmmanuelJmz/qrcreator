import crypto from 'crypto';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import { getDb } from '../db/index.ts';
import { labels, ownerDocuments, owners, templates } from '../db/schema.ts';
import { validateLabelGeometry } from '../../lib/qr-geometry.ts';
import { normalizeEmergencyProfile } from '../../lib/emergency-profile.ts';
import { normalizeOwnerCardOverride } from '../../lib/public-card-theme.ts';
import { normalizeQrStyle } from '../../lib/qr-styled.ts';
import { requireAdmin } from '../middleware/auth.middleware.ts';
import {
  documentVisibilitySchema,
  emergencyProfileSchema,
  labelConfigSchema,
  ownerCardThemeOverrideSchema,
  ownerInfoSchema,
  ownerStatusSchema,
  uuidParamSchema,
} from '../schemas/index.ts';
import {
  MAX_DOCUMENTS_PER_OWNER,
  MAX_IMAGE_SIZE_BYTES,
  validateUploadedImage,
} from '../services/file-validation.ts';
import { getStorageProvider } from '../services/storage/index.ts';
import {
  buildPublicCardUrl,
  decryptPublicToken,
  encryptPublicToken,
  generatePublicToken,
  hashPublicToken,
} from '../services/token.service.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: MAX_DOCUMENTS_PER_OWNER,
  },
});

export const ownersRouter = Router();
ownersRouter.use(requireAdmin);

function getRequestOrigin(req: { protocol: string; get(name: string): string | undefined }): string {
  const host = req.get('host');
  return host ? `${req.protocol}://${host}` : '';
}

function safeDecryptToken(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    return decryptPublicToken(encrypted);
  } catch {
    return null;
  }
}

function toIso(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : String(val);
}

ownersRouter.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const statusParam =
      req.query.status === 'active' || req.query.status === 'inactive'
        ? req.query.status
        : 'all';

    const conditions = [];
    if (q.length > 0) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          ilike(owners.firstName, pattern),
          ilike(owners.lastName, pattern),
          ilike(sql`${owners.firstName} || ' ' || ${owners.lastName}`, pattern),
          ilike(sql`COALESCE(${owners.email}, '')`, pattern),
          ilike(sql`COALESCE(${owners.phone}, '')`, pattern),
        ),
      );
    }
    if (statusParam === 'active') {
      conditions.push(eq(owners.status, true));
    } else if (statusParam === 'inactive') {
      conditions.push(eq(owners.status, false));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, statsRows] = await Promise.all([
      db
        .select({
          id: owners.id,
          firstName: owners.firstName,
          lastName: owners.lastName,
          email: owners.email,
          phone: owners.phone,
          status: owners.status,
          encryptedPublicToken: owners.encryptedPublicToken,
          tokenVersion: owners.tokenVersion,
          scanCount: owners.scanCount,
          lastScannedAt: owners.lastScannedAt,
          cardThemeOverride: owners.cardThemeOverride,
          emergencyProfile: owners.emergencyProfile,
          createdAt: owners.createdAt,
          updatedAt: owners.updatedAt,
          documentCount: sql<number>`(SELECT COUNT(*)::int FROM owner_documents d WHERE d.owner_id = ${owners.id})`,
          labelId: labels.id,
          templateId: labels.templateId,
          templateName: templates.name,
        })
        .from(owners)
        .leftJoin(labels, eq(labels.ownerId, owners.id))
        .leftJoin(templates, eq(templates.id, labels.templateId))
        .where(whereClause)
        .orderBy(desc(owners.updatedAt), desc(owners.createdAt)),
      db
        .select({
          totalOwners: sql<number>`COUNT(*)::int`,
          activeOwners: sql<number>`COUNT(*) FILTER (WHERE ${owners.status} = true)::int`,
          inactiveOwners: sql<number>`COUNT(*) FILTER (WHERE ${owners.status} = false)::int`,
          totalScans: sql<number>`COALESCE(SUM(${owners.scanCount}), 0)::int`,
          totalLabels: sql<number>`(SELECT COUNT(*)::int FROM labels)`,
          totalTemplates: sql<number>`(SELECT COUNT(*)::int FROM templates)`,
          totalDocuments: sql<number>`(SELECT COUNT(*)::int FROM owner_documents)`,
        })
        .from(owners),
    ]);

    const s = statsRows[0];
    const stats = {
      totalOwners: Number(s?.totalOwners ?? 0),
      activeOwners: Number(s?.activeOwners ?? 0),
      inactiveOwners: Number(s?.inactiveOwners ?? 0),
      totalScans: Number(s?.totalScans ?? 0),
      totalLabels: Number(s?.totalLabels ?? 0),
      totalTemplates: Number(s?.totalTemplates ?? 0),
      totalDocuments: Number(s?.totalDocuments ?? 0),
    };

    const origin = getRequestOrigin(req);

    res.json({
      owners: rows.map((row) => {
        const active = Boolean(row.status);
        const publicToken = active ? safeDecryptToken(row.encryptedPublicToken) : null;
        return {
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          fullName: `${row.firstName} ${row.lastName}`.trim(),
          email: row.email,
          phone: row.phone,
          status: active,
          documentCount: Number(row.documentCount || 0),
          hasLabel: Boolean(row.labelId),
          templateId: row.templateId,
          templateName: row.templateName,
          tokenVersion: row.tokenVersion,
          scanCount: Number(row.scanCount ?? 0),
          lastScannedAt: row.lastScannedAt ? toIso(row.lastScannedAt) : null,
          hasCustomCardTheme: Boolean(normalizeOwnerCardOverride(row.cardThemeOverride)),
          hasEmergencyProfile: Boolean(normalizeEmergencyProfile(row.emergencyProfile)),
          publicToken,
          publicUrl: publicToken ? buildPublicCardUrl(publicToken, origin) : null,
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        };
      }),
      stats,
    });
  } catch (err) {
    next(err);
  }
});

ownersRouter.get('/:id', async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador de propietario inválido.' });
      return;
    }

    const db = getDb();

    const ownerRows = await db
      .select()
      .from(owners)
      .where(eq(owners.id, idCheck.data))
      .limit(1);

    const owner = ownerRows[0];
    if (!owner) {
      res.status(404).json({ error: 'Propietario no encontrado.' });
      return;
    }

    const docs = await db
      .select({
        id: ownerDocuments.id,
        originalName: ownerDocuments.originalName,
        mimeType: ownerDocuments.mimeType,
        fileSize: ownerDocuments.fileSize,
        isPublic: ownerDocuments.isPublic,
        createdAt: ownerDocuments.createdAt,
      })
      .from(ownerDocuments)
      .where(eq(ownerDocuments.ownerId, owner.id))
      .orderBy(asc(ownerDocuments.createdAt));

    const labelRows = await db
      .select({
        id: labels.id,
        ownerId: labels.ownerId,
        templateId: labels.templateId,
        positionX: labels.positionX,
        positionY: labels.positionY,
        width: labels.width,
        height: labels.height,
        qrStyle: labels.qrStyle,
        createdAt: labels.createdAt,
        updatedAt: labels.updatedAt,
        templateName: templates.name,
        templateWidth: templates.width,
        templateHeight: templates.height,
      })
      .from(labels)
      .innerJoin(templates, eq(templates.id, labels.templateId))
      .where(eq(labels.ownerId, owner.id))
      .limit(1);

    const label = labelRows[0];
    const active = Boolean(owner.status);
    const publicToken = active ? safeDecryptToken(owner.encryptedPublicToken) : null;
    const origin = getRequestOrigin(req);

    res.json({
      owner: {
        id: owner.id,
        firstName: owner.firstName,
        lastName: owner.lastName,
        fullName: `${owner.firstName} ${owner.lastName}`.trim(),
        email: owner.email,
        phone: owner.phone,
        status: active,
        tokenVersion: owner.tokenVersion,
        scanCount: Number(owner.scanCount ?? 0),
        lastScannedAt: owner.lastScannedAt ? toIso(owner.lastScannedAt) : null,
        cardThemeOverride: normalizeOwnerCardOverride(owner.cardThemeOverride),
        emergencyProfile: normalizeEmergencyProfile(owner.emergencyProfile),
        publicToken,
        publicUrl: publicToken ? buildPublicCardUrl(publicToken, origin) : null,
        createdAt: toIso(owner.createdAt),
        updatedAt: toIso(owner.updatedAt),
      },
      documents: docs.map((d) => ({
        id: d.id,
        originalName: d.originalName,
        mimeType: d.mimeType,
        fileSize: Number(d.fileSize),
        isPublic: Boolean(d.isPublic),
        createdAt: toIso(d.createdAt),
      })),
      label: label
        ? {
            id: label.id,
            ownerId: label.ownerId,
            templateId: label.templateId,
            templateName: label.templateName,
            templateWidth: label.templateWidth,
            templateHeight: label.templateHeight,
            x: Number(label.positionX),
            y: Number(label.positionY),
            width: Number(label.width),
            height: Number(label.height),
            qrStyle: normalizeQrStyle(label.qrStyle),
            createdAt: toIso(label.createdAt),
            updatedAt: toIso(label.updatedAt),
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

ownersRouter.post('/', upload.array('documents', MAX_DOCUMENTS_PER_OWNER), async (req, res, next) => {
  const uploadedStorageKeys: string[] = [];

  try {
    const ownerParsed = ownerInfoSchema.safeParse({
      firstName: req.body?.firstName,
      lastName: req.body?.lastName,
      email: req.body?.email ?? '',
      phone: req.body?.phone ?? '',
    });

    if (!ownerParsed.success) {
      res.status(400).json({ error: ownerParsed.error.issues[0]?.message || 'Datos del propietario inválidos.' });
      return;
    }

    let rawLabelPayload: unknown;
    try {
      rawLabelPayload =
        typeof req.body?.label === 'string' ? JSON.parse(req.body.label) : req.body?.label;
    } catch {
      res.status(400).json({ error: 'La configuración de la etiqueta tiene un formato inválido.' });
      return;
    }

    const labelParsed = labelConfigSchema.safeParse(rawLabelPayload);
    if (!labelParsed.success) {
      res.status(400).json({ error: labelParsed.error.issues[0]?.message || 'Configuración de etiqueta inválida.' });
      return;
    }

    let rawCardOverridePayload: unknown = null;
    if (req.body?.cardThemeOverride) {
      try {
        rawCardOverridePayload =
          typeof req.body.cardThemeOverride === 'string'
            ? JSON.parse(req.body.cardThemeOverride)
            : req.body.cardThemeOverride;
      } catch {
        res.status(400).json({ error: 'Personalización de ficha inválida.' });
        return;
      }
    }
    const cardOverrideParsed = ownerCardThemeOverrideSchema.safeParse(rawCardOverridePayload);
    if (!cardOverrideParsed.success) {
      res.status(400).json({
        error: cardOverrideParsed.error.issues[0]?.message || 'Personalización de ficha inválida.',
      });
      return;
    }
    const cardThemeOverride = normalizeOwnerCardOverride(cardOverrideParsed.data);

    let rawEmergencyPayload: unknown = null;
    if (req.body?.emergencyProfile) {
      try {
        rawEmergencyPayload =
          typeof req.body.emergencyProfile === 'string'
            ? JSON.parse(req.body.emergencyProfile)
            : req.body.emergencyProfile;
      } catch {
        res.status(400).json({ error: 'Datos médicos y de emergencia inválidos.' });
        return;
      }
    }
    const emergencyParsed = emergencyProfileSchema.safeParse(rawEmergencyPayload);
    if (!emergencyParsed.success) {
      res.status(400).json({
        error: emergencyParsed.error.issues[0]?.message || 'Datos médicos y de emergencia inválidos.',
      });
      return;
    }
    const emergencyProfile = normalizeEmergencyProfile(emergencyParsed.data);

    const db = getDb();
    const templateRows = await db
      .select({
        id: templates.id,
        width: templates.width,
        height: templates.height,
      })
      .from(templates)
      .where(eq(templates.id, labelParsed.data.templateId))
      .limit(1);

    const template = templateRows[0];
    if (!template) {
      res.status(400).json({ error: 'La plantilla seleccionada no existe.' });
      return;
    }

    const geomCheck = validateLabelGeometry(
      {
        x: labelParsed.data.x,
        y: labelParsed.data.y,
        width: labelParsed.data.width,
        height: labelParsed.data.height,
      },
      template.width,
      template.height,
    );
    if (!geomCheck.valid) {
      res.status(400).json({ error: geomCheck.error });
      return;
    }

    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length > MAX_DOCUMENTS_PER_OWNER) {
      res.status(400).json({ error: 'Cada propietario puede tener un máximo de 5 documentos.' });
      return;
    }

    let visibilities: boolean[] = [];
    if (req.body?.documentVisibilities) {
      try {
        const parsedVis =
          typeof req.body.documentVisibilities === 'string'
            ? JSON.parse(req.body.documentVisibilities)
            : req.body.documentVisibilities;
        if (Array.isArray(parsedVis)) {
          visibilities = parsedVis.map((v) => Boolean(v));
        }
      } catch {
        res.status(400).json({ error: 'Visibilidad de documentos inválida.' });
        return;
      }
    }

    const ownerId = crypto.randomUUID();
    const preparedDocs: Array<{
      id: string;
      originalName: string;
      storageKey: string;
      mimeType: string;
      fileSize: number;
      isPublic: boolean;
    }> = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      let validated;
      try {
        validated = await validateUploadedImage(file.buffer, file.originalname);
      } catch (validationErr) {
        if (uploadedStorageKeys.length > 0) {
          const storage = getStorageProvider();
          for (const key of uploadedStorageKeys) {
            await storage.deleteObject(key).catch(() => undefined);
          }
        }
        res.status(400).json({
          error:
            validationErr instanceof Error
              ? `${file.originalname}: ${validationErr.message}`
              : 'Documento inválido.',
        });
        return;
      }

      const storage = getStorageProvider();
      const docId = crypto.randomUUID();
      const ext = validated.mimeType === 'image/png' ? 'png' : 'jpg';
      const storageKey = `documents/${ownerId}/${docId}.${ext}`;
      await storage.putObject(storageKey, file.buffer, validated.mimeType);
      uploadedStorageKeys.push(storageKey);

      preparedDocs.push({
        id: docId,
        originalName: file.originalname,
        storageKey,
        mimeType: validated.mimeType,
        fileSize: validated.fileSize,
        isPublic: visibilities[i] ?? false,
      });
    }

    const publicToken = generatePublicToken();
    const tokenHash = hashPublicToken(publicToken);
    const encryptedToken = encryptPublicToken(publicToken);
    const now = new Date();
    const labelId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(owners).values({
        id: ownerId,
        firstName: ownerParsed.data.firstName,
        lastName: ownerParsed.data.lastName,
        email: ownerParsed.data.email,
        phone: ownerParsed.data.phone,
        status: true,
        publicTokenHash: tokenHash,
        encryptedPublicToken: encryptedToken,
        tokenVersion: 1,
        cardThemeOverride,
        emergencyProfile,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(labels).values({
        id: labelId,
        ownerId,
        templateId: labelParsed.data.templateId,
        positionX: labelParsed.data.x.toFixed(2),
        positionY: labelParsed.data.y.toFixed(2),
        width: labelParsed.data.width.toFixed(2),
        height: labelParsed.data.height.toFixed(2),
        qrStyle: labelParsed.data.qrStyle,
        createdAt: now,
        updatedAt: now,
      });

      if (preparedDocs.length > 0) {
        await tx.insert(ownerDocuments).values(
          preparedDocs.map((doc) => ({
            id: doc.id,
            ownerId,
            originalName: doc.originalName,
            storageKey: doc.storageKey,
            mimeType: doc.mimeType,
            fileSize: doc.fileSize,
            isPublic: doc.isPublic,
            createdAt: now,
          })),
        );
      }
    });

    const origin = getRequestOrigin(req);
    res.status(201).json({
      owner: {
        id: ownerId,
        firstName: ownerParsed.data.firstName,
        lastName: ownerParsed.data.lastName,
        fullName: `${ownerParsed.data.firstName} ${ownerParsed.data.lastName}`.trim(),
        email: ownerParsed.data.email,
        phone: ownerParsed.data.phone,
        status: true,
        tokenVersion: 1,
        publicToken,
        publicUrl: buildPublicCardUrl(publicToken, origin),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      label: {
        id: labelId,
        ownerId,
        templateId: labelParsed.data.templateId,
        x: labelParsed.data.x,
        y: labelParsed.data.y,
        width: labelParsed.data.width,
        height: labelParsed.data.height,
        qrStyle: labelParsed.data.qrStyle,
      },
      documentCount: preparedDocs.length,
    });
  } catch (err) {
    if (uploadedStorageKeys.length > 0) {
      const storage = getStorageProvider();
      for (const key of uploadedStorageKeys) {
        await storage.deleteObject(key).catch(() => undefined);
      }
    }
    next(err);
  }
});

ownersRouter.put('/:id', async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const parsed = ownerInfoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Datos inválidos.' });
      return;
    }

    let hasOverrideUpdate = false;
    let nextCardOverride = null;
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'cardThemeOverride')) {
      const overrideCheck = ownerCardThemeOverrideSchema.safeParse(req.body.cardThemeOverride);
      if (!overrideCheck.success) {
        res.status(400).json({
          error: overrideCheck.error.issues[0]?.message || 'Personalización de ficha inválida.',
        });
        return;
      }
      hasOverrideUpdate = true;
      nextCardOverride = normalizeOwnerCardOverride(overrideCheck.data);
    }

    let hasEmergencyUpdate = false;
    let nextEmergencyProfile = null;
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'emergencyProfile')) {
      const emergencyCheck = emergencyProfileSchema.safeParse(req.body.emergencyProfile);
      if (!emergencyCheck.success) {
        res.status(400).json({
          error: emergencyCheck.error.issues[0]?.message || 'Datos médicos y de emergencia inválidos.',
        });
        return;
      }
      hasEmergencyUpdate = true;
      nextEmergencyProfile = normalizeEmergencyProfile(emergencyCheck.data);
    }

    const db = getDb();
    const existingRows = await db
      .select({
        id: owners.id,
        cardThemeOverride: owners.cardThemeOverride,
        emergencyProfile: owners.emergencyProfile,
      })
      .from(owners)
      .where(eq(owners.id, idCheck.data))
      .limit(1);

    if (!existingRows[0]) {
      res.status(404).json({ error: 'Propietario no encontrado.' });
      return;
    }

    const now = new Date();
    // RN-012: Updating personal data NEVER alters the existing public token
    await db
      .update(owners)
      .set({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        ...(hasOverrideUpdate ? { cardThemeOverride: nextCardOverride } : {}),
        ...(hasEmergencyUpdate ? { emergencyProfile: nextEmergencyProfile } : {}),
        updatedAt: now,
      })
      .where(eq(owners.id, idCheck.data));

    res.json({
      owner: {
        id: idCheck.data,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        fullName: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
        email: parsed.data.email,
        phone: parsed.data.phone,
        cardThemeOverride: hasOverrideUpdate
          ? nextCardOverride
          : normalizeOwnerCardOverride(existingRows[0].cardThemeOverride),
        emergencyProfile: hasEmergencyUpdate
          ? nextEmergencyProfile
          : normalizeEmergencyProfile(existingRows[0].emergencyProfile),
        updatedAt: now.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

ownersRouter.put('/:id/card-theme', async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const overrideCheck = ownerCardThemeOverrideSchema.safeParse(req.body);
    if (!overrideCheck.success) {
      res.status(400).json({
        error: overrideCheck.error.issues[0]?.message || 'Personalización de ficha inválida.',
      });
      return;
    }

    const db = getDb();
    const existingRows = await db
      .select({ id: owners.id })
      .from(owners)
      .where(eq(owners.id, idCheck.data))
      .limit(1);

    if (!existingRows[0]) {
      res.status(404).json({ error: 'Propietario no encontrado.' });
      return;
    }

    const normalized = normalizeOwnerCardOverride(overrideCheck.data);
    const now = new Date();
    await db
      .update(owners)
      .set({
        cardThemeOverride: normalized,
        updatedAt: now,
      })
      .where(eq(owners.id, idCheck.data));

    res.json({
      cardThemeOverride: normalized,
      hasCustomCardTheme: Boolean(normalized),
    });
  } catch (err) {
    next(err);
  }
});

ownersRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const parsed = ownerStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Estado inválido.' });
      return;
    }

    const db = getDb();
    const existingRows = await db
      .select({
        id: owners.id,
        status: owners.status,
        tokenVersion: owners.tokenVersion,
        encryptedPublicToken: owners.encryptedPublicToken,
      })
      .from(owners)
      .where(eq(owners.id, idCheck.data))
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      res.status(404).json({ error: 'Propietario no encontrado.' });
      return;
    }

    const now = new Date();
    const origin = getRequestOrigin(req);

    if (!parsed.data.status) {
      // RN-010: Deactivation revokes the previous token immediately
      await db
        .update(owners)
        .set({
          status: false,
          publicTokenHash: null,
          encryptedPublicToken: null,
          updatedAt: now,
        })
        .where(eq(owners.id, idCheck.data));

      res.json({
        status: false,
        tokenVersion: existing.tokenVersion,
        publicToken: null,
        publicUrl: null,
      });
      return;
    }

    // If already active, preserve existing token when decryptable
    if (existing.status) {
      const currentToken = safeDecryptToken(existing.encryptedPublicToken);
      if (currentToken) {
        res.json({
          status: true,
          tokenVersion: existing.tokenVersion,
          publicToken: currentToken,
          publicUrl: buildPublicCardUrl(currentToken, origin),
        });
        return;
      }
    }

    // RN-011: Reactivation generates a brand new token and increments version
    const newToken = generatePublicToken();
    const newHash = hashPublicToken(newToken);
    const newEncrypted = encryptPublicToken(newToken);
    const nextVersion = !existing.status ? existing.tokenVersion + 1 : existing.tokenVersion;

    await db
      .update(owners)
      .set({
        status: true,
        publicTokenHash: newHash,
        encryptedPublicToken: newEncrypted,
        tokenVersion: nextVersion,
        updatedAt: now,
      })
      .where(eq(owners.id, idCheck.data));

    res.json({
      status: true,
      tokenVersion: nextVersion,
      publicToken: newToken,
      publicUrl: buildPublicCardUrl(newToken, origin),
    });
  } catch (err) {
    next(err);
  }
});

ownersRouter.get('/:id/documents', async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const db = getDb();
    const existsRows = await db
      .select({ id: owners.id })
      .from(owners)
      .where(eq(owners.id, idCheck.data))
      .limit(1);

    if (!existsRows[0]) {
      res.status(404).json({ error: 'Propietario no encontrado.' });
      return;
    }

    const rows = await db
      .select({
        id: ownerDocuments.id,
        originalName: ownerDocuments.originalName,
        mimeType: ownerDocuments.mimeType,
        fileSize: ownerDocuments.fileSize,
        isPublic: ownerDocuments.isPublic,
        createdAt: ownerDocuments.createdAt,
      })
      .from(ownerDocuments)
      .where(eq(ownerDocuments.ownerId, idCheck.data))
      .orderBy(asc(ownerDocuments.createdAt));

    res.json({
      documents: rows.map((d) => ({
        id: d.id,
        originalName: d.originalName,
        mimeType: d.mimeType,
        fileSize: Number(d.fileSize),
        isPublic: Boolean(d.isPublic),
        createdAt: toIso(d.createdAt),
      })),
    });
  } catch (err) {
    next(err);
  }
});

ownersRouter.post(
  '/:id/documents',
  upload.array('documents', MAX_DOCUMENTS_PER_OWNER),
  async (req, res, next) => {
    const uploadedKeys: string[] = [];

    try {
      const idCheck = uuidParamSchema.safeParse(req.params.id);
      if (!idCheck.success) {
        res.status(400).json({ error: 'Identificador inválido.' });
        return;
      }

        const db = getDb();
      const ownerRows = await db
        .select({ id: owners.id })
        .from(owners)
        .where(eq(owners.id, idCheck.data))
        .limit(1);

      if (!ownerRows[0]) {
        res.status(404).json({ error: 'Propietario no encontrado.' });
        return;
      }

      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({ error: 'Debes seleccionar al menos un documento.' });
        return;
      }

      const countRows = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(ownerDocuments)
        .where(eq(ownerDocuments.ownerId, idCheck.data));

      const currentTotal = countRows[0]?.total || 0;
      if (currentTotal + files.length > MAX_DOCUMENTS_PER_OWNER) {
        res.status(400).json({
          error: `Límite excedido: cada propietario puede tener máximo ${MAX_DOCUMENTS_PER_OWNER} documentos (actualmente tiene ${currentTotal}).`,
        });
        return;
      }

      const isPublicDefault = req.body?.isPublic === 'true' || req.body?.isPublic === true;
      const now = new Date();
      const inserted: Array<{
        id: string;
        originalName: string;
        storageKey: string;
        mimeType: string;
        fileSize: number;
        isPublic: boolean;
        createdAt: string;
      }> = [];

      for (const file of files) {
        let validated;
        try {
          validated = await validateUploadedImage(file.buffer, file.originalname);
        } catch (validationErr) {
          if (uploadedKeys.length > 0) {
            const storage = getStorageProvider();
            for (const key of uploadedKeys) {
              await storage.deleteObject(key).catch(() => undefined);
            }
          }
          res.status(400).json({
            error:
              validationErr instanceof Error
                ? `${file.originalname}: ${validationErr.message}`
                : 'Documento inválido.',
          });
          return;
        }

        const docId = crypto.randomUUID();
        const ext = validated.mimeType === 'image/png' ? 'png' : 'jpg';
        const storageKey = `documents/${idCheck.data}/${docId}.${ext}`;
        await getStorageProvider().putObject(storageKey, file.buffer, validated.mimeType);
        uploadedKeys.push(storageKey);

        inserted.push({
          id: docId,
          originalName: file.originalname,
          storageKey,
          mimeType: validated.mimeType,
          fileSize: validated.fileSize,
          isPublic: isPublicDefault,
          createdAt: now.toISOString(),
        });
      }

      await db.transaction(async (tx) => {
        await tx.insert(ownerDocuments).values(
          inserted.map((doc) => ({
            id: doc.id,
            ownerId: idCheck.data,
            originalName: doc.originalName,
            storageKey: doc.storageKey,
            mimeType: doc.mimeType,
            fileSize: doc.fileSize,
            isPublic: doc.isPublic,
            createdAt: now,
          })),
        );
      });

      res.status(201).json({
        documents: inserted.map(({ storageKey: _storageKey, ...rest }) => rest),
      });
    } catch (err) {
      if (uploadedKeys.length > 0) {
        const storage = getStorageProvider();
        for (const key of uploadedKeys) {
          await storage.deleteObject(key).catch(() => undefined);
        }
      }
      next(err);
    }
  },
);

export const documentsAdminRouter = Router();
documentsAdminRouter.use(requireAdmin);

documentsAdminRouter.patch('/:id/visibility', async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador de documento inválido.' });
      return;
    }

    const parsed = documentVisibilitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Visibilidad inválida.' });
      return;
    }

    const db = getDb();
    const docRows = await db
      .select({ id: ownerDocuments.id })
      .from(ownerDocuments)
      .where(eq(ownerDocuments.id, idCheck.data))
      .limit(1);

    if (!docRows[0]) {
      res.status(404).json({ error: 'Documento no encontrado.' });
      return;
    }

    await db
      .update(ownerDocuments)
      .set({ isPublic: parsed.data.isPublic })
      .where(eq(ownerDocuments.id, idCheck.data));

    res.json({ id: idCheck.data, isPublic: parsed.data.isPublic });
  } catch (err) {
    next(err);
  }
});

documentsAdminRouter.delete('/:id', async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const db = getDb();
    const docRows = await db
      .select({ id: ownerDocuments.id, storageKey: ownerDocuments.storageKey })
      .from(ownerDocuments)
      .where(eq(ownerDocuments.id, idCheck.data))
      .limit(1);

    const doc = docRows[0];
    if (!doc) {
      res.status(404).json({ error: 'Documento no encontrado.' });
      return;
    }

    await db.delete(ownerDocuments).where(eq(ownerDocuments.id, idCheck.data));
    await getStorageProvider().deleteObject(doc.storageKey);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

documentsAdminRouter.get('/:id/preview', async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const db = getDb();
    const docRows = await db
      .select({ storageKey: ownerDocuments.storageKey, mimeType: ownerDocuments.mimeType })
      .from(ownerDocuments)
      .where(eq(ownerDocuments.id, idCheck.data))
      .limit(1);

    const doc = docRows[0];
    if (!doc) {
      res.status(404).json({ error: 'Documento no encontrado.' });
      return;
    }

    const buffer = await getStorageProvider().getObject(doc.storageKey);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
