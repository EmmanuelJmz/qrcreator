import { Router } from 'express';
import { getPublicQueryExecutor } from '../db/index.ts';
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

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      card: {
        fullName: `${card.first_name} ${card.last_name}`.trim(),
        email: card.email,
        phone: card.phone,
        documents: docs.map((d) => ({
          id: d.document_id,
          originalName: d.original_name,
          mimeType: d.mime_type,
        })),
      },
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
