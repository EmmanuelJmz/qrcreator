import crypto from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { getDb } from '../db/index.ts';
import { labels, owners, templates } from '../db/schema.ts';
import { validateLabelGeometry } from '../../lib/qr-geometry.ts';
import { normalizeQrStyle } from '../../lib/qr-styled.ts';
import { requireAdmin } from '../middleware/auth.middleware.ts';
import { labelConfigSchema, printSheetSchema, uuidParamSchema } from '../schemas/index.ts';
import {
  composeFinalLabelPng,
  composePrintSheetPdf,
  composePrintSheetPng,
  generateQrSvg,
} from '../services/label-render.service.ts';
import { getStorageProvider } from '../services/storage/index.ts';
import {
  buildPublicCardUrl,
  decryptPublicToken,
} from '../services/token.service.ts';

export const labelsRouter = Router();

function getRequestOrigin(req: { protocol: string; get(name: string): string | undefined }): string {
  const host = req.get('host');
  return host ? `${req.protocol}://${host}` : '';
}

function toIso(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : String(val);
}

labelsRouter.get('/owners/:id/label', requireAdmin, async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const db = getDb();

    const ownerRows = await db
      .select({
        id: owners.id,
        firstName: owners.firstName,
        lastName: owners.lastName,
        status: owners.status,
        encryptedPublicToken: owners.encryptedPublicToken,
        tokenVersion: owners.tokenVersion,
      })
      .from(owners)
      .where(eq(owners.id, idCheck.data))
      .limit(1);

    const owner = ownerRows[0];
    if (!owner) {
      res.status(404).json({ error: 'Propietario no encontrado.' });
      return;
    }

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

    let publicToken: string | null = null;
    if (owner.status && owner.encryptedPublicToken) {
      try {
        publicToken = decryptPublicToken(owner.encryptedPublicToken);
      } catch {
        publicToken = null;
      }
    }

    const origin = getRequestOrigin(req);

    res.json({
      owner: {
        id: owner.id,
        fullName: `${owner.firstName} ${owner.lastName}`.trim(),
        status: Boolean(owner.status),
        tokenVersion: owner.tokenVersion,
        publicUrl: publicToken ? buildPublicCardUrl(publicToken, origin) : null,
      },
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

labelsRouter.get('/owners/:id/label/qr', requireAdmin, async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const db = getDb();
    const ownerRows = await db
      .select({
        status: owners.status,
        encryptedPublicToken: owners.encryptedPublicToken,
      })
      .from(owners)
      .where(eq(owners.id, idCheck.data))
      .limit(1);

    const owner = ownerRows[0];
    if (!owner) {
      res.status(404).json({ error: 'Propietario no encontrado.' });
      return;
    }

    if (!owner.status || !owner.encryptedPublicToken) {
      res.status(409).json({
        error: 'El propietario está inactivo. Reactívalo para generar un código QR vigente.',
      });
      return;
    }

    const queryStyle =
      typeof req.query.style === 'string' ? normalizeQrStyle(req.query.style) : null;
    let resolvedStyle = queryStyle;
    if (!resolvedStyle) {
      const labelStyleRows = await db
        .select({ qrStyle: labels.qrStyle })
        .from(labels)
        .where(eq(labels.ownerId, idCheck.data))
        .limit(1);
      resolvedStyle = normalizeQrStyle(labelStyleRows[0]?.qrStyle);
    }

    const token = decryptPublicToken(owner.encryptedPublicToken);
    const publicUrl = buildPublicCardUrl(token, getRequestOrigin(req));
    const svg = await generateQrSvg(publicUrl, resolvedStyle);

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(svg);
  } catch (err) {
    next(err);
  }
});

labelsRouter.put('/owners/:id/label', requireAdmin, async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const parsed = labelConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Configuración de etiqueta inválida.' });
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

    const templateRows = await db
      .select({
        id: templates.id,
        name: templates.name,
        width: templates.width,
        height: templates.height,
      })
      .from(templates)
      .where(eq(templates.id, parsed.data.templateId))
      .limit(1);

    const template = templateRows[0];
    if (!template) {
      res.status(404).json({ error: 'La plantilla seleccionada no existe.' });
      return;
    }

    const geomCheck = validateLabelGeometry(
      {
        x: parsed.data.x,
        y: parsed.data.y,
        width: parsed.data.width,
        height: parsed.data.height,
      },
      template.width,
      template.height,
    );
    if (!geomCheck.valid) {
      res.status(400).json({ error: geomCheck.error });
      return;
    }

    const existingRows = await db
      .select({ id: labels.id, createdAt: labels.createdAt })
      .from(labels)
      .where(eq(labels.ownerId, idCheck.data))
      .limit(1);

    const existingLabel = existingRows[0];
    const now = new Date();

    if (existingLabel) {
      await db
        .update(labels)
        .set({
          templateId: parsed.data.templateId,
          positionX: parsed.data.x.toFixed(2),
          positionY: parsed.data.y.toFixed(2),
          width: parsed.data.width.toFixed(2),
          height: parsed.data.height.toFixed(2),
          qrStyle: parsed.data.qrStyle,
          updatedAt: now,
        })
        .where(eq(labels.ownerId, idCheck.data));

      res.json({
        label: {
          id: existingLabel.id,
          ownerId: idCheck.data,
          templateId: template.id,
          templateName: template.name,
          templateWidth: template.width,
          templateHeight: template.height,
          x: parsed.data.x,
          y: parsed.data.y,
          width: parsed.data.width,
          height: parsed.data.height,
          qrStyle: parsed.data.qrStyle,
          createdAt: toIso(existingLabel.createdAt),
          updatedAt: now.toISOString(),
        },
      });
      return;
    }

    const labelId = crypto.randomUUID();
    await db.insert(labels).values({
      id: labelId,
      ownerId: idCheck.data,
      templateId: parsed.data.templateId,
      positionX: parsed.data.x.toFixed(2),
      positionY: parsed.data.y.toFixed(2),
      width: parsed.data.width.toFixed(2),
      height: parsed.data.height.toFixed(2),
      qrStyle: parsed.data.qrStyle,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({
      label: {
        id: labelId,
        ownerId: idCheck.data,
        templateId: template.id,
        templateName: template.name,
        templateWidth: template.width,
        templateHeight: template.height,
        x: parsed.data.x,
        y: parsed.data.y,
        width: parsed.data.width,
        height: parsed.data.height,
        qrStyle: parsed.data.qrStyle,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

labelsRouter.post('/owners/:id/label/render', requireAdmin, async (req, res, next) => {
  try {
    const idCheck = uuidParamSchema.safeParse(req.params.id);
    if (!idCheck.success) {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const db = getDb();
    const rows = await db
      .select({
        firstName: owners.firstName,
        lastName: owners.lastName,
        status: owners.status,
        encryptedPublicToken: owners.encryptedPublicToken,
        positionX: labels.positionX,
        positionY: labels.positionY,
        width: labels.width,
        qrStyle: labels.qrStyle,
        templateStorageKey: templates.storageKey,
        templateWidth: templates.width,
        templateHeight: templates.height,
      })
      .from(owners)
      .innerJoin(labels, eq(labels.ownerId, owners.id))
      .innerJoin(templates, eq(templates.id, labels.templateId))
      .where(eq(owners.id, idCheck.data))
      .limit(1);

    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: 'Etiqueta o propietario no encontrado.' });
      return;
    }

    if (!row.status || !row.encryptedPublicToken) {
      res.status(409).json({
        error: 'No se puede generar la etiqueta de un propietario inactivo.',
      });
      return;
    }

    const token = decryptPublicToken(row.encryptedPublicToken);
    const publicUrl = buildPublicCardUrl(token, getRequestOrigin(req));

    const pngBuffer = await composeFinalLabelPng({
      templateStorageKey: row.templateStorageKey,
      templateWidth: row.templateWidth,
      templateHeight: row.templateHeight,
      positionX: Number(row.positionX),
      positionY: Number(row.positionY),
      widthPct: Number(row.width),
      publicUrl,
      qrStyle: normalizeQrStyle(row.qrStyle),
    });

    const safeSlug =
      `${row.firstName}-${row.lastName}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'propietario';

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="etiqueta-${safeSlug}.png"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pngBuffer);
  } catch (err) {
    next(err);
  }
});

labelsRouter.post('/labels/print-sheet', requireAdmin, async (req, res, next) => {
  try {
    const parsed = printSheetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Parámetros inválidos para la hoja de impresión.',
      });
      return;
    }

    const uniqueOwnerIds = Array.from(new Set(parsed.data.ownerIds));
    const db = getDb();

    const rows = await db
      .select({
        ownerId: owners.id,
        firstName: owners.firstName,
        lastName: owners.lastName,
        status: owners.status,
        encryptedPublicToken: owners.encryptedPublicToken,
        positionX: labels.positionX,
        positionY: labels.positionY,
        width: labels.width,
        qrStyle: labels.qrStyle,
        templateStorageKey: templates.storageKey,
        templateWidth: templates.width,
        templateHeight: templates.height,
      })
      .from(owners)
      .innerJoin(labels, eq(labels.ownerId, owners.id))
      .innerJoin(templates, eq(templates.id, labels.templateId))
      .where(inArray(owners.id, uniqueOwnerIds));

    const rowMap = new Map(rows.map((r) => [r.ownerId, r]));
    const orderedRows = uniqueOwnerIds
      .map((id) => rowMap.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    if (orderedRows.length === 0) {
      res.status(404).json({ error: 'Ninguno de los propietarios seleccionados tiene etiqueta configurada.' });
      return;
    }

    const eligibleRows = orderedRows.filter((r) => r.status && r.encryptedPublicToken);
    if (eligibleRows.length === 0) {
      res.status(409).json({
        error: 'Los propietarios seleccionados están inactivos o no tienen código QR vigente.',
      });
      return;
    }

    const storage = getStorageProvider();
    const uniqueTemplateKeys = Array.from(new Set(eligibleRows.map((r) => r.templateStorageKey)));
    const templateCache = new Map<string, Buffer>();
    await Promise.all(
      uniqueTemplateKeys.map(async (key) => {
        templateCache.set(key, await storage.getObject(key));
      }),
    );

    const origin = getRequestOrigin(req);
    const items = eligibleRows.map((row) => {
      const token = decryptPublicToken(row.encryptedPublicToken!);
      return {
        ownerId: row.ownerId,
        templateStorageKey: row.templateStorageKey,
        templateWidth: row.templateWidth,
        templateHeight: row.templateHeight,
        positionX: Number(row.positionX),
        positionY: Number(row.positionY),
        widthPct: Number(row.width),
        publicUrl: buildPublicCardUrl(token, origin),
        qrStyle: normalizeQrStyle(row.qrStyle),
        cachedTemplateBuffer: templateCache.get(row.templateStorageKey),
      };
    });

    const sheetOptions = {
      paperSize: parsed.data.paperSize,
      columns: parsed.data.columns,
      cutGuides: parsed.data.cutGuides,
      gapSize: parsed.data.gapSize,
      sizeMode: parsed.data.sizeMode,
      exactSizeCm: parsed.data.exactSizeCm,
      cutGuideShape: parsed.data.cutGuideShape,
      format: parsed.data.format,
    };

    if (parsed.data.format === 'pdf') {
      const sheetPdf = await composePrintSheetPdf(items, sheetOptions);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="hoja-etiquetas-${parsed.data.paperSize}.pdf"`,
      );
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(sheetPdf);
      return;
    }

    const sheetPng = await composePrintSheetPng(items, sheetOptions);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="hoja-etiquetas-${parsed.data.paperSize}.png"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(sheetPng);
  } catch (err) {
    next(err);
  }
});
