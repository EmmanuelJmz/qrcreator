import QRCode from 'qrcode';
import sharp from 'sharp';
import { getStorageProvider } from './storage/index.ts';

export async function generateQrSvg(publicUrl: string): Promise<string> {
  return QRCode.toString(publicUrl, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
}

export async function generateQrPngBuffer(publicUrl: string, sizePx: number): Promise<Buffer> {
  const safeSize = Math.max(32, Math.round(sizePx));
  return QRCode.toBuffer(publicUrl, {
    type: 'png',
    width: safeSize,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
}

export interface ComposeLabelParams {
  templateStorageKey: string;
  templateWidth: number;
  templateHeight: number;
  positionX: number;
  positionY: number;
  widthPct: number;
  publicUrl: string;
}

export async function composeFinalLabelPng(params: ComposeLabelParams): Promise<Buffer> {
  const storage = getStorageProvider();
  const templateBuffer = await storage.getObject(params.templateStorageKey);

  // Strictly preserve 1:1 square pixel aspect ratio
  const rawSidePx = Math.round((params.widthPct / 100) * params.templateWidth);
  const maxAllowedSide = Math.min(params.templateWidth, params.templateHeight);
  const qrSizePx = Math.min(Math.max(32, rawSidePx), maxAllowedSide);

  let leftPx = Math.round((params.positionX / 100) * params.templateWidth);
  let topPx = Math.round((params.positionY / 100) * params.templateHeight);

  // Clamp coordinates strictly inside the template boundaries
  leftPx = Math.max(0, Math.min(leftPx, params.templateWidth - qrSizePx));
  topPx = Math.max(0, Math.min(topPx, params.templateHeight - qrSizePx));

  const qrPngBuffer = await generateQrPngBuffer(params.publicUrl, qrSizePx);

  return sharp(templateBuffer)
    .composite([
      {
        input: qrPngBuffer,
        left: leftPx,
        top: topPx,
      },
    ])
    .png({ compressionLevel: 6 })
    .toBuffer();
}
