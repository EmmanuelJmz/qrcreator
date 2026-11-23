import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Label } from '@/src/components/ui/label';

const VIEWPORT_SIZE = 272;
const OUTPUT_SIZE = 512;

interface CircularLogoCropperDialogProps {
  open: boolean;
  imageSrc: string | null;
  fileName?: string;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void | Promise<void>;
  submitting?: boolean;
}

type CircleFillMode = 'transparent' | 'white';

export function CircularLogoCropperDialog({
  open,
  imageSrc,
  fileName = 'logo-circular.png',
  onCancel,
  onConfirm,
  submitting = false,
}: CircularLogoCropperDialogProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [circleFill, setCircleFill] = useState<CircleFillMode>('transparent');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setNaturalSize(null);
      setLoadError(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setCircleFill('transparent');
    }
  }, [open, imageSrc]);

  // Base scale so zoom = 1 fits the shorter side to the circle diameter (cover)
  const coverScale = naturalSize
    ? Math.max(VIEWPORT_SIZE / naturalSize.width, VIEWPORT_SIZE / naturalSize.height)
    : 1;
  // Contain scale so the whole rectangular image fits inside the circle inscribed square
  const containScale = naturalSize
    ? Math.min(VIEWPORT_SIZE / naturalSize.width, VIEWPORT_SIZE / naturalSize.height)
    : 1;
  const minZoom = Math.min(0.45, Math.max(0.25, (containScale / coverScale) * 0.75));
  const maxZoom = 3.5;

  const currentScale = coverScale * zoom;

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    if (el.naturalWidth > 0 && el.naturalHeight > 0) {
      setNaturalSize({ width: el.naturalWidth, height: el.naturalHeight });
      setLoadError(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!naturalSize || submitting) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({
      x: dragRef.current.originX + dx,
      y: dragRef.current.originY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!naturalSize || submitting) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setZoom((prev) => Number(Math.min(maxZoom, Math.max(minZoom, prev + delta)).toFixed(2)));
  };

  const handleFitInside = () => {
    if (!naturalSize) return;
    // Scale slightly smaller (0.82) so corners of square logos fit comfortably inside the circle
    const fitZoom = Math.max(minZoom, (containScale / coverScale) * 0.82);
    setZoom(Number(fitZoom.toFixed(2)));
    setOffset({ x: 0, y: 0 });
  };

  const handleFillCircle = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img || !naturalSize) return;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = OUTPUT_SIZE / VIEWPORT_SIZE;
    const radius = OUTPUT_SIZE / 2;

    ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (circleFill === 'white') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    }

    const drawW = naturalSize.width * currentScale * ratio;
    const drawH = naturalSize.height * currentScale * ratio;
    const drawX = radius + offset.x * ratio - drawW / 2;
    const drawY = radius + offset.y * ratio - drawH / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png');
    });

    if (!blob) {
      setLoadError('No se pudo generar la imagen recortada.');
      return;
    }

    const cleanBase = fileName.replace(/\.[^.]+$/, '') || 'logo';
    const croppedFile = new File([blob], `${cleanBase}-circular.png`, {
      type: 'image/png',
    });
    await onConfirm(croppedFile);
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !submitting && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recortar logo en círculo</DialogTitle>
          <DialogDescription>
            Arrastra la imagen y ajusta el zoom para encuadrar el logo dentro del círculo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loadError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {loadError}
            </div>
          )}

          {/* Circular Crop Viewport */}
          <div className="flex justify-center">
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
              className="relative rounded-xl border border-slate-200 overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing"
              style={{
                width: VIEWPORT_SIZE,
                height: VIEWPORT_SIZE,
                backgroundColor: circleFill === 'white' ? '#FFFFFF' : '#F1F5F9',
                backgroundImage:
                  circleFill === 'transparent'
                    ? 'linear-gradient(45deg, #E2E8F0 25%, transparent 25%), linear-gradient(-45deg, #E2E8F0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #E2E8F0 75%), linear-gradient(-45deg, transparent 75%, #E2E8F0 75%)'
                    : undefined,
                backgroundSize: circleFill === 'transparent' ? '16px 16px' : undefined,
                backgroundPosition:
                  circleFill === 'transparent'
                    ? '0 0, 0 8px, 8px -8px, -8px 0px'
                    : undefined,
              }}
            >
              {imageSrc && (
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Vista previa de recorte"
                  referrerPolicy="no-referrer"
                  onLoad={handleImageLoad}
                  onError={() =>
                    setLoadError('No se pudo cargar la imagen seleccionada.')
                  }
                  draggable={false}
                  className="pointer-events-none select-none max-w-none absolute left-1/2 top-1/2"
                  style={
                    naturalSize
                      ? {
                          width: `${naturalSize.width * currentScale}px`,
                          height: `${naturalSize.height * currentScale}px`,
                          transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                        }
                      : { opacity: 0 }
                  }
                />
              )}

              {/* Circular mask overlay showing exact crop */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/90"
                style={{
                  boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.52)',
                }}
              />
            </div>
          </div>

          {/* Zoom Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="crop-zoom-range" className="text-xs">
                Tamaño de la imagen (zoom)
              </Label>
              <span className="text-xs font-mono tabular-nums text-slate-600">
                {zoomPercent}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Number(Math.max(minZoom, z - 0.1).toFixed(2)))
                }
                disabled={submitting}
                aria-label="Alejar"
                className="h-9 w-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <input
                id="crop-zoom-range"
                type="range"
                min={minZoom}
                max={maxZoom}
                step={0.02}
                value={zoom}
                disabled={submitting}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Number(Math.min(maxZoom, z + 0.1).toFixed(2)))
                }
                disabled={submitting}
                aria-label="Acercar"
                className="h-9 w-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quick Fit + Background */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleFitInside}
                disabled={submitting || !naturalSize}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span>Ajustar</span>
              </button>
              <button
                type="button"
                onClick={handleFillCircle}
                disabled={submitting || !naturalSize}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Llenar</span>
              </button>
              <button
                type="button"
                onClick={() => setOffset({ x: 0, y: 0 })}
                disabled={submitting || !naturalSize}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Centrar</span>
              </button>
            </div>

            <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 text-xs">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setCircleFill('transparent')}
                className={`px-2 py-1 rounded-md font-medium cursor-pointer transition-colors whitespace-nowrap ${
                  circleFill === 'transparent'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Transparente
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setCircleFill('white')}
                className={`px-2 py-1 rounded-md font-medium cursor-pointer transition-colors whitespace-nowrap ${
                  circleFill === 'white'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Fondo blanco
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting || !naturalSize || Boolean(loadError)}
          >
            {submitting ? 'Subiendo...' : 'Recortar y usar logo'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
