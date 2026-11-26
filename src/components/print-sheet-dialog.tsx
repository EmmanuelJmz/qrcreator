import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Download,
  FileImage,
  FileText,
  Loader2,
  Printer,
  Smartphone,
  Square,
} from 'lucide-react';
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
  type PrintSheetFormat,
  type PrintSheetSizeMode,
  type SheetPaperSize,
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

function triggerBlobDownload(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'sticker'
  );
}

export function PrintSheetDialog({
  open,
  selectedOwners,
  onClose,
  onGenerated,
}: PrintSheetDialogProps) {
  const count = selectedOwners.length;

  const [printMode, setPrintMode] = useState<'single' | 'sheet'>('single');
  const [sheetPaper, setSheetPaper] = useState<SheetPaperSize>('letter');
  const [sizeMode, setSizeMode] = useState<PrintSheetSizeMode>('exact');
  const [exactSizeCm, setExactSizeCm] = useState<number>(5.0);
  const [columns, setColumns] = useState<number>(3);
  const [gapSize, setGapSize] = useState<'normal' | 'compact'>('normal');
  const [cutGuides, setCutGuides] = useState<boolean>(false);
  const [cutGuideShape, setCutGuideShape] = useState<CutGuideShape>('circle');
  const [format, setFormat] = useState<PrintSheetFormat>('png');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowAdvanced(false);
    setSizeMode('exact');
    setCutGuideShape('circle');
    if (selectedOwners.length <= 1) {
      setPrintMode('single');
      setFormat('png');
      setCutGuides(false);
    } else {
      setPrintMode('sheet');
      setSheetPaper('letter');
      setFormat('pdf');
      setCutGuides(true);
    }
  }, [open, selectedOwners.length]);

  const exceedsLimit = count > MAX_SHEET_LABELS;
  const safeExactCm = Number.isFinite(exactSizeCm)
    ? Math.min(12, Math.max(2, exactSizeCm))
    : 5.0;

  const exactCapacity = useMemo(
    () =>
      computeExactSheetCapacity({
        paperSize: sheetPaper,
        exactSizeCm: safeExactCm,
        gapSize,
        requestedColumns: columns,
      }),
    [sheetPaper, safeExactCm, gapSize, columns],
  );

  const effectiveCols = sizeMode === 'exact' ? exactCapacity.cols : columns;
  const exactTotalPages =
    count > 0 ? Math.ceil(count / Math.max(1, exactCapacity.perPage)) : 1;

  const availableCols =
    sizeMode === 'exact'
      ? Array.from({ length: Math.min(4, exactCapacity.maxCols) }, (_, i) => i + 1)
      : [2, 3, 4];

  const handleModeSwitch = (next: 'single' | 'sheet') => {
    setPrintMode(next);
    if (next === 'single') {
      setSizeMode('exact');
      setFormat('png');
      setCutGuides(false);
    } else {
      setFormat('pdf');
      setCutGuides(true);
    }
  };

  const handleExactCmChange = (nextCm: number) => {
    setExactSizeCm(nextCm);
    const nextCap = computeExactSheetCapacity({
      paperSize: sheetPaper,
      exactSizeCm: Math.min(12, Math.max(2, nextCm)),
      gapSize,
    });
    setColumns(nextCap.maxCols);
  };

  const handleSheetPaperChange = (nextPaper: SheetPaperSize) => {
    setSheetPaper(nextPaper);
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
      const sizeLabel = `${safeExactCm.toFixed(1)}cm`;

      if (printMode === 'single') {
        if (format === 'png') {
          for (const owner of selectedOwners) {
            const blob = await apiClient.generatePrintSheet({
              ownerIds: [owner.id],
              paperSize: 'single',
              columns: 1,
              cutGuides,
              gapSize: 'normal',
              sizeMode: 'exact',
              exactSizeCm: safeExactCm,
              cutGuideShape,
              format: 'png',
            });
            const fileName =
              count === 1
                ? `sticker-${slugifyName(owner.fullName)}-${sizeLabel}.png`
                : `sticker-${slugifyName(owner.fullName)}-${sizeLabel}.png`;
            triggerBlobDownload(blob, fileName);
          }

          onGenerated(
            count === 1
              ? `Imagen cuadrada PNG de ${safeExactCm.toFixed(1)} × ${safeExactCm.toFixed(1)} cm descargada lista para mini impresora.`
              : `Se descargaron ${count} imágenes cuadradas PNG (${safeExactCm.toFixed(1)} × ${safeExactCm.toFixed(1)} cm) listas para mini impresora.`,
          );
          onClose();
          return;
        }

        const pdfBlob = await apiClient.generatePrintSheet({
          ownerIds: selectedOwners.map((o) => o.id),
          paperSize: 'single',
          columns: 1,
          cutGuides,
          gapSize: 'normal',
          sizeMode: 'exact',
          exactSizeCm: safeExactCm,
          cutGuideShape,
          format: 'pdf',
        });
        triggerBlobDownload(
          pdfBlob,
          count === 1
            ? `sticker-${slugifyName(selectedOwners[0].fullName)}-${sizeLabel}.pdf`
            : `stickers-${sizeLabel}.pdf`,
        );
        onGenerated(
          `PDF tamaño sticker (${safeExactCm.toFixed(1)} × ${safeExactCm.toFixed(1)} cm, ${count} ${count === 1 ? 'página' : 'páginas'}) descargado.`,
        );
        onClose();
        return;
      }

      const blob = await apiClient.generatePrintSheet({
        ownerIds: selectedOwners.map((o) => o.id),
        paperSize: sheetPaper,
        columns: effectiveCols,
        cutGuides,
        gapSize,
        sizeMode,
        exactSizeCm: safeExactCm,
        cutGuideShape,
        format,
      });

      const ext = format === 'pdf' ? 'pdf' : 'png';
      triggerBlobDownload(blob, `hoja-etiquetas-${sheetPaper}.${ext}`);

      onGenerated(
        `Hoja de impresión ${ext.toUpperCase()} (${sheetPaper === 'letter' ? 'Carta' : 'Tabloide'}${
          sizeMode === 'exact' ? ` · ${safeExactCm.toFixed(1)} cm reales` : ''
        }) con ${count} ${count === 1 ? 'etiqueta' : 'etiquetas'} descargada.`,
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo generar el archivo para imprimir.',
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !generating && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-blue-600" />
            <span>Imprimir etiquetas</span>
          </DialogTitle>
          <DialogDescription>
            Elige si vas a imprimir en una mini impresora portátil o en una hoja tamaño Carta/Tabloide.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {exceedsLimit && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
            >
              Puedes incluir máximo {MAX_SHEET_LABELS} etiquetas a la vez. Reduce tu selección antes de descargar.
            </div>
          )}

          {/* 1. Tipo de impresora */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-slate-700">
              1. ¿Dónde vas a imprimir?
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleModeSwitch('single')}
                className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                  printMode === 'single'
                    ? 'border-blue-600 bg-blue-50/70 text-slate-900 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>Mini impresora / 1 sticker</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Genera 1 imagen o PDF cuadrado del tamaño exacto del sticker (sin hoja Carta).
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleModeSwitch('sheet')}
                className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                  printMode === 'sheet'
                    ? 'border-blue-600 bg-blue-50/70 text-slate-900 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Printer className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>Hoja Carta / Tabloide</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Acomoda varios stickers juntos en una hoja de impresora normal.
                </p>
              </button>
            </div>
          </div>

          {/* 2. Medida física */}
          {(printMode === 'single' || sizeMode === 'exact') && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  2. Tamaño del sticker
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
                      className={`rounded-lg border px-2 py-2 text-center transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-600 bg-blue-50/70 text-blue-700 ring-1 ring-blue-600'
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
                    aria-label="Otra medida en centímetros"
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

          {/* Papel solo en modo Hoja */}
          {printMode === 'sheet' && (
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-700">
                Tamaño de hoja
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSheetPaperChange('letter')}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                    sheetPaper === 'letter'
                      ? 'border-blue-600 bg-blue-50/70 text-slate-900 ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-medium">Carta</p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {exactCapacity.perPage > 0 ? `Caben ${exactCapacity.cols * exactCapacity.rowsPerPage}/hoja` : '21.6 × 27.9 cm'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => handleSheetPaperChange('tabloid')}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                    sheetPaper === 'tabloid'
                      ? 'border-blue-600 bg-blue-50/70 text-slate-900 ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-medium">Tabloide</p>
                  <p className="text-[11px] text-slate-500 font-mono">27.9 × 43.2 cm</p>
                </button>
              </div>
            </div>
          )}

          {/* 3. Formato */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-slate-700">
              {printMode === 'single' ? '3. Formato para tu mini impresora' : '3. Formato de descarga'}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('png')}
                className={`rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                  format === 'png'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-700 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <FileImage className="h-3.5 w-3.5 shrink-0" />
                  <span>Imagen PNG</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {printMode === 'single'
                    ? 'Ideal para apps de mini impresora'
                    : '1 sola página en imagen'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                  format === 'pdf'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-700 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span>PDF 1:1 exacto</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {printMode === 'single'
                    ? 'Tamaño real del sticker'
                    : `${exactTotalPages} ${exactTotalPages === 1 ? 'página exacta' : 'páginas exactas'}`}
                </p>
              </button>
            </div>
          </div>

          {/* Línea de corte simple */}
          <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 cursor-pointer hover:bg-slate-50/60">
            <input
              type="checkbox"
              checked={cutGuides}
              onChange={(e) => setCutGuides(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            <span className="text-xs font-medium text-slate-800">
              Incluir línea guía para recortar o centrar la gota
            </span>
          </label>

          {/* Opciones avanzadas colapsadas (solo en modo Hoja) */}
          {printMode === 'sheet' && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/70">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <span>Opciones avanzadas (columnas, espaciado, ajuste)</span>
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showAdvanced && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-200 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSizeMode('exact')}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                        sizeMode === 'exact'
                          ? 'border-blue-600 bg-white text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      Medida exacta (cm)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSizeMode('auto');
                        if (columns < 2) setColumns(3);
                      }}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                        sizeMode === 'auto'
                          ? 'border-blue-600 bg-white text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      Ajustar a columnas
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="block text-[11px] font-medium text-slate-600">
                        Columnas
                      </span>
                      <div
                        className="grid gap-1"
                        style={{ gridTemplateColumns: `repeat(${availableCols.length}, minmax(0, 1fr))` }}
                      >
                        {availableCols.map((col) => (
                          <button
                            key={col}
                            type="button"
                            onClick={() => setColumns(col)}
                            className={`rounded border py-1 text-xs font-mono cursor-pointer ${
                              effectiveCols === col
                                ? 'border-blue-600 bg-white text-blue-700 font-semibold'
                                : 'border-slate-200 bg-white text-slate-600'
                            }`}
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="block text-[11px] font-medium text-slate-600">
                        Espaciado
                      </span>
                      <div className="grid grid-cols-2 gap-1">
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
                            className={`rounded border py-1 text-xs cursor-pointer ${
                              gapSize === opt.id
                                ? 'border-blue-600 bg-white text-blue-700 font-semibold'
                                : 'border-slate-200 bg-white text-slate-600'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {cutGuides && (
                    <div className="space-y-1">
                      <span className="block text-[11px] font-medium text-slate-600">
                        Forma de guía
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCutGuideShape('circle')}
                          className={`rounded border py-1.5 text-xs inline-flex items-center justify-center gap-1 cursor-pointer ${
                            cutGuideShape === 'circle'
                              ? 'border-blue-600 bg-white text-blue-700 font-semibold'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          <Circle className="h-3 w-3" />
                          <span>Círculo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCutGuideShape('rect')}
                          className={`rounded border py-1.5 text-xs inline-flex items-center justify-center gap-1 cursor-pointer ${
                            cutGuideShape === 'rect'
                              ? 'border-blue-600 bg-white text-blue-700 font-semibold'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          <Square className="h-3 w-3" />
                          <span>Cuadro</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {printMode === 'single' && count > 1 && format === 'png' && (
            <p className="text-xs text-slate-500">
              Tienes {count} etiquetas seleccionadas: se descargará 1 imagen PNG cuadrada por cada una.
            </p>
          )}

          {printMode === 'sheet' && sizeMode === 'exact' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900">
              Imprime en <strong>Tamaño real / 100%</strong> (sin ajustar a página). Incluye barra de prueba de <strong>5.0 cm</strong> abajo.
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
                  <span>Generando...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>
                    {printMode === 'single'
                      ? count > 1 && format === 'png'
                        ? `Descargar ${count} imágenes PNG`
                        : `Descargar sticker ${format.toUpperCase()}`
                      : `Descargar hoja ${format.toUpperCase()}`}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
