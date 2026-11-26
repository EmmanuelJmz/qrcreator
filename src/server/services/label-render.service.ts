import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp, { type OverlayOptions } from 'sharp';
import {
  cmToPt,
  cmToPx,
  computeExactSheetCapacity,
  PAPER_DIMENSIONS_CM,
  type CutGuideShape,
  type PaperSize,
  type PrintSheetFormat,
  type PrintSheetGap,
  type PrintSheetSizeMode,
} from '../../lib/print-sheet-layout.ts';
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
  paperSize: PaperSize;
  columns: number;
  cutGuides: boolean;
  gapSize: PrintSheetGap;
  sizeMode?: PrintSheetSizeMode;
  exactSizeCm?: number;
  cutGuideShape?: CutGuideShape;
  format?: PrintSheetFormat;
}

const SHEET_DIMENSIONS_150_DPI: Record<PaperSize, { width: number; height: number }> = {
  letter: { width: 1275, height: 1650 },
  tabloid: { width: 1650, height: 2550 },
};

function buildCalibrationSvg(pageW: number, pageH: number, dpi: number): string {
  const barPx = cmToPx(5, dpi);
  const x1 = Math.round((pageW - barPx) / 2);
  const x2 = x1 + barPx;
  const y = pageH - cmToPx(0.55, dpi);
  const tick = cmToPx(0.14, dpi);
  const fontSize = Math.round(dpi * 0.085);

  return (
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#475569" stroke-width="2"/>` +
    `<line x1="${x1}" y1="${y - tick}" x2="${x1}" y2="${y + tick}" stroke="#475569" stroke-width="2"/>` +
    `<line x1="${x2}" y1="${y - tick}" x2="${x2}" y2="${y + tick}" stroke="#475569" stroke-width="2"/>` +
    `<text x="${Math.round(pageW / 2)}" y="${y - tick - 8}" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" fill="#475569">Escala real 1:1 · Imprimir al 100% · Esta barra mide 5.0 cm</text>`
  );
}

export async function composePrintSheetPng(
  items: PrintSheetItem[],
  options: PrintSheetOptions,
): Promise<Buffer> {
  const sizeMode: PrintSheetSizeMode = options.sizeMode ?? 'auto';
  const cutGuideShape: CutGuideShape = options.cutGuideShape ?? 'rect';

  if (sizeMode === 'exact') {
    const dpi = 300;
    const paperCm = PAPER_DIMENSIONS_CM[options.paperSize];
    const pageW = cmToPx(paperCm.widthCm, dpi);
    const pageH = cmToPx(paperCm.heightCm, dpi);
    const exactCm = Math.min(12, Math.max(2, options.exactSizeCm ?? 5));

    const capacity = computeExactSheetCapacity({
      paperSize: options.paperSize,
      exactSizeCm: exactCm,
      gapSize: options.gapSize,
      requestedColumns: options.columns,
    });

    const stickerPx = cmToPx(exactCm, dpi);
    const gapPx = cmToPx(capacity.gapCm, dpi);
    const marginTopPx = cmToPx(capacity.marginCm, dpi);
    const gridWidthPx = capacity.cols * stickerPx + Math.max(0, capacity.cols - 1) * gapPx;
    const startLeftPx = Math.max(cmToPx(0.4, dpi), Math.floor((pageW - gridWidthPx) / 2));

    const pageItems = items.slice(0, capacity.perPage);
    const compositeInputs: OverlayOptions[] = [];
    const guideParts: string[] = [];

    for (let idx = 0; idx < pageItems.length; idx += 1) {
      const item = pageItems[idx];
      const colIdx = idx % capacity.cols;
      const rowIdx = Math.floor(idx / capacity.cols);
      const cellLeft = startLeftPx + colIdx * (stickerPx + gapPx);
      const cellTop = marginTopPx + rowIdx * (stickerPx + gapPx);

      const stickerBuf = await composeFinalLabelPng(item);
      const { data: resizedBuf, info } = await sharp(stickerBuf)
        .resize(stickerPx, stickerPx, {
          fit: 'inside',
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toBuffer({ resolveWithObject: true });

      const left = cellLeft + Math.floor((stickerPx - info.width) / 2);
      const top = cellTop + Math.floor((stickerPx - info.height) / 2);

      compositeInputs.push({
        input: resizedBuf,
        left,
        top,
      });

      if (options.cutGuides) {
        const tick = 20;
        if (cutGuideShape === 'circle') {
          const cx = cellLeft + stickerPx / 2;
          const cy = cellTop + stickerPx / 2;
          const r = stickerPx / 2;
          guideParts.push(
            `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#94A3B8" stroke-width="2.2" stroke-dasharray="10 8"/>` +
              `<path d="M${cx} ${cellTop - tick}V${cellTop}M${cx} ${cellTop + stickerPx}V${cellTop + stickerPx + tick}M${cellLeft - tick} ${cy}H${cellLeft}M${cellLeft + stickerPx} ${cy}H${cellLeft + stickerPx + tick}" fill="none" stroke="#475569" stroke-width="2.5"/>`,
          );
        } else {
          const x1 = left;
          const y1 = top;
          const x2 = left + info.width;
          const y2 = top + info.height;
          guideParts.push(
            `<rect x="${x1}" y="${y1}" width="${info.width}" height="${info.height}" fill="none" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="10 8"/>` +
              `<path d="M${x1 - tick} ${y1}H${x1}V${y1 - tick}M${x2 + tick} ${y1}H${x2}V${y1 - tick}M${x1 - tick} ${y2}H${x1}V${y2 + tick}M${x2 + tick} ${y2}H${x2}V${y2 + tick}" fill="none" stroke="#475569" stroke-width="2.5"/>`,
          );
        }
      }
    }

    guideParts.push(buildCalibrationSvg(pageW, pageH, dpi));
    const guidesSvg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">` +
      guideParts.join('') +
      `</svg>`;
    compositeInputs.push({
      input: Buffer.from(guidesSvg),
      left: 0,
      top: 0,
    });

    return sharp({
      create: {
        width: pageW,
        height: pageH,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite(compositeInputs)
      .withMetadata({ density: dpi })
      .png({ compressionLevel: 6 })
      .toBuffer();
  }

  // Legacy 'auto' column-fit mode
  const { width: pageW, height: pageH } = SHEET_DIMENSIONS_150_DPI[options.paperSize];
  const margin = 48;
  const gap = options.gapSize === 'compact' ? 14 : 28;
  const cols = Math.max(1, Math.min(4, Math.round(options.columns)));
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
        background: { r: 255, g: 255, b: 255, alpha: 0 },
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
      if (cutGuideShape === 'circle') {
        const dia = Math.min(info.width, info.height);
        const cx = left + info.width / 2;
        const cy = top + info.height / 2;
        const r = dia / 2;
        guideRects.push(
          `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#94A3B8" stroke-width="1.2" stroke-dasharray="5 4"/>` +
            `<path d="M${cx} ${cy - r - tick}V${cy - r}M${cx} ${cy + r}V${cy + r + tick}M${cx - r - tick} ${cy}H${cx - r}M${cx + r} ${cy}H${cx + r + tick}" fill="none" stroke="#64748B" stroke-width="1.5"/>`,
        );
      } else {
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
    .withMetadata({ density: 150 })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export async function composePrintSheetPdf(
  items: PrintSheetItem[],
  options: PrintSheetOptions,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const paperCm = PAPER_DIMENSIONS_CM[options.paperSize];
  const pageW = cmToPt(paperCm.widthCm);
  const pageH = cmToPt(paperCm.heightCm);
  const sizeMode: PrintSheetSizeMode = options.sizeMode ?? 'auto';
  const cutGuideShape: CutGuideShape = options.cutGuideShape ?? 'rect';

  // Render all sticker PNGs at crisp print resolution first
  const renderedStickers = await Promise.all(
    items.map(async (item) => {
      const pngBuf = await composeFinalLabelPng(item);
      const image = await pdfDoc.embedPng(pngBuf);
      return { image, width: image.width, height: image.height };
    }),
  );

  if (sizeMode === 'exact') {
    const exactCm = Math.min(12, Math.max(2, options.exactSizeCm ?? 5));
    const capacity = computeExactSheetCapacity({
      paperSize: options.paperSize,
      exactSizeCm: exactCm,
      gapSize: options.gapSize,
      requestedColumns: options.columns,
    });

    const stickerPt = cmToPt(exactCm);
    const gapPt = cmToPt(capacity.gapCm);
    const marginTopPt = cmToPt(capacity.marginCm);
    const gridWidthPt = capacity.cols * stickerPt + Math.max(0, capacity.cols - 1) * gapPt;
    const startLeftPt = Math.max(cmToPt(0.4), (pageW - gridWidthPt) / 2);

    const perPage = Math.max(1, capacity.perPage);
    const totalPages = Math.max(1, Math.ceil(renderedStickers.length / perPage));

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx += 1) {
      const page = pdfDoc.addPage([pageW, pageH]);
      const slice = renderedStickers.slice(pageIdx * perPage, (pageIdx + 1) * perPage);

      for (let i = 0; i < slice.length; i += 1) {
        const { image, width: imgW, height: imgH } = slice[i];
        const colIdx = i % capacity.cols;
        const rowIdx = Math.floor(i / capacity.cols);

        const cellLeft = startLeftPt + colIdx * (stickerPt + gapPt);
        // PDF Y starts at bottom-left
        const cellTopFromBottom = pageH - marginTopPt - rowIdx * (stickerPt + gapPt);
        const cellBottom = cellTopFromBottom - stickerPt;

        const scale = Math.min(stickerPt / imgW, stickerPt / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const drawX = cellLeft + (stickerPt - drawW) / 2;
        const drawY = cellBottom + (stickerPt - drawH) / 2;

        page.drawImage(image, {
          x: drawX,
          y: drawY,
          width: drawW,
          height: drawH,
        });

        if (options.cutGuides) {
          const tick = cmToPt(0.16);
          const guideColor = rgb(0.58, 0.64, 0.72);
          const tickColor = rgb(0.32, 0.38, 0.48);

          if (cutGuideShape === 'circle') {
            const cx = cellLeft + stickerPt / 2;
            const cy = cellBottom + stickerPt / 2;
            const r = stickerPt / 2;

            page.drawCircle({
              x: cx,
              y: cy,
              size: r,
              borderColor: guideColor,
              borderWidth: 0.6,
              borderOpacity: 0.9,
            });
            // 4 cardinal alignment ticks for centering the 5 cm dome
            page.drawLine({ start: { x: cx, y: cy + r }, end: { x: cx, y: cy + r + tick }, thickness: 0.7, color: tickColor });
            page.drawLine({ start: { x: cx, y: cy - r }, end: { x: cx, y: cy - r - tick }, thickness: 0.7, color: tickColor });
            page.drawLine({ start: { x: cx - r - tick, y: cy }, end: { x: cx - r, y: cy }, thickness: 0.7, color: tickColor });
            page.drawLine({ start: { x: cx + r, y: cy }, end: { x: cx + r + tick, y: cy }, thickness: 0.7, color: tickColor });
          } else {
            page.drawRectangle({
              x: drawX,
              y: drawY,
              width: drawW,
              height: drawH,
              borderColor: guideColor,
              borderWidth: 0.6,
              borderOpacity: 0.9,
            });
            // Corner cut ticks
            page.drawLine({ start: { x: drawX - tick, y: drawY + drawH }, end: { x: drawX, y: drawY + drawH }, thickness: 0.7, color: tickColor });
            page.drawLine({ start: { x: drawX, y: drawY + drawH }, end: { x: drawX, y: drawY + drawH + tick }, thickness: 0.7, color: tickColor });
            page.drawLine({ start: { x: drawX + drawW, y: drawY + drawH }, end: { x: drawX + drawW + tick, y: drawY + drawH }, thickness: 0.7, color: tickColor });
            page.drawLine({ start: { x: drawX + drawW, y: drawY + drawH }, end: { x: drawX + drawW, y: drawY + drawH + tick }, thickness: 0.7, color: tickColor });
            page.drawLine({ start: { x: drawX - tick, y: drawY }, end: { x: drawX, y: drawY }, thickness: 0.7, color: tickColor });
            page.drawLine({ start: { x: drawX, y: drawY - tick }, end: { x: drawX, y: drawY }, thickness: 0.7, color: tickColor });
            page.drawLine({ start: { x: drawX + drawW, y: drawY }, end: { x: drawX + drawW + tick, y: drawY }, thickness: 0.7, color: tickColor });
            page.drawLine({ start: { x: drawX + drawW, y: drawY - tick }, end: { x: drawX + drawW, y: drawY }, thickness: 0.7, color: tickColor });
          }
        }
      }

      // Calibration ruler bar at bottom: exact 5.0 cm
      const barPt = cmToPt(5);
      const barX1 = (pageW - barPt) / 2;
      const barX2 = barX1 + barPt;
      const barY = cmToPt(0.45);
      const barTick = cmToPt(0.12);
      const rulerColor = rgb(0.28, 0.33, 0.41);

      page.drawLine({ start: { x: barX1, y: barY }, end: { x: barX2, y: barY }, thickness: 0.9, color: rulerColor });
      page.drawLine({ start: { x: barX1, y: barY - barTick }, end: { x: barX1, y: barY + barTick }, thickness: 0.9, color: rulerColor });
      page.drawLine({ start: { x: barX2, y: barY - barTick }, end: { x: barX2, y: barY + barTick }, thickness: 0.9, color: rulerColor });

      const caption = `Escala real 1:1 (${exactCm.toFixed(1)} cm) - Imprimir al 100% - Barra de prueba = 5.0 cm`;
      const textW = font.widthOfTextAtSize(caption, 8);
      page.drawText(caption, {
        x: Math.max(cmToPt(0.5), (pageW - textW) / 2),
        y: barY + barTick + 4,
        size: 8,
        font,
        color: rulerColor,
      });
    }
  } else {
    // Auto column-fit mode on 1 PDF page
    const page = pdfDoc.addPage([pageW, pageH]);
    const marginPt = cmToPt(0.85);
    const gapPt = cmToPt(options.gapSize === 'compact' ? 0.25 : 0.5);
    const cols = Math.max(1, Math.min(4, Math.round(options.columns)));
    const rows = Math.max(1, Math.ceil(renderedStickers.length / cols));

    const usableW = pageW - marginPt * 2;
    const usableH = pageH - marginPt * 2;
    const cellW = Math.max(24, (usableW - gapPt * (cols - 1)) / cols);
    const cellH = Math.max(24, (usableH - gapPt * (rows - 1)) / rows);

    for (let i = 0; i < renderedStickers.length; i += 1) {
      const { image, width: imgW, height: imgH } = renderedStickers[i];
      const colIdx = i % cols;
      const rowIdx = Math.floor(i / cols);

      const cellLeft = marginPt + colIdx * (cellW + gapPt);
      const cellTopFromBottom = pageH - marginPt - rowIdx * (cellH + gapPt);
      const cellBottom = cellTopFromBottom - cellH;

      const scale = Math.min(cellW / imgW, cellH / imgH);
      const drawW = imgW * scale;
      const drawH = imgH * scale;
      const drawX = cellLeft + (cellW - drawW) / 2;
      const drawY = cellBottom + (cellH - drawH) / 2;

      page.drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH });

      if (options.cutGuides) {
        const guideColor = rgb(0.58, 0.64, 0.72);
        if (cutGuideShape === 'circle') {
          const r = Math.min(drawW, drawH) / 2;
          page.drawCircle({
            x: drawX + drawW / 2,
            y: drawY + drawH / 2,
            size: r,
            borderColor: guideColor,
            borderWidth: 0.6,
          });
        } else {
          page.drawRectangle({
            x: drawX,
            y: drawY,
            width: drawW,
            height: drawH,
            borderColor: guideColor,
            borderWidth: 0.6,
          });
        }
      }
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
