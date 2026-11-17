import React, { useCallback, useEffect, useRef } from 'react';
import { Move } from 'lucide-react';
import { ProtectedImage } from '@/src/components/protected-image';
import {
  clampSquareLabelGeometry,
  computeSquareHeightPct,
  getMaxSquareWidthPct,
  round2,
  type LabelGeometry,
} from '@/src/lib/qr-geometry';

interface QRLabelCanvasProps {
  templateImageUrl: string;
  templateName: string;
  templateWidth: number;
  templateHeight: number;
  qrSvg: string;
  geometry: LabelGeometry;
  onChange: (next: LabelGeometry) => void;
  disabled?: boolean;
}

const MemoTemplateImage = React.memo(function MemoTemplateImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return (
    <ProtectedImage
      src={src}
      alt={alt}
      draggable={false}
      className="block w-full h-auto select-none pointer-events-none"
    />
  );
});

const MemoQrGraphic = React.memo(function MemoQrGraphic({
  qrSvg,
}: {
  qrSvg: string;
}) {
  return (
    <div
      className="w-full h-full bg-white [&_svg]:w-full [&_svg]:h-full [&_svg]:block pointer-events-none select-none"
      dangerouslySetInnerHTML={{ __html: qrSvg }}
    />
  );
});

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export function QRLabelCanvas({
  templateImageUrl,
  templateName,
  templateWidth,
  templateHeight,
  qrSvg,
  geometry,
  onChange,
  disabled = false,
}: QRLabelCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const qrBoxRef = useRef<HTMLDivElement>(null);
  const liveGeomRef = useRef<LabelGeometry>(geometry);
  const rafRef = useRef<number | null>(null);

  const dragStateRef = useRef<{
    active: boolean;
    mode: DragMode;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startGeom: LabelGeometry;
    stageRect: DOMRect;
  } | null>(null);

  useEffect(() => {
    liveGeomRef.current = geometry;
    if (qrBoxRef.current) {
      qrBoxRef.current.style.left = `${geometry.x}%`;
      qrBoxRef.current.style.top = `${geometry.y}%`;
      qrBoxRef.current.style.width = `${geometry.width}%`;
      qrBoxRef.current.style.height = `${geometry.height}%`;
    }
  }, [geometry]);

  const applyBoxDomStyle = useCallback((geom: LabelGeometry) => {
    if (!qrBoxRef.current) return;
    qrBoxRef.current.style.left = `${geom.x}%`;
    qrBoxRef.current.style.top = `${geom.y}%`;
    qrBoxRef.current.style.width = `${geom.width}%`;
    qrBoxRef.current.style.height = `${geom.height}%`;
  }, []);

  const startInteraction = useCallback(
    (mode: DragMode, e: React.PointerEvent<HTMLElement>) => {
      if (disabled || !stageRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const stageRect = stageRef.current.getBoundingClientRect();
      if (stageRect.width <= 0 || stageRect.height <= 0) return;

      e.currentTarget.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        active: true,
        mode,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startGeom: { ...liveGeomRef.current },
        stageRect,
      };
    },
    [disabled],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const state = dragStateRef.current;
      if (!state || !state.active || state.pointerId !== e.pointerId) return;

      const deltaXPct = ((e.clientX - state.startClientX) / state.stageRect.width) * 100;
      const deltaYPct = ((e.clientY - state.startClientY) / state.stageRect.height) * 100;
      const start = state.startGeom;

      let next: LabelGeometry;

      if (state.mode === 'move') {
        next = clampSquareLabelGeometry(
          {
            x: start.x + deltaXPct,
            y: start.y + deltaYPct,
            width: start.width,
          },
          templateWidth,
          templateHeight,
        );
      } else {
        const minW = Math.min(40, Math.max(5, round2((48 / Math.max(1, templateWidth)) * 100)));
        const anchorRight = start.x + start.width;
        const anchorBottom = start.y + start.height;

        if (state.mode === 'se') {
          const maxW = getMaxSquareWidthPct(start.x, start.y, templateWidth, templateHeight);
          const candidateW = Math.max(
            start.width + deltaXPct,
            start.width + deltaYPct * (templateHeight / templateWidth),
          );
          const clampedW = round2(Math.min(Math.max(candidateW, minW), maxW));
          const clampedH = computeSquareHeightPct(clampedW, templateWidth, templateHeight);
          next = { x: start.x, y: start.y, width: clampedW, height: clampedH };
        } else if (state.mode === 'sw') {
          const candidateW = Math.max(
            start.width - deltaXPct,
            start.width + deltaYPct * (templateHeight / templateWidth),
          );
          const maxWByLeft = anchorRight;
          const maxWByBottom = (100 - start.y) * (templateHeight / templateWidth);
          const maxW = round2(Math.min(maxWByLeft, maxWByBottom));
          const clampedW = round2(Math.min(Math.max(candidateW, minW), maxW));
          const clampedH = computeSquareHeightPct(clampedW, templateWidth, templateHeight);
          next = {
            x: round2(anchorRight - clampedW),
            y: start.y,
            width: clampedW,
            height: clampedH,
          };
        } else if (state.mode === 'ne') {
          const candidateW = Math.max(
            start.width + deltaXPct,
            start.width - deltaYPct * (templateHeight / templateWidth),
          );
          const maxWByRight = 100 - start.x;
          const maxWByTop = anchorBottom * (templateHeight / templateWidth);
          const maxW = round2(Math.min(maxWByRight, maxWByTop));
          const clampedW = round2(Math.min(Math.max(candidateW, minW), maxW));
          const clampedH = computeSquareHeightPct(clampedW, templateWidth, templateHeight);
          next = {
            x: start.x,
            y: round2(anchorBottom - clampedH),
            width: clampedW,
            height: clampedH,
          };
        } else {
          // 'nw'
          const candidateW = Math.max(
            start.width - deltaXPct,
            start.width - deltaYPct * (templateHeight / templateWidth),
          );
          const maxWByLeft = anchorRight;
          const maxWByTop = anchorBottom * (templateHeight / templateWidth);
          const maxW = round2(Math.min(maxWByLeft, maxWByTop));
          const clampedW = round2(Math.min(Math.max(candidateW, minW), maxW));
          const clampedH = computeSquareHeightPct(clampedW, templateWidth, templateHeight);
          next = {
            x: round2(anchorRight - clampedW),
            y: round2(anchorBottom - clampedH),
            width: clampedW,
            height: clampedH,
          };
        }

        next = clampSquareLabelGeometry(next, templateWidth, templateHeight);
      }

      liveGeomRef.current = next;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        applyBoxDomStyle(next);
        onChange(next);
      });
    },
    [applyBoxDomStyle, onChange, templateHeight, templateWidth],
  );

  const endInteraction = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore if capture already released
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    onChange(liveGeomRef.current);
  }, [onChange]);

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-100/80 p-4 flex items-center justify-center">
      <div
        ref={stageRef}
        className="relative w-full max-w-3xl overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm select-none"
        style={{ aspectRatio: `${templateWidth} / ${templateHeight}` }}
      >
        <MemoTemplateImage src={templateImageUrl} alt={templateName} />

        <div
          ref={qrBoxRef}
          onPointerDown={(e) => startInteraction('move', e)}
          onPointerMove={handlePointerMove}
          onPointerUp={endInteraction}
          onPointerCancel={endInteraction}
          role="application"
          aria-label="Código QR móvil y redimensionable con proporción cuadrada 1:1"
          style={{
            left: `${geometry.x}%`,
            top: `${geometry.y}%`,
            width: `${geometry.width}%`,
            height: `${geometry.height}%`,
            touchAction: 'none',
          }}
          className={`group absolute box-border ring-2 ring-blue-600 shadow-sm ${
            disabled ? 'cursor-not-allowed opacity-70' : 'cursor-move'
          }`}
        >
          <MemoQrGraphic qrSvg={qrSvg} />

          {!disabled && (
            <>
              <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center gap-1 rounded bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white whitespace-nowrap shadow">
                <Move className="h-3 w-3" />
                <span>Arrastrar</span>
              </div>

              {(
                [
                  { mode: 'nw' as const, pos: '-top-2 -left-2 cursor-nwse-resize' },
                  { mode: 'ne' as const, pos: '-top-2 -right-2 cursor-nesw-resize' },
                  { mode: 'sw' as const, pos: '-bottom-2 -left-2 cursor-nesw-resize' },
                  { mode: 'se' as const, pos: '-bottom-2 -right-2 cursor-nwse-resize' },
                ] as const
              ).map((handle) => (
                <button
                  key={handle.mode}
                  type="button"
                  aria-label={`Redimensionar esquina ${handle.mode}`}
                  onPointerDown={(e) => startInteraction(handle.mode, e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endInteraction}
                  onPointerCancel={endInteraction}
                  style={{ touchAction: 'none' }}
                  className={`absolute ${handle.pos} h-4 w-4 rounded-sm border-2 border-white bg-blue-600 shadow-sm hover:scale-110 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600`}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
