import fs from 'fs';
import path from 'path';
import opentype, { type Font } from 'opentype.js';

let regularFont: Font | null | undefined;
let boldFont: Font | null | undefined;

function resolveFontFile(fileName: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'src/server/assets/fonts', fileName),
    path.resolve(import.meta.dirname, '../assets/fonts', fileName),
    path.resolve(import.meta.dirname, '../../src/server/assets/fonts', fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadFont(weight: 'regular' | 'bold'): Font | null {
  if (weight === 'bold' && boldFont !== undefined) return boldFont;
  if (weight === 'regular' && regularFont !== undefined) return regularFont;

  const fileName =
    weight === 'bold' ? 'LiberationSans-Bold.ttf' : 'LiberationSans-Regular.ttf';
  const resolved = resolveFontFile(fileName);
  let loaded: Font | null = null;
  if (resolved) {
    try {
      const buf = fs.readFileSync(resolved);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      loaded = opentype.parse(ab);
    } catch {
      loaded = null;
    }
  }

  if (weight === 'bold') {
    boldFont = loaded;
  } else {
    regularFont = loaded;
  }
  return loaded;
}

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrString)) !== null) {
    attrs[match[1]] = match[2] ?? match[3] ?? '';
  }
  return attrs;
}

function formatCommandsToPathData(commands: opentype.PathCommand[]): string {
  const parts: string[] = [];
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
      case 'L':
        parts.push(`${cmd.type}${cmd.x.toFixed(2)} ${cmd.y.toFixed(2)}`);
        break;
      case 'Q':
        parts.push(
          `Q${cmd.x1.toFixed(2)} ${cmd.y1.toFixed(2)} ${cmd.x.toFixed(2)} ${cmd.y.toFixed(2)}`,
        );
        break;
      case 'C':
        parts.push(
          `C${cmd.x1.toFixed(2)} ${cmd.y1.toFixed(2)} ${cmd.x2.toFixed(2)} ${cmd.y2.toFixed(2)} ${cmd.x.toFixed(2)} ${cmd.y.toFixed(2)}`,
        );
        break;
      case 'Z':
        parts.push('Z');
        break;
    }
  }
  return parts.join('');
}

export function renderTextToSvgPath(options: {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill?: string;
  fontWeight?: string | number;
  textAnchor?: 'start' | 'middle' | 'end';
  letterSpacingPx?: number;
}): string | null {
  const numericWeight =
    typeof options.fontWeight === 'number'
      ? options.fontWeight
      : options.fontWeight === 'bold'
        ? 700
        : Number(options.fontWeight ?? 400);

  const font = loadFont(!Number.isNaN(numericWeight) && numericWeight >= 600 ? 'bold' : 'regular');
  if (!font) return null;

  const fontSize = Math.max(1, options.fontSize);
  const letterSpacingEm =
    options.letterSpacingPx && fontSize > 0 ? options.letterSpacingPx / fontSize : 0;

  const renderOpts = {
    kerning: true,
    letterSpacing: letterSpacingEm,
  };

  const advanceWidth = font.getAdvanceWidth(options.text, fontSize, renderOpts);
  let startX = options.x;
  if (options.textAnchor === 'middle') {
    startX -= advanceWidth / 2;
  } else if (options.textAnchor === 'end') {
    startX -= advanceWidth;
  }

  const vectorPath = font.getPath(options.text, startX, options.y, fontSize, renderOpts);
  const d = formatCommandsToPathData(vectorPath.commands);
  if (!d) return '';
  if (d.includes('NaN')) return null;
  const fill = options.fill || '#000000';
  return `<path d="${d}" fill="${fill}"/>`;
}

/**
 * Converts every `<text ...>...</text>` element in an SVG string into pure
 * vector `<path d="..." fill="..." />` geometry using the bundled Noto Sans TTF
 * fonts. This guarantees crisp text rendering across all Linux/Cloud Run hosts
 * even when no system fonts or fontconfig Latin families are installed.
 */
export function convertSvgTextElementsToPaths(svg: string): string {
  return svg.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi, (fullMatch, rawAttrs, rawText) => {
    const attrs = parseAttributes(rawAttrs);
    const text = decodeXmlEntities(String(rawText).trim());
    if (!text) return '';

    const x = Number(attrs.x ?? 0);
    const y = Number(attrs.y ?? 0);
    const fontSize = Number(attrs['font-size'] ?? 16);
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(fontSize) || fontSize <= 0) {
      return fullMatch;
    }

    const anchorRaw = attrs['text-anchor'];
    const textAnchor: 'start' | 'middle' | 'end' =
      anchorRaw === 'middle' || anchorRaw === 'end' ? anchorRaw : 'start';

    const letterSpacingPx = attrs['letter-spacing'] ? Number(attrs['letter-spacing']) : 0;

    const pathEl = renderTextToSvgPath({
      text,
      x,
      y,
      fontSize,
      fill: attrs.fill || '#000000',
      fontWeight: attrs['font-weight'],
      textAnchor,
      letterSpacingPx: Number.isNaN(letterSpacingPx) ? 0 : letterSpacingPx,
    });

    return pathEl === null ? fullMatch : pathEl;
  });
}
