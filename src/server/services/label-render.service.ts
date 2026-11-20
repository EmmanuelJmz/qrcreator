import sharp, { type OverlayOptions } from 'sharp';
import { renderStyledQrSvg, type QrStyle } from '../../lib/qr-styled.ts';
import { getStorageProvider } from './storage/index.ts';

export async function generateQrSvg(publicUrl: string, style: QrStyle = 'fluid'): Promise<string> {
  return renderStyledQrSvg(publicUrl, { style });
}

export async function generateQrPngBuffer(
  publicUrl: string,
  sizePx: number,
  style: QrStyle = 'fluid',
): Promise<Buffer> {
  const safeSize = Math.max(32, Math.round(sizePx));
  const svg = renderStyledQrSvg(publicUrl, { style, pixelSize: safeSize });
  return sharp(Buffer.from(svg), { density: 300 })
    .resize(safeSize, safeSize)
    .png()
    .toBuffer();
}

export interface ComposeLabelParams {
  templateStorageKey: string;
  templateWidth: number;
  templateHeight: number;
  positionX: number;
  positionY: number;
  widthPct: number;
  publicUrl: string;
  qrStyle?: QrStyle;
  cachedTemplateBuffer?: Buffer;
}

export async function composeFinalLabelPng(params: ComposeLabelParams): Promise<Buffer> {
  const templateBuffer =
    params.cachedTemplateBuffer ??
    (await getStorageProvider().getObject(params.templateStorageKey));

  // Strictly preserve 1:1 square pixel aspect ratio
  const rawSidePx = Math.round((params.widthPct / 100) * params.templateWidth);
  const maxAllowedSide = Math.min(params.templateWidth, params.templateHeight);
  const qrSizePx = Math.min(Math.max(32, rawSidePx), maxAllowedSide);

  let leftPx = Math.round((params.positionX / 100) * params.templateWidth);
  let topPx = Math.round((params.positionY / 100) * params.templateHeight);

  // Clamp coordinates strictly inside the template boundaries
  leftPx = Math.max(0, Math.min(leftPx, params.templateWidth - qrSizePx));
  topPx = Math.max(0, Math.min(topPx, params.templateHeight - qrSizePx));

  const qrPngBuffer = await generateQrPngBuffer(
    params.publicUrl,
    qrSizePx,
    params.qrStyle ?? 'fluid',
  );

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

export interface PrintSheetItem extends ComposeLabelParams {
  ownerId: string;
}

export interface PrintSheetOptions {
  paperSize: 'letter' | 'tabloid';
  columns: number;
  cutGuides: boolean;
  gapSize: 'compact' | 'normal';
}

const SHEET_DIMENSIONS: Record<'letter' | 'tabloid', { width: number; height: number }> = {
  letter: { width: 1275, height: 1650 },
  tabloid: { width: 1650, height: 2550 },
};

export async function composePrintSheetPng(
  items: PrintSheetItem[],
  options: PrintSheetOptions,
): Promise<Buffer> {
  const { width: pageW, height: pageH } = SHEET_DIMENSIONS[options.paperSize];
  const margin = 48;
  const gap = options.gapSize === 'compact' ? 14 : 28;
  const cols = Math.max(2, Math.min(4, Math.round(options.columns)));
  const rows = Math.max(1, Math.ceil(items.length / cols));

  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const cellW = Math.max(80, Math.floor((usableW - gap * (cols - 1)) / cols));
  const cellH = Math.max(80, Math.floor((usableH - gap * (rows - 1)) / rows));

  const compositeInputs: OverlayOptions[] = [];
  const guideRects: string[] = [];

  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx];
    const colIdx = idx % cols;
    const rowIdx = Math.floor(idx / cols);
    const cellLeft = margin + colIdx * (cellW + gap);
    const cellTop = margin + rowIdx * (cellH + gap);

    const stickerBuf = await composeFinalLabelPng(item);
    const { data: resizedBuf, info } = await sharp(stickerBuf)
      .resize(cellW, cellH, {
        fit: 'inside',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer({ resolveWithObject: true });

    const left = cellLeft + Math.floor((cellW - info.width) / 2);
    const top = cellTop + Math.floor((cellH - info.height) / 2);

    compositeInputs.push({
      input: resizedBuf,
      left,
      top,
    });

    if (options.cutGuides) {
      const tick = 10;
      const x1 = left;
      const y1 = top;
      const x2 = left + info.width;
      const y2 = top + info.height;
      guideRects.push(
        `<rect x="${x1}" y="${y1}" width="${info.width}" height="${info.height}" fill="none" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="5 4"/>` +
          `<path d="M${x1 - tick} ${y1}H${x1}V${y1 - tick}M${x2 + tick} ${y1}H${x2}V${y1 - tick}M${x1 - tick} ${y2}H${x1}V${y2 + tick}M${x2 + tick} ${y2}H${x2}V${y2 + tick}" fill="none" stroke="#64748B" stroke-width="1.5"/>`,
      );
    }
  }

  if (options.cutGuides && guideRects.length > 0) {
    const guidesSvg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">` +
      guideRects.join('') +
      `</svg>`;
    compositeInputs.push({
      input: Buffer.from(guidesSvg),
      left: 0,
      top: 0,
    });
  }

  return sharp({
    create: {
      width: pageW,
      height: pageH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(compositeInputs)
    .png({ compressionLevel: 6 })
    .toBuffer();
}
