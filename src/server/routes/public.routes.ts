import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { normalizeEmergencyProfile } from '../../lib/emergency-profile.ts';
import {
  DEFAULT_PUBLIC_CARD_THEME,
  mergeThemeWithOwnerOverride,
  normalizeOwnerCardOverride,
  normalizePublicCardTheme,
} from '../../lib/public-card-theme.ts';
import { normalizeQrStyle } from '../../lib/qr-styled.ts';
import { getDb, getPublicQueryExecutor, isDatabaseConfigured } from '../db/index.ts';
import { owners } from '../db/schema.ts';
import { rateLimitPublic } from '../middleware/auth.middleware.ts';
import { publicTokenParamSchema, uuidParamSchema } from '../schemas/index.ts';
import { composeFinalLabelPng } from '../services/label-render.service.ts';
import { getStorageProvider } from '../services/storage/index.ts';
import { buildPublicCardUrl, hashPublicToken } from '../services/token.service.ts';

export const publicRouter = Router();
publicRouter.use(rateLimitPublic);

function getRequestOrigin(req: { protocol: string; get(name: string): string | undefined }): string {
  const host = req.get('host');
  return host ? `${req.protocol}://${host}` : '';
}

function hashValidTokenOrNull(rawToken: string): string | null {
  const parsed = publicTokenParamSchema.safeParse(rawToken);
  if (!parsed.success) return null;
  return hashPublicToken(parsed.data);
}

async function fetchOwnerLogoViaFallback(tokenHash: string) {
  if (!isDatabaseConfigured()) return null;
  const rows = await getDb()
    .select({
      logo_storage_key: owners.logoStorageKey,
      logo_mime_type: owners.logoMimeType,
      updated_at: owners.updatedAt,
    })
    .from(owners)
    .where(and(eq(owners.publicTokenHash, tokenHash), eq(owners.status, true)))
    .limit(1);
  return rows[0] ?? null;
}

publicRouter.get('/theme-logo', async (_req, res, next) => {
  try {
    const publicDb = getPublicQueryExecutor();
    let row = null;
    try {
      row = (await publicDb.getCardTheme?.()) ?? null;
    } catch {
      row = null;
    }

    if (!row?.logo_storage_key || !row.logo_mime_type) {
      res.status(404).json({ error: 'Logo personalizado no configurado.' });
      return;
    }

    const buffer = await getStorageProvider().getObject(row.logo_storage_key);
    res.setHeader('Content-Type', row.logo_mime_type);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/:token/owner-logo', async (req, res, next) => {
  try {
    const tokenHash = hashValidTokenOrNull(req.params.token);
    if (!tokenHash) {
      res.status(404).json({ error: 'Logo no disponible.' });
      return;
    }

    const publicDb = getPublicQueryExecutor();
    let row = null;
    try {
      row = (await publicDb.getOwnerLogoByHash?.(tokenHash)) ?? null;
    } catch {
      row = await fetchOwnerLogoViaFallback(tokenHash).catch(() => null);
    }

    if (!row?.logo_storage_key || !row.logo_mime_type) {
      res.status(404).json({ error: 'Logo individual no configurado.' });
      return;
    }

    const buffer = await getStorageProvider().getObject(row.logo_storage_key);
    res.setHeader('Content-Type', row.logo_mime_type);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/:token', async (req, res, next) => {
  try {
    const tokenHash = hashValidTokenOrNull(req.params.token);
    if (!tokenHash) {
      res.status(404).json({ error: 'Ficha no disponible.' });
      return;
    }

    const publicDb = getPublicQueryExecutor();
    const card = await publicDb.getCardByHash(tokenHash);
    if (!card) {
      res.status(404).json({ error: 'Ficha no disponible.' });
      return;
    }

    const docs = await publicDb.getDocumentsByHash(tokenHash);
    try {
      await publicDb.recordScanByHash?.(tokenHash);
    } catch {
      // Ignore gracefully if public_record_scan SQL migration has not been applied yet
    }

    let globalRow = null;
    try {
      globalRow = (await publicDb.getCardTheme?.()) ?? null;
    } catch {
      globalRow = null;
    }

    let ownerOverrideRaw: unknown = null;
    try {
      ownerOverrideRaw = (await publicDb.getOwnerThemeOverrideByHash?.(tokenHash)) ?? null;
    } catch {
      if (isDatabaseConfigured()) {
        const rows = await getDb()
          .select({ cardThemeOverride: owners.cardThemeOverride })
          .from(owners)
          .where(and(eq(owners.publicTokenHash, tokenHash), eq(owners.status, true)))
          .limit(1)
          .catch(() => []);
        ownerOverrideRaw = rows[0]?.cardThemeOverride ?? null;
      } else {
        ownerOverrideRaw = null;
      }
    }

    let ownerEmergencyRaw: unknown = null;
    try {
      ownerEmergencyRaw = (await publicDb.getOwnerEmergencyByHash?.(tokenHash)) ?? null;
    } catch {
      if (isDatabaseConfigured()) {
        const rows = await getDb()
          .select({ emergencyProfile: owners.emergencyProfile })
          .from(owners)
          .where(and(eq(owners.publicTokenHash, tokenHash), eq(owners.status, true)))
          .limit(1)
          .catch(() => []);
        ownerEmergencyRaw = rows[0]?.emergencyProfile ?? null;
      } else {
        ownerEmergencyRaw = null;
      }
    }

    let ownerLogoRow = null;
    try {
      ownerLogoRow = (await publicDb.getOwnerLogoByHash?.(tokenHash)) ?? null;
    } catch {
      ownerLogoRow = await fetchOwnerLogoViaFallback(tokenHash).catch(() => null);
    }

    const hasOwnerLogo = Boolean(
      ownerLogoRow?.logo_storage_key && ownerLogoRow?.logo_mime_type,
    );
    const hasGlobalLogo = Boolean(globalRow?.logo_storage_key);

    const globalTheme = normalizePublicCardTheme({
      ...((globalRow?.theme as Record<string, unknown> | undefined) ?? DEFAULT_PUBLIC_CARD_THEME),
      hasCustomLogo: hasOwnerLogo || hasGlobalLogo,
    });
    const normalizedOverride = normalizeOwnerCardOverride(ownerOverrideRaw);
    const mergedTheme = {
      ...mergeThemeWithOwnerOverride(globalTheme, normalizedOverride),
      hasCustomLogo: hasOwnerLogo || hasGlobalLogo,
      ...(hasOwnerLogo && normalizedOverride?.logoVisible !== false ? { logoVisible: true } : {}),
    };
    const updatedAt = globalRow?.updated_at
      ? new Date(String(globalRow.updated_at)).getTime()
      : null;
    const ownerLogoUpdatedAt = ownerLogoRow?.updated_at
      ? new Date(String(ownerLogoRow.updated_at)).getTime()
      : null;

    const resolvedLogoUrl = hasOwnerLogo
      ? `/api/v1/public/${encodeURIComponent(req.params.token)}/owner-logo${
          ownerLogoUpdatedAt && !Number.isNaN(ownerLogoUpdatedAt) ? `?v=${ownerLogoUpdatedAt}` : ''
        }`
      : hasGlobalLogo
        ? `/api/v1/public/theme-logo${updatedAt && !Number.isNaN(updatedAt) ? `?v=${updatedAt}` : ''}`
        : null;

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      card: {
        fullName: `${card.first_name} ${card.last_name}`.trim(),
        email: card.email,
        phone: card.phone,
        emergencyProfile: normalizeEmergencyProfile(ownerEmergencyRaw),
        documents: docs.map((d) => ({
          id: d.document_id,
          originalName: d.original_name,
          mimeType: d.mime_type,
        })),
      },
      theme: mergedTheme,
      logoUrl: resolvedLogoUrl,
    });
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/:token/label-image', async (req, res, next) => {
  try {
    const tokenHash = hashValidTokenOrNull(req.params.token);
    if (!tokenHash) {
      res.status(404).json({ error: 'Ficha no disponible.' });
      return;
    }

    const publicDb = getPublicQueryExecutor();
    const card = await publicDb.getCardByHash(tokenHash);
    if (!card) {
      res.status(404).json({ error: 'Ficha no disponible.' });
      return;
    }

    const publicUrl = buildPublicCardUrl(req.params.token, getRequestOrigin(req));
    const pngBuffer = await composeFinalLabelPng({
      templateStorageKey: card.template_storage_key,
      templateWidth: card.template_width,
      templateHeight: card.template_height,
      positionX: Number(card.qr_x),
      positionY: Number(card.qr_y),
      widthPct: Number(card.qr_width),
      publicUrl,
      qrStyle: normalizeQrStyle(card.qr_style),
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(pngBuffer);
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/:token/documents/:documentId', async (req, res, next) => {
  try {
    const tokenHash = hashValidTokenOrNull(req.params.token);
    const docIdCheck = uuidParamSchema.safeParse(req.params.documentId);
    if (!tokenHash || !docIdCheck.success) {
      res.status(404).json({ error: 'Recurso no disponible.' });
      return;
    }

    const publicDb = getPublicQueryExecutor();
    const doc = await publicDb.getDocumentFile(tokenHash, docIdCheck.data);
    if (!doc) {
      res.status(404).json({ error: 'Recurso no disponible.' });
      return;
    }

    const buffer = await getStorageProvider().getObject(doc.storage_key);
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
