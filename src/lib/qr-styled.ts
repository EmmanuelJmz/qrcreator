import QRCode from 'qrcode';

export interface StyledQrOptions {
  pixelSize?: number;
  darkColor?: string;
  eyeColor?: string;
  lightColor?: string;
  margin?: number;
}

const DEFAULT_DARK = '#0F172A';
const DEFAULT_EYE = '#DC4C0D';
const DEFAULT_LIGHT = '#FFFFFF';

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

export function renderStyledQrSvg(text: string, options: StyledQrOptions = {}): string {
  const darkColor = options.darkColor ?? DEFAULT_DARK;
  const eyeColor = options.eyeColor ?? DEFAULT_EYE;
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
  const R = 0.36;
  const EPS = 0.02;
  const FILLET = 0.24;

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (isInsideFinderPattern(r, c, size)) continue;

      const x0 = margin + c;
      const y0 = margin + r;

      if (isDark(r, c)) {
        const top = isDataDark(r - 1, c);
        const right = isDataDark(r, c + 1);
        const bottom = isDataDark(r + 1, c);
        const left = isDataDark(r, c - 1);

        const x1 = x0 + 1 + (right ? EPS : 0);
        const y1 = y0 + 1 + (bottom ? EPS : 0);

        const rTL = !top && !left ? R : 0;
        const rTR = !top && !right ? R : 0;
        const rBR = !bottom && !right ? R : 0;
        const rBL = !bottom && !left ? R : 0;

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
        pathParts.push(d);
      } else {
        // Subtle liquid concave fillets where two orthogonal dark data modules meet
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

  const findersSvg = finderCoords
    .map(
      ({ x, y }) =>
        `<rect x="${fmt(x + 0.5)}" y="${fmt(y + 0.5)}" width="6" height="6" rx="1.6" ry="1.6" fill="none" stroke="${darkColor}" stroke-width="1"/>` +
        `<rect x="${fmt(x + 2)}" y="${fmt(y + 2)}" width="3" height="3" rx="0.85" ry="0.85" fill="${eyeColor}"/>`,
    )
    .join('');

  const sizeAttrs =
    options.pixelSize && options.pixelSize > 0
      ? ` width="${Math.round(options.pixelSize)}" height="${Math.round(options.pixelSize)}"`
      : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg"${sizeAttrs} viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="geometricPrecision">` +
    `<rect width="${viewSize}" height="${viewSize}" fill="${lightColor}"/>` +
    `<path d="${pathParts.join('')}" fill="${darkColor}"/>` +
    findersSvg +
    `</svg>`
  );
}
