export type SheetPaperSize = 'letter' | 'tabloid';
export type PaperSize = 'single' | SheetPaperSize;
export type PrintSheetSizeMode = 'auto' | 'exact';
export type CutGuideShape = 'rect' | 'circle';
export type PrintSheetFormat = 'png' | 'pdf';
export type PrintSheetGap = 'compact' | 'normal';

export const CM_TO_PT = 72 / 2.54;

export const PAPER_DIMENSIONS_CM: Record<
  SheetPaperSize,
  { widthCm: number; heightCm: number; label: string }
> = {
  letter: {
    widthCm: 21.59,
    heightCm: 27.94,
    label: 'Carta (21.59 × 27.94 cm)',
  },
  tabloid: {
    widthCm: 27.94,
    heightCm: 43.18,
    label: 'Tabloide (27.94 × 43.18 cm)',
  },
};

export function cmToPt(cm: number): number {
  return cm * CM_TO_PT;
}

export function cmToPx(cm: number, dpi = 300): number {
  return Math.max(1, Math.round((cm / 2.54) * dpi));
}

export interface ExactSheetCapacity {
  maxCols: number;
  maxRows: number;
  cols: number;
  rowsPerPage: number;
  perPage: number;
  marginCm: number;
  gapCm: number;
  usableWidthCm: number;
  usableHeightCm: number;
}

export function computeExactSheetCapacity(params: {
  paperSize: SheetPaperSize;
  exactSizeCm: number;
  gapSize: PrintSheetGap;
  requestedColumns?: number;
}): ExactSheetCapacity {
  const paper = PAPER_DIMENSIONS_CM[params.paperSize];
  const marginCm = 0.85;
  const calibrationReserveCm = 0.85;
  const gapCm = params.gapSize === 'compact' ? 0.25 : 0.5;
  const safeSizeCm = Math.min(12, Math.max(2, params.exactSizeCm));

  const usableWidthCm = Math.max(safeSizeCm, paper.widthCm - marginCm * 2);
  const usableHeightCm = Math.max(
    safeSizeCm,
    paper.heightCm - marginCm * 2 - calibrationReserveCm,
  );

  const maxCols = Math.max(
    1,
    Math.floor((usableWidthCm + gapCm + 1e-6) / (safeSizeCm + gapCm)),
  );
  const maxRows = Math.max(
    1,
    Math.floor((usableHeightCm + gapCm + 1e-6) / (safeSizeCm + gapCm)),
  );

  const cols = params.requestedColumns
    ? Math.max(1, Math.min(maxCols, Math.round(params.requestedColumns)))
    : maxCols;

  return {
    maxCols,
    maxRows,
    cols,
    rowsPerPage: maxRows,
    perPage: cols * maxRows,
    marginCm,
    gapCm,
    usableWidthCm,
    usableHeightCm,
  };
}
