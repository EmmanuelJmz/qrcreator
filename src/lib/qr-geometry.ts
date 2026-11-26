export interface LabelGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeSquareHeightPct(
  widthPct: number,
  templateWidth: number,
  templateHeight: number,
): number {
  if (templateWidth <= 0 || templateHeight <= 0) return widthPct;
  return round2(widthPct * (templateWidth / templateHeight));
}

export function computeSquareWidthPct(
  heightPct: number,
  templateWidth: number,
  templateHeight: number,
): number {
  if (templateWidth <= 0 || templateHeight <= 0) return heightPct;
  return round2(heightPct * (templateHeight / templateWidth));
}

export function getMaxSquareWidthPct(
  x: number,
  y: number,
  templateWidth: number,
  templateHeight: number,
): number {
  const maxByX = Math.max(0, 100 - x);
  const maxByY = Math.max(0, (100 - y) * (templateHeight / templateWidth));
  return round2(Math.min(maxByX, maxByY));
}

/**
 * Clamps position and square width to fit strictly inside [0, 100]% of the template
 * while maintaining a 1:1 pixel square aspect ratio.
 */
export function clampSquareLabelGeometry(
  input: { x: number; y: number; width: number },
  templateWidth: number,
  templateHeight: number,
): LabelGeometry {
  const safeW = Math.max(1, templateWidth);
  const safeH = Math.max(1, templateHeight);

  const minWidthPct = Math.min(
    40,
    Math.max(5, round2((48 / safeW) * 100)),
  );

  // Absolute maximum width that can fit as a square anywhere inside the template
  const maxPossibleWidthPct = round2(Math.min(100, 100 * (safeH / safeW)));

  let width = round2(
    Math.min(Math.max(input.width, minWidthPct), maxPossibleWidthPct),
  );
  let height = computeSquareHeightPct(width, safeW, safeH);

  // Ensure height never exceeds 100% due to rounding
  if (height > 100) {
    height = 100;
    width = computeSquareWidthPct(height, safeW, safeH);
  }

  const maxX = Math.max(0, round2(100 - width));
  const maxY = Math.max(0, round2(100 - height));

  const x = round2(Math.min(Math.max(input.x, 0), maxX));
  const y = round2(Math.min(Math.max(input.y, 0), maxY));

  return { x, y, width, height };
}

export function defaultSquareLabelGeometry(
  templateWidth: number,
  templateHeight: number,
): LabelGeometry {
  const safeW = Math.max(1, templateWidth);
  const safeH = Math.max(1, templateHeight);

  if (Math.abs(safeW - safeH) <= 2) {
    // Square templates (e.g. 5 cm circular dome templates): center QR in the safe inner box
    const width = 44;
    const pos = round2((100 - width) / 2);
    return clampSquareLabelGeometry({ x: pos, y: pos, width }, safeW, safeH);
  }

  // Target ~28% of the smaller visual side, placed neatly on the right-center
  const targetWidth = safeW > safeH ? 22 : 34;
  const clamped = clampSquareLabelGeometry(
    { x: 68, y: 20, width: targetWidth },
    safeW,
    safeH,
  );
  // Center vertically if there's plenty of room
  const centeredY = round2(Math.max(0, Math.min(100 - clamped.height, (100 - clamped.height) / 2)));
  const safeX = round2(Math.max(0, Math.min(100 - clamped.width, 94 - clamped.width)));
  return clampSquareLabelGeometry({ x: safeX, y: centeredY, width: clamped.width }, safeW, safeH);
}

export function validateLabelGeometry(
  coords: LabelGeometry,
  templateWidth: number,
  templateHeight: number,
): { valid: true } | { valid: false; error: string } {
  const { x, y, width, height } = coords;

  if (![x, y, width, height].every((v) => Number.isFinite(v))) {
    return { valid: false, error: 'Las coordenadas deben ser valores numéricos válidos.' };
  }
  if (x < 0 || y < 0) {
    return { valid: false, error: 'Las coordenadas X e Y no pueden ser negativas.' };
  }
  if (width < 5) {
    return { valid: false, error: 'El ancho mínimo permitido para el código QR es 5%.' };
  }
  if (height <= 0) {
    return { valid: false, error: 'El alto del código QR debe ser mayor que cero.' };
  }
  if (x + width > 100.005) {
    return { valid: false, error: 'La posición X más el ancho no puede superar el 100%.' };
  }
  if (y + height > 100.005) {
    return { valid: false, error: 'La posición Y más el alto no puede superar el 100%.' };
  }

  const widthPx = (width / 100) * templateWidth;
  const heightPx = (height / 100) * templateHeight;
  if (Math.abs(widthPx - heightPx) > 1) {
    return {
      valid: false,
      error: 'El código QR debe mantener estrictamente una proporción cuadrada (1:1).',
    };
  }

  return { valid: true };
}
