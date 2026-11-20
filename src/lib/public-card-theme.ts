export type LogoShape = 'circle' | 'rounded' | 'square' | 'none';
export type PageBackgroundMode = 'slate' | 'white' | 'warm' | 'dark';

export interface PublicCardTheme {
  brandName: string;
  subtitleText: string;
  showBrandName: boolean;
  showSubtitle: boolean;
  headerColor: string;
  headerHeight: number;
  logoVisible: boolean;
  logoShape: LogoShape;
  logoSize: number;
  logoX: number;
  logoY: number;
  hasCustomLogo: boolean;
  pageBg: PageBackgroundMode;
  showLabelPreviewButton: boolean;
  footerNote: string;
}

export interface OwnerCardThemeOverride {
  useGlobalTheme: boolean;
  brandName?: string | null;
  subtitleText?: string | null;
  showBrandName?: boolean | null;
  showSubtitle?: boolean | null;
  headerColor?: string | null;
  headerHeight?: number | null;
  logoVisible?: boolean | null;
  logoShape?: LogoShape | null;
  logoSize?: number | null;
  logoX?: number | null;
  logoY?: number | null;
  pageBg?: PageBackgroundMode | null;
  showLabelPreviewButton?: boolean | null;
  footerNote?: string | null;
}

export const DEFAULT_PUBLIC_CARD_THEME: PublicCardTheme = {
  brandName: 'CascoQR',
  subtitleText: 'Ficha de identificación',
  showBrandName: true,
  showSubtitle: true,
  headerColor: '#F97316',
  headerHeight: 160,
  logoVisible: true,
  logoShape: 'circle',
  logoSize: 112,
  logoX: 50,
  logoY: 100,
  hasCustomLogo: false,
  pageBg: 'slate',
  showLabelPreviewButton: true,
  footerNote: '',
};

export const HEADER_COLOR_PRESETS: Array<{ label: string; hex: string }> = [
  { label: 'Naranja CascoQR', hex: '#F97316' },
  { label: 'Grafito', hex: '#1E293B' },
  { label: 'Negro mate', hex: '#0F172A' },
  { label: 'Azul cobalto', hex: '#2563EB' },
  { label: 'Rojo racing', hex: '#DC2626' },
  { label: 'Verde esmeralda', hex: '#059669' },
  { label: 'Ámbar dorado', hex: '#D97706' },
  { label: 'Morado', hex: '#7C3AED' },
];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function clampNumber(val: unknown, fallback: number, min: number, max: number): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(Math.min(max, Math.max(min, num)));
}

function clampOptionalInt(val: unknown, min: number, max: number): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return null;
  return Math.round(Math.min(max, Math.max(min, num)));
}

export function normalizeHexColor(val: unknown, fallback: string): string {
  if (typeof val === 'string' && HEX_COLOR_RE.test(val.trim())) {
    return val.trim().toUpperCase();
  }
  return fallback;
}

export function normalizePublicCardTheme(
  raw?: Partial<PublicCardTheme> | Record<string, unknown> | null,
): PublicCardTheme {
  const src = (raw ?? {}) as Record<string, unknown>;

  const logoShape: LogoShape =
    src.logoShape === 'circle' ||
    src.logoShape === 'rounded' ||
    src.logoShape === 'square' ||
    src.logoShape === 'none'
      ? src.logoShape
      : DEFAULT_PUBLIC_CARD_THEME.logoShape;

  const pageBg: PageBackgroundMode =
    src.pageBg === 'slate' ||
    src.pageBg === 'white' ||
    src.pageBg === 'warm' ||
    src.pageBg === 'dark'
      ? src.pageBg
      : DEFAULT_PUBLIC_CARD_THEME.pageBg;

  return {
    brandName:
      typeof src.brandName === 'string'
        ? src.brandName.trim().slice(0, 60) || DEFAULT_PUBLIC_CARD_THEME.brandName
        : DEFAULT_PUBLIC_CARD_THEME.brandName,
    subtitleText:
      typeof src.subtitleText === 'string'
        ? src.subtitleText.trim().slice(0, 80)
        : DEFAULT_PUBLIC_CARD_THEME.subtitleText,
    showBrandName:
      typeof src.showBrandName === 'boolean'
        ? src.showBrandName
        : DEFAULT_PUBLIC_CARD_THEME.showBrandName,
    showSubtitle:
      typeof src.showSubtitle === 'boolean'
        ? src.showSubtitle
        : DEFAULT_PUBLIC_CARD_THEME.showSubtitle,
    headerColor: normalizeHexColor(src.headerColor, DEFAULT_PUBLIC_CARD_THEME.headerColor),
    headerHeight: clampNumber(src.headerHeight, DEFAULT_PUBLIC_CARD_THEME.headerHeight, 80, 280),
    logoVisible:
      typeof src.logoVisible === 'boolean'
        ? src.logoVisible
        : DEFAULT_PUBLIC_CARD_THEME.logoVisible,
    logoShape,
    logoSize: clampNumber(src.logoSize, DEFAULT_PUBLIC_CARD_THEME.logoSize, 56, 180),
    logoX: clampNumber(src.logoX, DEFAULT_PUBLIC_CARD_THEME.logoX, 5, 95),
    logoY: clampNumber(src.logoY, DEFAULT_PUBLIC_CARD_THEME.logoY, 10, 130),
    hasCustomLogo:
      typeof src.hasCustomLogo === 'boolean'
        ? src.hasCustomLogo
        : DEFAULT_PUBLIC_CARD_THEME.hasCustomLogo,
    pageBg,
    showLabelPreviewButton:
      typeof src.showLabelPreviewButton === 'boolean'
        ? src.showLabelPreviewButton
        : DEFAULT_PUBLIC_CARD_THEME.showLabelPreviewButton,
    footerNote:
      typeof src.footerNote === 'string' ? src.footerNote.trim().slice(0, 200) : '',
  };
}

export function normalizeOwnerCardOverride(
  raw?: unknown,
): OwnerCardThemeOverride | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  if (src.useGlobalTheme !== false) return null;

  const brandName =
    typeof src.brandName === 'string' && src.brandName.trim().length > 0
      ? src.brandName.trim().slice(0, 60)
      : null;

  const subtitleText =
    typeof src.subtitleText === 'string'
      ? src.subtitleText.trim().slice(0, 80)
      : null;

  const showBrandName =
    typeof src.showBrandName === 'boolean' ? src.showBrandName : null;

  const showSubtitle =
    typeof src.showSubtitle === 'boolean' ? src.showSubtitle : null;

  const headerColor =
    typeof src.headerColor === 'string' && HEX_COLOR_RE.test(src.headerColor.trim())
      ? src.headerColor.trim().toUpperCase()
      : null;

  const headerHeight = clampOptionalInt(src.headerHeight, 80, 280);
  const logoVisible =
    typeof src.logoVisible === 'boolean' ? src.logoVisible : null;

  const logoShape: LogoShape | null =
    src.logoShape === 'circle' ||
    src.logoShape === 'rounded' ||
    src.logoShape === 'square' ||
    src.logoShape === 'none'
      ? src.logoShape
      : null;

  const logoSize = clampOptionalInt(src.logoSize, 56, 180);
  const logoX = clampOptionalInt(src.logoX, 5, 95);
  const logoY = clampOptionalInt(src.logoY, 10, 130);

  const pageBg: PageBackgroundMode | null =
    src.pageBg === 'slate' ||
    src.pageBg === 'white' ||
    src.pageBg === 'warm' ||
    src.pageBg === 'dark'
      ? src.pageBg
      : null;

  const showLabelPreviewButton =
    typeof src.showLabelPreviewButton === 'boolean'
      ? src.showLabelPreviewButton
      : null;

  const footerNote =
    typeof src.footerNote === 'string' ? src.footerNote.trim().slice(0, 200) : null;

  const normalized: OwnerCardThemeOverride = {
    useGlobalTheme: false,
    ...(brandName !== null ? { brandName } : {}),
    ...(subtitleText !== null && subtitleText.length > 0 ? { subtitleText } : {}),
    ...(showBrandName !== null ? { showBrandName } : {}),
    ...(showSubtitle !== null ? { showSubtitle } : {}),
    ...(headerColor !== null ? { headerColor } : {}),
    ...(headerHeight !== null ? { headerHeight } : {}),
    ...(logoVisible !== null ? { logoVisible } : {}),
    ...(logoShape !== null ? { logoShape } : {}),
    ...(logoSize !== null ? { logoSize } : {}),
    ...(logoX !== null ? { logoX } : {}),
    ...(logoY !== null ? { logoY } : {}),
    ...(pageBg !== null ? { pageBg } : {}),
    ...(showLabelPreviewButton !== null ? { showLabelPreviewButton } : {}),
    ...(footerNote !== null ? { footerNote } : {}),
  };

  // Require at least one explicit property beyond useGlobalTheme
  if (Object.keys(normalized).length <= 1) {
    return null;
  }

  return normalized;
}

export function mergeThemeWithOwnerOverride(
  globalTheme: PublicCardTheme,
  override?: OwnerCardThemeOverride | null,
): PublicCardTheme {
  const base = normalizePublicCardTheme(globalTheme);
  const normOverride = normalizeOwnerCardOverride(override);
  if (!normOverride || normOverride.useGlobalTheme) {
    return base;
  }

  return {
    ...base,
    brandName: normOverride.brandName ?? base.brandName,
    subtitleText: normOverride.subtitleText ?? base.subtitleText,
    showBrandName: normOverride.showBrandName ?? base.showBrandName,
    showSubtitle:
      normOverride.showSubtitle ??
      (normOverride.subtitleText ? true : base.showSubtitle),
    headerColor: normOverride.headerColor ?? base.headerColor,
    headerHeight: normOverride.headerHeight ?? base.headerHeight,
    logoVisible: normOverride.logoVisible ?? base.logoVisible,
    logoShape: normOverride.logoShape ?? base.logoShape,
    logoSize: normOverride.logoSize ?? base.logoSize,
    logoX: normOverride.logoX ?? base.logoX,
    logoY: normOverride.logoY ?? base.logoY,
    pageBg: normOverride.pageBg ?? base.pageBg,
    showLabelPreviewButton:
      normOverride.showLabelPreviewButton ?? base.showLabelPreviewButton,
    footerNote: normOverride.footerNote ?? base.footerNote,
  };
}

export function buildOwnerOverrideFromTheme(
  theme: Omit<PublicCardTheme, 'hasCustomLogo'>,
): OwnerCardThemeOverride {
  return {
    useGlobalTheme: false,
    brandName: theme.brandName.trim() || DEFAULT_PUBLIC_CARD_THEME.brandName,
    subtitleText: theme.subtitleText.trim(),
    showBrandName: theme.showBrandName,
    showSubtitle: theme.showSubtitle,
    headerColor: normalizeHexColor(theme.headerColor, DEFAULT_PUBLIC_CARD_THEME.headerColor),
    headerHeight: clampNumber(theme.headerHeight, DEFAULT_PUBLIC_CARD_THEME.headerHeight, 80, 280),
    logoVisible: theme.logoVisible,
    logoShape: theme.logoShape,
    logoSize: clampNumber(theme.logoSize, DEFAULT_PUBLIC_CARD_THEME.logoSize, 56, 180),
    logoX: clampNumber(theme.logoX, DEFAULT_PUBLIC_CARD_THEME.logoX, 5, 95),
    logoY: clampNumber(theme.logoY, DEFAULT_PUBLIC_CARD_THEME.logoY, 10, 130),
    pageBg: theme.pageBg,
    showLabelPreviewButton: theme.showLabelPreviewButton,
    footerNote: theme.footerNote.trim(),
  };
}

export function computeBannerVisuals(hexColor: string): {
  topHex: string;
  bottomHex: string;
  textColor: '#FFFFFF' | '#0F172A';
  subTextColor: string;
} {
  const safeHex = normalizeHexColor(hexColor, DEFAULT_PUBLIC_CARD_THEME.headerColor);
  const r = parseInt(safeHex.slice(1, 3), 16);
  const g = parseInt(safeHex.slice(3, 5), 16);
  const b = parseInt(safeHex.slice(5, 7), 16);

  const darken = (c: number) => Math.max(0, Math.round(c * 0.84));
  const bottomHex = `#${[darken(r), darken(g), darken(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const isLight = luminance > 0.68;

  return {
    topHex: safeHex,
    bottomHex,
    textColor: isLight ? '#0F172A' : '#FFFFFF',
    subTextColor: isLight ? 'rgba(15, 23, 42, 0.78)' : 'rgba(255, 255, 255, 0.88)',
  };
}

export function computeLogoOverhangPx(
  theme: Pick<PublicCardTheme, 'logoVisible' | 'logoY' | 'logoSize' | 'headerHeight'>,
): number {
  if (!theme.logoVisible) return 0;
  const logoCenterY = (theme.logoY / 100) * theme.headerHeight;
  const logoBottom = logoCenterY + theme.logoSize / 2;
  return Math.max(0, Math.round(logoBottom - theme.headerHeight));
}
