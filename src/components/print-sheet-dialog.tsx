import React, { useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { apiClient, ApiError, type OwnerSummary } from '@/src/lib/api-client';

interface PrintSheetDialogProps {
  open: boolean;
  selectedOwners: OwnerSummary[];
  onClose: () => void;
  onGenerated: (message: string) => void;
}

const MAX_SHEET_LABELS = 20;

export function PrintSheetDialog({
  open,
  selectedOwners,
  onClose,
  onGenerated,
}: PrintSheetDialogProps) {
  const [paperSize, setPaperSize] = useState<'letter' | 'tabloid'>('letter');
  const [columns, setColumns] = useState<number>(3);
  const [gapSize, setGapSize] = useState<'normal' | 'compact'>('normal');
  const [cutGuides, setCutGuides] = useState<boolean>(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = selectedOwners.length;
  const rows = count > 0 ? Math.ceil(count / columns) : 0;
  const exceedsLimit = count > MAX_SHEET_LABELS;

  const handleGenerate = async () => {
    if (count === 0 || exceedsLimit) return;
    setGenerating(true);
    setError(null);
    try {
      const blob = await apiClient.generatePrintSheet({
        ownerIds: selectedOwners.map((o) => o.id),
        paperSize,
        columns,
        cutGuides,
        gapSize,
      });

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `hoja-etiquetas-${paperSize}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      onGenerated(
        `Hoja de impresión (${paperSize === 'letter' ? 'Carta' : 'Tabloide'}) con ${count} ${count === 1 ? 'etiqueta' : 'etiquetas'} descargada.`,
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-blue-600" />
            <span>Armar hoja para imprimir</span>
          </DialogTitle>
          <DialogDescription>
            Genera una imagen PNG lista para imprenta o impresora con varias etiquetas QR acomodadas en cuadrícula.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-600">
              <strong className="font-mono tabular-nums text-slate-900">{count}</strong>{' '}
              {count === 1 ? 'etiqueta seleccionada' : 'etiquetas seleccionadas'}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Cuadrícula {columns} × {rows}
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

          {/* Tamaño de papel */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-slate-700">
              Tamaño de hoja
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaperSize('letter')}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                  paperSize === 'letter'
                    ? 'border-blue-600 bg-blue-50/70 text-slate-900 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <p className="text-sm font-medium">Carta</p>
                <p className="text-xs text-slate-500 font-mono">8.5 × 11&quot; (1275×1650 px)</p>
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('tabloid')}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                  paperSize === 'tabloid'
                    ? 'border-blue-600 bg-blue-50/70 text-slate-900 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <p className="text-sm font-medium">Tabloide</p>
                <p className="text-xs text-slate-500 font-mono">11 × 17&quot; (1650×2550 px)</p>
              </button>
            </div>
          </div>

          {/* Columnas y Espaciado */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-700">
                Columnas
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {[2, 3, 4].map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setColumns(col)}
                    className={`rounded-lg border py-2 text-sm font-mono font-medium transition-colors cursor-pointer ${
                      columns === col
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
                Dibuja bordes punteados y cruces en las esquinas para recortar con exactitud.
              </p>
            </div>
          </label>

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
                  <span>Descargar hoja PNG</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
