import QRCode from 'qrcode';

export const QR_STYLE_IDS = ['classic', 'fluid', 'dots', 'rounded', 'diamonds'] as const;
export type QrStyle = (typeof QR_STYLE_IDS)[number];

export interface QrStyleOption {
  id: QrStyle;
  label: string;
  description: string;
}

export const QR_STYLE_OPTIONS: readonly QrStyleOption[] = [
  {
    id: 'classic',
    label: 'Clásico',
    description: 'QR genérico estándar de cuadros negros',
  },
  {
    id: 'fluid',
    label: 'Fluido CascoQR',
    description: 'Módulos conectados negro y ojos naranja',
  },
  {
    id: 'dots',
    label: 'Círculos',
    description: 'Puntos circulares y ojos concéntricos',
  },
  {
    id: 'rounded',
    label: 'Degradado',
    description: 'Trazo suave azul profundo y ojos tipo hoja',
  },
  {
    id: 'diamonds',
    label: 'Diamantes',
    description: 'Módulos en rombo y estrella central',
  },
] as const;

export function normalizeQrStyle(raw?: string | null): QrStyle {
  if (raw && (QR_STYLE_IDS as readonly string[]).includes(raw)) {
    return raw as QrStyle;
  }
  return 'fluid';
}

export interface StyledQrOptions {
  style?: QrStyle;
  pixelSize?: number;
  lightColor?: string;
  margin?: number;
}

const DEFAULT_LIGHT = '#FFFFFF';
let svgGradSeq = 0;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '');
}

function isInsideFinderPattern(r: number, c: number, size: number): boolean {
  const inTop = r >= 0 && r < 7;
  const inBottom = r >= size - 7 && r < size;
  const inLeft = c >= 0 && c < 7;
  const inRight = c >= size - 7 && c < size;
  return (inTop && inLeft) || (inTop && inRight) || (inBottom && inLeft);
}

function buildRoundedBoxPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rTL: number,
  rTR: number,
  rBR: number,
  rBL: number,
): string {
  let d = `M${fmt(x0 + rTL)} ${fmt(y0)}`;
  d += `L${fmt(x1 - rTR)} ${fmt(y0)}`;
  if (rTR > 0) d += `Q${fmt(x1)} ${fmt(y0)} ${fmt(x1)} ${fmt(y0 + rTR)}`;
  d += `L${fmt(x1)} ${fmt(y1 - rBR)}`;
  if (rBR > 0) d += `Q${fmt(x1)} ${fmt(y1)} ${fmt(x1 - rBR)} ${fmt(y1)}`;
  d += `L${fmt(x0 + rBL)} ${fmt(y1)}`;
  if (rBL > 0) d += `Q${fmt(x0)} ${fmt(y1)} ${fmt(x0)} ${fmt(y1 - rBL)}`;
  d += `L${fmt(x0)} ${fmt(y0 + rTL)}`;
  if (rTL > 0) d += `Q${fmt(x0)} ${fmt(y0)} ${fmt(x0 + rTL)} ${fmt(y0)}`;
  d += 'Z';
  return d;
}

function buildStarPath(cx: number, cy: number, outerR: number, innerR: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    points.push(`${i === 0 ? 'M' : 'L'}${fmt(px)} ${fmt(py)}`);
  }
  return `${points.join('')}Z`;
}

export function renderStyledQrSvg(text: string, options: StyledQrOptions = {}): string {
  const style = normalizeQrStyle(options.style);
  const lightColor = options.lightColor ?? DEFAULT_LIGHT;
  const margin = options.margin ?? 1;

  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const viewSize = size + margin * 2;

  const isDark = (r: number, c: number): boolean =>
    r >= 0 && r < size && c >= 0 && c < size && Boolean(data[r * size + c]);

  const isDataDark = (r: number, c: number): boolean =>
    !isInsideFinderPattern(r, c, size) && isDark(r, c);

  const pathParts: string[] = [];
  const R = style === 'rounded' ? 0.34 : 0.36;
  const EPS = 0.02;
  const FILLET = 0.24;

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (isInsideFinderPattern(r, c, size)) continue;

      const x0 = margin + c;
      const y0 = margin + r;

      if (style === 'classic') {
        if (!isDark(r, c)) continue;
        const right = isDataDark(r, c + 1);
        const bottom = isDataDark(r + 1, c);
        const x1 = x0 + 1 + (right ? EPS : 0);
        const y1 = y0 + 1 + (bottom ? EPS : 0);
        pathParts.push(`M${fmt(x0)} ${fmt(y0)}H${fmt(x1)}V${fmt(y1)}H${fmt(x0)}Z`);
        continue;
      }

      if (style === 'dots') {
        if (!isDark(r, c)) continue;
        const cx = x0 + 0.5;
        const cy = y0 + 0.5;
        const rad = 0.42;
        pathParts.push(
          `M${fmt(cx - rad)} ${fmt(cy)}A${fmt(rad)} ${fmt(rad)} 0 1 0 ${fmt(cx + rad)} ${fmt(cy)}A${fmt(rad)} ${fmt(rad)} 0 1 0 ${fmt(cx - rad)} ${fmt(cy)}Z`,
        );
        continue;
      }

      if (style === 'diamonds') {
        if (!isDark(r, c)) continue;
        const cx = x0 + 0.5;
        const cy = y0 + 0.5;
        const pad = 0.05;
        pathParts.push(
          `M${fmt(cx)} ${fmt(y0 + pad)}L${fmt(x0 + 1 - pad)} ${fmt(cy)}L${fmt(cx)} ${fmt(y0 + 1 - pad)}L${fmt(x0 + pad)} ${fmt(cy)}Z`,
        );
        continue;
      }

      // 'fluid' or 'rounded' connected modules
      if (isDark(r, c)) {
        const top = isDataDark(r - 1, c);
        const right = isDataDark(r, c + 1);
        const bottom = isDataDark(r + 1, c);
        const left = isDataDark(r, c - 1);

        const x1 = x0 + 1 + (right ? EPS : 0);
        const y1 = y0 + 1 + (bottom ? EPS : 0);

        pathParts.push(
          buildRoundedBoxPath(
            x0,
            y0,
            x1,
            y1,
            !top && !left ? R : 0,
            !top && !right ? R : 0,
            !bottom && !right ? R : 0,
            !bottom && !left ? R : 0,
          ),
        );
      } else {
        const top = isDataDark(r - 1, c);
        const right = isDataDark(r, c + 1);
        const bottom = isDataDark(r + 1, c);
        const left = isDataDark(r, c - 1);

        if (top && left) {
          pathParts.push(
            `M${fmt(x0)} ${fmt(y0)}L${fmt(x0 + FILLET)} ${fmt(y0)}Q${fmt(x0)} ${fmt(y0)} ${fmt(x0)} ${fmt(y0 + FILLET)}Z`,
          );
        }
        if (top && right) {
          const rx = x0 + 1;
          pathParts.push(
            `M${fmt(rx)} ${fmt(y0)}L${fmt(rx)} ${fmt(y0 + FILLET)}Q${fmt(rx)} ${fmt(y0)} ${fmt(rx - FILLET)} ${fmt(y0)}Z`,
          );
        }
        if (bottom && right) {
          const rx = x0 + 1;
          const by = y0 + 1;
          pathParts.push(
            `M${fmt(rx)} ${fmt(by)}L${fmt(rx - FILLET)} ${fmt(by)}Q${fmt(rx)} ${fmt(by)} ${fmt(rx)} ${fmt(by - FILLET)}Z`,
          );
        }
        if (bottom && left) {
          const by = y0 + 1;
          pathParts.push(
            `M${fmt(x0)} ${fmt(by)}L${fmt(x0)} ${fmt(by - FILLET)}Q${fmt(x0)} ${fmt(by)} ${fmt(x0 + FILLET)} ${fmt(by)}Z`,
          );
        }
      }
    }
  }

  const finderCoords = [
    { x: margin, y: margin },
    { x: margin + size - 7, y: margin },
    { x: margin, y: margin + size - 7 },
  ];

  let defsSvg = '';
  let moduleFill = '#0F172A';
  let findersSvg = '';

  if (style === 'rounded') {
    const gradId = `cqr-grad-${(svgGradSeq += 1)}`;
    defsSvg =
      `<defs><linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">` +
      `<stop offset="0%" stop-color="#0284C7"/>` +
      `<stop offset="100%" stop-color="#1E3A8A"/>` +
      `</linearGradient></defs>`;
    moduleFill = `url(#${gradId})`;
    findersSvg = finderCoords
      .map(({ x, y }) => {
        const outerD = buildRoundedBoxPath(
          x + 0.5,
          y + 0.5,
          x + 6.5,
          y + 6.5,
          2.1,
          0.35,
          2.1,
          0.35,
        );
        const innerD = buildRoundedBoxPath(x + 2, y + 2, x + 5, y + 5, 1.15, 0.2, 1.15, 0.2);
        return (
          `<path d="${outerD}" fill="none" stroke="url(#${gradId})" stroke-width="1"/>` +
          `<path d="${innerD}" fill="#0F172A"/>`
        );
      })
      .join('');
  } else if (style === 'dots') {
    moduleFill = '#0F172A';
    findersSvg = finderCoords
      .map(
        ({ x, y }) =>
          `<circle cx="${fmt(x + 3.5)}" cy="${fmt(y + 3.5)}" r="3" fill="none" stroke="#0F172A" stroke-width="1"/>` +
          `<circle cx="${fmt(x + 3.5)}" cy="${fmt(y + 3.5)}" r="1.5" fill="#DC4C0D"/>`,
      )
      .join('');
  } else if (style === 'diamonds') {
    moduleFill = '#0F172A';
    findersSvg = finderCoords
      .map(({ x, y }) => {
        const starD = buildStarPath(x + 3.5, y + 3.5, 1.65, 0.72);
        return (
          `<rect x="${fmt(x + 0.5)}" y="${fmt(y + 0.5)}" width="6" height="6" rx="1.6" ry="1.6" fill="none" stroke="#0F172A" stroke-width="1"/>` +
          `<path d="${starD}" fill="#DC2626"/>`
        );
      })
      .join('');
  } else if (style === 'classic') {
    moduleFill = '#000000';
    findersSvg = finderCoords
      .map(
        ({ x, y }) =>
          `<rect x="${fmt(x + 0.5)}" y="${fmt(y + 0.5)}" width="6" height="6" fill="none" stroke="#000000" stroke-width="1"/>` +
          `<rect x="${fmt(x + 2)}" y="${fmt(y + 2)}" width="3" height="3" fill="#000000"/>`,
      )
      .join('');
  } else {
    // 'fluid'
    moduleFill = '#0F172A';
    findersSvg = finderCoords
      .map(
        ({ x, y }) =>
          `<rect x="${fmt(x + 0.5)}" y="${fmt(y + 0.5)}" width="6" height="6" rx="1.6" ry="1.6" fill="none" stroke="#0F172A" stroke-width="1"/>` +
          `<rect x="${fmt(x + 2)}" y="${fmt(y + 2)}" width="3" height="3" rx="0.85" ry="0.85" fill="#DC4C0D"/>`,
      )
      .join('');
  }

  const sizeAttrs =
    options.pixelSize && options.pixelSize > 0
      ? ` width="${Math.round(options.pixelSize)}" height="${Math.round(options.pixelSize)}"`
      : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg"${sizeAttrs} viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="geometricPrecision">` +
    defsSvg +
    `<rect width="${viewSize}" height="${viewSize}" fill="${lightColor}"/>` +
    `<path d="${pathParts.join('')}" fill="${moduleFill}"/>` +
    findersSvg +
    `</svg>`
  );
}
