import React, { useMemo, useState } from 'react';
import { Circle, Download, Loader2, Printer, Ruler, Square } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { apiClient, ApiError, type OwnerSummary } from '@/src/lib/api-client';
import {
  computeExactSheetCapacity,
  type CutGuideShape,
  type PaperSize,
  type PrintSheetFormat,
  type PrintSheetSizeMode,
} from '@/src/lib/print-sheet-layout';

interface PrintSheetDialogProps {
  open: boolean;
  selectedOwners: OwnerSummary[];
  onClose: () => void;
  onGenerated: (message: string) => void;
}

const MAX_SHEET_LABELS = 20;
const SIZE_PRESETS_CM = [
  { value: 4.5, label: '4.5 cm', hint: 'Interior' },
  { value: 4.8, label: '4.8 cm', hint: 'Holgura' },
  { value: 5.0, label: '5.0 cm', hint: 'Gota 5 cm' },
] as const;

export function PrintSheetDialog({
  open,
  selectedOwners,
  onClose,
  onGenerated,
}: PrintSheetDialogProps) {
  const [paperSize, setPaperSize] = useState<PaperSize>('letter');
  const [sizeMode, setSizeMode] = useState<PrintSheetSizeMode>('exact');
  const [exactSizeCm, setExactSizeCm] = useState<number>(5.0);
  const [columns, setColumns] = useState<number>(3);
  const [gapSize, setGapSize] = useState<'normal' | 'compact'>('normal');
  const [cutGuides, setCutGuides] = useState<boolean>(true);
  const [cutGuideShape, setCutGuideShape] = useState<CutGuideShape>('circle');
  const [format, setFormat] = useState<PrintSheetFormat>('pdf');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = selectedOwners.length;
  const exceedsLimit = count > MAX_SHEET_LABELS;
  const safeExactCm = Number.isFinite(exactSizeCm)
    ? Math.min(12, Math.max(2, exactSizeCm))
    : 5.0;

  const exactCapacity = useMemo(
    () =>
      computeExactSheetCapacity({
        paperSize,
        exactSizeCm: safeExactCm,
        gapSize,
        requestedColumns: columns,
      }),
    [paperSize, safeExactCm, gapSize, columns],
  );

  const effectiveCols = sizeMode === 'exact' ? exactCapacity.cols : columns;
  const autoRows = count > 0 ? Math.ceil(count / effectiveCols) : 0;
  const exactTotalPages =
    count > 0 ? Math.ceil(count / Math.max(1, exactCapacity.perPage)) : 1;

  const availableCols =
    sizeMode === 'exact'
      ? Array.from({ length: Math.min(4, exactCapacity.maxCols) }, (_, i) => i + 1)
      : [2, 3, 4];

  const handleExactCmChange = (nextCm: number) => {
    setExactSizeCm(nextCm);
    const nextCap = computeExactSheetCapacity({
      paperSize,
      exactSizeCm: Math.min(12, Math.max(2, nextCm)),
      gapSize,
    });
    setColumns(nextCap.maxCols);
  };

  const handlePaperSizeChange = (nextPaper: PaperSize) => {
    setPaperSize(nextPaper);
    if (sizeMode === 'exact') {
      const nextCap = computeExactSheetCapacity({
        paperSize: nextPaper,
        exactSizeCm: safeExactCm,
        gapSize,
      });
      setColumns((prev) => Math.min(prev, nextCap.maxCols));
    }
  };

  const handleGenerate = async () => {
    if (count === 0 || exceedsLimit) return;
    setGenerating(true);
    setError(null);
    try {
      const blob = await apiClient.generatePrintSheet({
        ownerIds: selectedOwners.map((o) => o.id),
        paperSize,
        columns: effectiveCols,
        cutGuides,
        gapSize,
        sizeMode,
        exactSizeCm: safeExactCm,
        cutGuideShape,
        format,
      });

      const ext = format === 'pdf' ? 'pdf' : 'png';
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `hoja-etiquetas-${paperSize}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      onGenerated(
        `Hoja de impresión ${ext.toUpperCase()} (${paperSize === 'letter' ? 'Carta' : 'Tabloide'}${
          sizeMode === 'exact' ? ` · ${safeExactCm.toFixed(1)} cm reales` : ''
        }) con ${count} ${count === 1 ? 'etiqueta' : 'etiquetas'} descargada.`,
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo armar la hoja de impresión.',
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !generating && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-blue-600" />
            <span>Armar hoja para imprimir</span>
          </DialogTitle>
          <DialogDescription>
            Imprime tus stickers a medida física exacta en centímetros (ideal para gotas de resina de 5 cm) o ajustados por columnas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-600">
              <strong className="font-mono tabular-nums text-slate-900">{count}</strong>{' '}
              {count === 1 ? 'etiqueta seleccionada' : 'etiquetas seleccionadas'}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              {sizeMode === 'exact'
                ? `Caben ${exactCapacity.cols} × ${exactCapacity.rowsPerPage} = ${exactCapacity.perPage}/hoja · ${
                    format === 'pdf'
                      ? `${exactTotalPages} ${exactTotalPages === 1 ? 'pág. PDF' : 'págs. PDF'}`
                      : '1 hoja PNG'
                  }`
                : `Cuadrícula ${effectiveCols} × ${autoRows}`}
            </span>
          </div>

          {exceedsLimit && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
            >
              Puedes incluir máximo {MAX_SHEET_LABELS} etiquetas por hoja. Reduce tu selección antes de descargar.
            </div>
          )}

          {/* Modo de tamaño */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-slate-700">
              Modo de tamaño
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSizeMode('exact')}
                className={`rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                  sizeMode === 'exact'
                    ? 'border-blue-600 bg-blue-50/70 text-slate-900 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Ruler className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span>Tamaño exacto (cm)</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Escala 1:1 para gotas o círculos de 4.5 a 5.0 cm.
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSizeMode('auto');
                  if (columns < 2) setColumns(3);
                }}
                className={`rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                  sizeMode === 'auto'
                    ? 'border-blue-600 bg-blue-50/70 text-slate-900 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <p className="text-xs font-semibold">Ajuste automático</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Estira las etiquetas al ancho de las columnas.
                </p>
              </button>
            </div>
          </div>

          {/* Medida física en cm */}
          {sizeMode === 'exact' && (
            <div className="rounded-lg border border-blue-200/80 bg-blue-50/40 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  Medida física de cada sticker (diámetro / lado)
                </span>
                <span className="text-xs font-mono font-semibold text-blue-700">
                  {safeExactCm.toFixed(1)} × {safeExactCm.toFixed(1)} cm
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {SIZE_PRESETS_CM.map((preset) => {
                  const active = Math.abs(safeExactCm - preset.value) < 0.05;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => handleExactCmChange(preset.value)}
                      className={`rounded-lg border px-2 py-1.5 text-center transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-600 bg-white text-blue-700 ring-1 ring-blue-600'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-xs font-mono font-semibold">{preset.label}</p>
                      <p className="text-[10px] text-slate-500">{preset.hint}</p>
                    </button>
                  );
                })}
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={2}
                    max={12}
                    step={0.1}
                    value={exactSizeCm}
                    aria-label="Medida personalizada en centímetros"
                    onChange={(e) => {
                      const parsed = Number.parseFloat(e.target.value);
                      if (!Number.isNaN(parsed)) {
                        handleExactCmChange(parsed);
                      }
                    }}
                    className="h-full text-xs font-mono text-center px-1.5"
                  />
                  <span className="text-xs text-slate-500 shrink-0">cm</span>
                </div>
              </div>
            </div>
          )}

          {/* Tamaño de papel */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-slate-700">
              Tamaño de hoja
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handlePaperSizeChange('letter')}
                className={`rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                  paperSize === 'letter'
                    ? 'border-blue-600 bg-blue-50/70 text-slate-900 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <p className="text-sm font-medium">Carta</p>
                <p className="text-xs text-slate-500 font-mono">21.59 × 27.94 cm</p>
              </button>
              <button
                type="button"
                onClick={() => handlePaperSizeChange('tabloid')}
                className={`rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                  paperSize === 'tabloid'
                    ? 'border-blue-600 bg-blue-50/70 text-slate-900 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <p className="text-sm font-medium">Tabloide</p>
                <p className="text-xs text-slate-500 font-mono">27.94 × 43.18 cm</p>
              </button>
            </div>
          </div>

          {/* Columnas y Espaciado */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-700">
                Columnas {sizeMode === 'exact' ? `(máx. ${exactCapacity.maxCols})` : ''}
              </span>
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${availableCols.length}, minmax(0, 1fr))` }}
              >
                {availableCols.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setColumns(col)}
                    className={`rounded-lg border py-2 text-sm font-mono font-medium transition-colors cursor-pointer ${
                      effectiveCols === col
                        ? 'border-blue-600 bg-blue-50/70 text-blue-700 ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {col}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-700">
                Espaciado
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'normal', label: 'Normal' },
                    { id: 'compact', label: 'Compacto' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setGapSize(opt.id)}
                    className={`rounded-lg border py-2 text-xs font-medium transition-colors cursor-pointer ${
                      gapSize === opt.id
                        ? 'border-blue-600 bg-blue-50/70 text-blue-700 ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Formato de archivo y Forma de guía de corte */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-700">
                Formato de descarga
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setFormat('pdf')}
                  className={`rounded-lg border py-2 px-2 text-xs font-medium transition-colors cursor-pointer ${
                    format === 'pdf'
                      ? 'border-blue-600 bg-blue-50/70 text-blue-700 ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  PDF (1:1 exacto)
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('png')}
                  className={`rounded-lg border py-2 px-2 text-xs font-medium transition-colors cursor-pointer ${
                    format === 'png'
                      ? 'border-blue-600 bg-blue-50/70 text-blue-700 ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  PNG (300 DPI)
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-700">
                Forma de guía de corte
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={!cutGuides}
                  onClick={() => setCutGuideShape('circle')}
                  className={`rounded-lg border py-2 px-2 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                    cutGuideShape === 'circle'
                      ? 'border-blue-600 bg-blue-50/70 text-blue-700 ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Circle className="h-3.5 w-3.5" />
                  <span>Círculo</span>
                </button>
                <button
                  type="button"
                  disabled={!cutGuides}
                  onClick={() => setCutGuideShape('rect')}
                  className={`rounded-lg border py-2 px-2 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                    cutGuideShape === 'rect'
                      ? 'border-blue-600 bg-blue-50/70 text-blue-700 ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Square className="h-3.5 w-3.5" />
                  <span>Cuadro</span>
                </button>
              </div>
            </div>
          </div>

          {/* Guías de corte */}
          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 cursor-pointer hover:bg-slate-50/60">
            <input
              type="checkbox"
              checked={cutGuides}
              onChange={(e) => setCutGuides(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            <div className="text-xs">
              <span className="font-medium text-slate-800">
                Incluir guías y marcas de corte
              </span>
              <p className="text-slate-500 mt-0.5">
                Dibuja contornos {cutGuideShape === 'circle' ? 'circulares' : 'rectangulares'} y marcas de alineación para recortar o pegar la gota con exactitud.
              </p>
            </div>
          </label>

          {sizeMode === 'exact' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900">
              Al imprimir, elige <strong>Tamaño real / Escala 100%</strong> (sin &ldquo;Ajustar a página&rdquo;). El archivo incluye una barra de calibración de <strong>5.0 cm</strong> abajo para verificar con regla.
              {format === 'png' && count > exactCapacity.perPage && (
                <span className="block mt-1 font-medium text-amber-950">
                  Nota: El formato PNG genera 1 página ({exactCapacity.perPage} etiquetas máx.). Usa PDF para descargar las {exactTotalPages} páginas completas.
                </span>
              )}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={generating}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating || count === 0 || exceedsLimit}
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Generando hoja...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Descargar hoja {format.toUpperCase()}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

