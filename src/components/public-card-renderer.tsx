import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  FileImage,
  GripHorizontal,
  Mail,
  Move,
  Phone,
  QrCode,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import type { PublicCardData, PublicCardDocument } from '@/src/lib/api-client';
import {
  computeBannerVisuals,
  computeLogoOverhangPx,
  type PageBackgroundMode,
  type PublicCardTheme,
} from '@/src/lib/public-card-theme';
import { formatDateShort } from '@/src/lib/utils';

interface PublicCardViewProps {
  card: PublicCardData;
  theme: PublicCardTheme;
  logoUrl: string | null;
  token?: string;
  interactive?: boolean;
  onThemeChange?: (updater: (prev: PublicCardTheme) => PublicCardTheme) => void;
}

function HelmetIcon({ accentColor, sizePx }: { accentColor: string; sizePx: number }) {
  const iconSize = Math.max(28, Math.round(sizePx * 0.6));
  return (
    <svg
      viewBox="0 0 64 64"
      style={{ width: iconSize, height: iconSize }}
      role="img"
      aria-label="CascoQR"
    >
      <path
        d="M32 8C18.7 8 9 17.6 9 30.8c0 5.5 1.8 10.7 5.1 14.8 1.2 1.5 3.1 2.4 5.1 2.4h26.2c2.1 0 4-.9 5.3-2.6 2.8-3.6 4.3-8.2 4.3-13.2C55 18.2 45.2 8 32 8Z"
        fill="#0F172A"
      />
      <path
        d="M20 27.5c0-4.8 5.4-8.5 13.8-8.5 6.8 0 12.6 2.8 15.2 7.2.7 1.2-.1 2.8-1.5 2.8H21.6c-.9 0-1.6-.7-1.6-1.5Z"
        fill={accentColor}
      />
      <rect x="20" y="34" width="24" height="5" rx="2.5" fill="#F8FAFC" />
      <circle cx="47.5" cy="40.5" r="4.5" fill={accentColor} />
    </svg>
  );
}

const PAGE_STYLE_CLASSES: Record<
  PageBackgroundMode,
  {
    root: string;
    card: string;
    title: string;
    muted: string;
    contactBox: string;
    contactValue: string;
    docCard: string;
    docThumb: string;
    divider: string;
  }
> = {
  slate: {
    root: 'bg-slate-200 text-slate-900',
    card: 'border-slate-300/80 bg-white shadow-xs',
    title: 'text-slate-950',
    muted: 'text-slate-500',
    contactBox: 'border-slate-200 bg-slate-50 hover:bg-slate-100',
    contactValue: 'text-slate-900',
    docCard: 'border-slate-300/80 bg-white hover:border-slate-500 shadow-xs',
    docThumb: 'bg-slate-100 border-slate-200',
    divider: 'border-slate-100',
  },
  white: {
    root: 'bg-white text-slate-900',
    card: 'border-slate-200 bg-white shadow-sm',
    title: 'text-slate-950',
    muted: 'text-slate-500',
    contactBox: 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/70',
    contactValue: 'text-slate-900',
    docCard: 'border-slate-200 bg-white hover:border-slate-400',
    docThumb: 'bg-slate-50 border-slate-200',
    divider: 'border-slate-100',
  },
  warm: {
    root: 'bg-[#EFE6D5] text-stone-900',
    card: 'border-stone-300/80 bg-white shadow-xs',
    title: 'text-stone-950',
    muted: 'text-stone-600',
    contactBox: 'border-stone-200 bg-[#FAF6EE] hover:bg-[#F3EBD9]',
    contactValue: 'text-stone-900',
    docCard: 'border-stone-300/80 bg-white hover:border-stone-500 shadow-xs',
    docThumb: 'bg-[#F7F1E6] border-stone-200',
    divider: 'border-stone-100',
  },
  dark: {
    root: 'bg-slate-950 text-slate-100',
    card: 'border-slate-800 bg-slate-900',
    title: 'text-white',
    muted: 'text-slate-400',
    contactBox: 'border-slate-800 bg-slate-950/70 hover:bg-slate-800/80',
    contactValue: 'text-slate-100',
    docCard: 'border-slate-800 bg-slate-900 hover:border-slate-600',
    docThumb: 'bg-slate-950 border-slate-800',
    divider: 'border-slate-800',
  },
};

export function PublicCardView({
  card,
  theme,
  logoUrl,
  token,
  interactive = false,
  onThemeChange,
}: PublicCardViewProps) {
  const [previewDoc, setPreviewDoc] = useState<PublicCardDocument | null>(null);
  const [showLabelImage, setShowLabelImage] = useState(false);

  const headerRef = useRef<HTMLDivElement | null>(null);
  const draggingLogoRef = useRef(false);
  const resizingHeaderRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const banner = computeBannerVisuals(theme.headerColor);
  const palette = PAGE_STYLE_CLASSES[theme.pageBg] ?? PAGE_STYLE_CLASSES.slate;
  const overhang = computeLogoOverhangPx(theme);

  const handleLogoPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !onThemeChange) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingLogoRef.current = true;
  };

  const handleLogoPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !onThemeChange || !draggingLogoRef.current || !headerRef.current) return;
    const rect = headerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;
    const nextX = Math.round(Math.min(95, Math.max(5, rawX)));
    const nextY = Math.round(Math.min(130, Math.max(10, rawY)));

    onThemeChange((prev) => ({
      ...prev,
      logoX: nextX,
      logoY: nextY,
    }));
  };

  const handleLogoPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingLogoRef.current) return;
    draggingLogoRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !onThemeChange) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizingHeaderRef.current = {
      startY: e.clientY,
      startHeight: theme.headerHeight,
    };
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !onThemeChange || !resizingHeaderRef.current) return;
    const deltaY = e.clientY - resizingHeaderRef.current.startY;
    const nextHeight = Math.round(
      Math.min(280, Math.max(80, resizingHeaderRef.current.startHeight + deltaY)),
    );
    onThemeChange((prev) => ({
      ...prev,
      headerHeight: nextHeight,
    }));
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizingHeaderRef.current) return;
    resizingHeaderRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const logoFrameClass =
    'rounded-full bg-white shadow-lg border border-slate-200/80 ring-4 ring-white/90';

  return (
    <div className={`${interactive ? 'min-h-full' : 'min-h-screen'} ${palette.root}`}>
      {/* Customizable Top Banner + Free Logo Layer */}
      <div
        ref={headerRef}
        className="relative w-full select-none"
        style={{
          height: `${theme.headerHeight}px`,
          background: `linear-gradient(180deg, ${banner.topHex} 0%, ${banner.bottomHex} 100%)`,
          color: banner.textColor,
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-5 flex items-center justify-between gap-4">
          {theme.showBrandName ? (
            <span className="font-bold tracking-tight text-lg whitespace-nowrap shrink-0">
              {theme.brandName}
            </span>
          ) : (
            <span />
          )}

          {theme.showSubtitle && theme.subtitleText ? (
            <span
              className="text-xs font-medium whitespace-nowrap shrink-0"
              style={{ color: banner.subTextColor }}
            >
              {theme.subtitleText}
            </span>
          ) : null}
        </div>

        {/* Freely Positioned Logo */}
        {theme.logoVisible && (
          <div
            onPointerDown={handleLogoPointerDown}
            onPointerMove={handleLogoPointerMove}
            onPointerUp={handleLogoPointerUp}
            onPointerCancel={handleLogoPointerUp}
            title={interactive ? 'Arrastra para mover el logo libremente' : undefined}
            className={`absolute z-20 flex items-center justify-center overflow-hidden ${logoFrameClass} ${
              interactive
                ? 'cursor-grab active:cursor-grabbing hover:outline hover:outline-2 hover:outline-blue-500 touch-none'
                : ''
            }`}
            style={{
              width: `${theme.logoSize}px`,
              height: `${theme.logoSize}px`,
              left: `${theme.logoX}%`,
              top: `${theme.logoY}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {theme.hasCustomLogo && logoUrl ? (
              <img
                src={logoUrl}
                alt={theme.brandName || 'Logo'}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover pointer-events-none select-none"
                draggable={false}
              />
            ) : (
              <HelmetIcon accentColor={theme.headerColor} sizePx={theme.logoSize} />
            )}

            {interactive && (
              <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-slate-900/75 text-white flex items-center justify-center pointer-events-none">
                <Move className="h-3 w-3" />
              </span>
            )}
          </div>
        )}

        {/* Interactive Banner Height Drag Handle */}
        {interactive && (
          <div
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
            title="Arrastra hacia arriba o abajo para cambiar el alto del encabezado"
            className="absolute inset-x-0 -bottom-2 h-4 z-10 flex items-center justify-center cursor-ns-resize group touch-none"
          >
            <div className="px-2.5 py-0.5 rounded-full bg-white/95 text-slate-700 border border-slate-300 shadow-sm opacity-75 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              <GripHorizontal className="h-3.5 w-3.5" />
              <span className="text-[10px] font-mono font-semibold">
                {theme.headerHeight}px
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Content (auto clears logo overhang so it never overlaps text) */}
      <main
        className="max-w-4xl mx-auto px-4 sm:px-6 pb-12 space-y-6"
        style={{ paddingTop: `${Math.max(24, overhang + 20)}px` }}
      >
        <section className={`rounded-2xl border p-6 sm:p-8 space-y-6 ${palette.card}`}>
          <div className="text-center space-y-2">
            <p className={`text-xs font-medium ${palette.muted}`}>Propietario del casco</p>
            <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight ${palette.title}`}>
              {card.fullName}
            </h1>
            <div className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-emerald-600 pt-1">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Etiqueta activa verificada</span>
            </div>
          </div>

          {(card.phone || card.email) && (
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 pt-5 border-t ${palette.divider}`}>
              {card.phone && (
                <a
                  href={interactive ? undefined : `tel:${card.phone}`}
                  onClick={interactive ? (e) => e.preventDefault() : undefined}
                  className={`min-h-[52px] flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${palette.contactBox}`}
                >
                  <Phone
                    className="h-5 w-5 shrink-0"
                    style={{ color: theme.headerColor }}
                  />
                  <div className="min-w-0">
                    <p className={`text-xs ${palette.muted}`}>Teléfono de contacto</p>
                    <p className={`text-sm font-semibold font-mono tabular-nums truncate ${palette.contactValue}`}>
                      {card.phone}
                    </p>
                  </div>
                </a>
              )}

              {card.email && (
                <a
                  href={interactive ? undefined : `mailto:${card.email}`}
                  onClick={interactive ? (e) => e.preventDefault() : undefined}
                  className={`min-h-[52px] flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${palette.contactBox}`}
                >
                  <Mail
                    className="h-5 w-5 shrink-0"
                    style={{ color: theme.headerColor }}
                  />
                  <div className="min-w-0">
                    <p className={`text-xs ${palette.muted}`}>Correo electrónico</p>
                    <p className={`text-sm font-semibold truncate ${palette.contactValue}`}>
                      {card.email}
                    </p>
                  </div>
                </a>
              )}
            </div>
          )}

          {theme.showLabelPreviewButton && (
            <div className="pt-1 flex flex-col items-center">
              <button
                type="button"
                onClick={() => {
                  if (!interactive && token) setShowLabelImage((v) => !v);
                }}
                className="min-h-[40px] inline-flex items-center gap-2 text-sm font-medium cursor-pointer whitespace-nowrap hover:opacity-80 transition-opacity"
                style={{ color: theme.headerColor }}
              >
                <QrCode className="h-4 w-4 shrink-0" />
                <span>
                  {showLabelImage
                    ? 'Ocultar etiqueta QR asociada'
                    : 'Ver etiqueta QR asociada'}
                </span>
              </button>

              {!interactive && token && showLabelImage && (
                <div className={`mt-3 w-full rounded-xl border p-4 flex justify-center ${palette.docThumb}`}>
                  <img
                    src={`/api/v1/public/${encodeURIComponent(token)}/label-image`}
                    alt={`Etiqueta QR de ${card.fullName}`}
                    referrerPolicy="no-referrer"
                    className="max-h-72 w-auto object-contain rounded"
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Authorized Public Documents */}
        <section className="space-y-4">
          <div className="space-y-1 px-1">
            <h2 className={`text-lg font-semibold ${palette.title}`}>
              Documentos autorizados
            </h2>
            <p className={`text-sm ${palette.muted}`}>
              Documentación habilitada para consulta pública.
            </p>
          </div>

          {card.documents.length === 0 ? (
            <div className={`rounded-2xl border p-6 text-center text-sm ${palette.card} ${palette.muted}`}>
              No hay documentos públicos disponibles para este propietario.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {card.documents.map((doc) => {
                const docUrl = token
                  ? `/api/v1/public/${encodeURIComponent(token)}/documents/${doc.id}`
                  : null;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => {
                      if (!interactive && docUrl) setPreviewDoc(doc);
                    }}
                    className={`group text-left rounded-2xl border overflow-hidden transition-colors cursor-pointer ${palette.docCard}`}
                  >
                    <div className={`h-40 border-b p-3 flex items-center justify-center overflow-hidden ${palette.docThumb}`}>
                      {docUrl ? (
                        <img
                          src={docUrl}
                          alt={doc.originalName}
                          referrerPolicy="no-referrer"
                          className="max-h-full max-w-full object-contain group-hover:scale-[1.02] transition-transform"
                        />
                      ) : (
                        <FileImage
                          className="h-10 w-10 opacity-45"
                          style={{ color: theme.headerColor }}
                        />
                      )}
                    </div>
                    <div className="p-3.5 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <FileImage
                          className="h-4 w-4 shrink-0"
                          style={{ color: theme.headerColor }}
                        />
                        <p className={`text-sm font-medium truncate ${palette.title}`}>
                          {doc.originalName}
                        </p>
                      </div>
                      <p className={`text-xs font-mono tabular-nums pl-6 ${palette.muted}`}>
                        {doc.createdAt
                          ? formatDateShort(doc.createdAt)
                          : doc.mimeType === 'image/png'
                            ? 'Imagen PNG'
                            : 'Imagen JPG'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {theme.footerNote && (
          <p className={`text-center text-xs px-4 pt-2 ${palette.muted}`}>
            {theme.footerNote}
          </p>
        )}
      </main>

      {!interactive && token && (
        <Dialog open={Boolean(previewDoc)} onOpenChange={(open) => !open && setPreviewDoc(null)}>
          <DialogContent className="max-w-3xl">
            {previewDoc && (
              <>
                <DialogHeader>
                  <DialogTitle>{previewDoc.originalName}</DialogTitle>
                </DialogHeader>
                <div className="rounded-lg border border-slate-200 bg-slate-100 p-3 flex items-center justify-center max-h-[75vh] overflow-auto">
                  <img
                    src={`/api/v1/public/${encodeURIComponent(token)}/documents/${previewDoc.id}`}
                    alt={previewDoc.originalName}
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-[68vh] object-contain"
                  />
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
