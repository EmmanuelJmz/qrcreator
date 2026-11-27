import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileImage,
  Palette,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { AdminModule } from '@/src/components/admin-layout';
import { Button } from '@/src/components/ui/button';

export const ADMIN_TOUR_STORAGE_KEY = 'cascoqr_admin_tour_seen_v1';

export function hasSeenAdminTour(): boolean {
  try {
    return window.localStorage.getItem(ADMIN_TOUR_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markAdminTourSeen(): void {
  try {
    window.localStorage.setItem(ADMIN_TOUR_STORAGE_KEY, '1');
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

interface TourStep {
  id: string;
  sectionLabel: string;
  title: string;
  description: string;
  selector: string;
  mobileFallbackSelector?: string;
  preferredSide?: 'auto' | 'right' | 'bottom' | 'top';
  targetModule?: AdminModule;
  icon: React.ComponentType<{ className?: string }>;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'stats',
    sectionLabel: 'Panel principal',
    title: '1. Tus estadísticas y filtros rápidos',
    description:
      'Aquí ves el resumen real de cascos registrados, activos con QR, inactivos y plantillas. Si tocas cualquiera de estas tarjetas, filtras la lista al instante.',
    selector: '[data-tour="stats-grid"]',
    preferredSide: 'bottom',
    icon: ShieldCheck,
  },
  {
    id: 'new-owner',
    sectionLabel: 'Propietarios',
    title: '2. Registra un nuevo propietario',
    description:
      'Pulsa aquí para dar de alta a un motociclista con su tipo de sangre, alergias, contactos de emergencia, botón GPS por WhatsApp y etiqueta QR en un solo flujo.',
    selector: '[data-tour="new-owner-btn"]',
    preferredSide: 'bottom',
    icon: Users,
  },
  {
    id: 'print',
    sectionLabel: 'Impresión y mini impresora',
    title: '3. Imprime 1 sticker o una hoja completa',
    description:
      'Desde este botón eliges si quieres imprimir solo 1 propietario (PNG cuadrado 300 DPI para mini impresora) o escoger varios en hoja Carta / Tabloide PDF.',
    selector: '[data-tour="print-btn"]',
    preferredSide: 'bottom',
    icon: Printer,
  },
  {
    id: 'search',
    sectionLabel: 'Búsqueda y acciones',
    title: '4. Busca, edita o revoca accesos',
    description:
      'Encuentra rápido a cualquier motociclista por nombre o estado. En cada fila abajo podrás ver su ficha, copiar el enlace, bajar el PNG o desactivar su QR.',
    selector: '[data-tour="search-bar"]',
    preferredSide: 'bottom',
    icon: Search,
  },
  {
    id: 'templates',
    sectionLabel: 'Sección Plantillas',
    title: '5. Elige o sube tus plantillas',
    description:
      'En Plantillas tienes el pack circular de 5 cm listo para casco y también puedes subir tus propios diseños PNG con fondo transparente.',
    selector: '[data-tour="nav-templates"]',
    mobileFallbackSelector: '[data-tour="mobile-menu-btn"]',
    preferredSide: 'right',
    targetModule: 'templates',
    icon: FileImage,
  },
  {
    id: 'editor',
    sectionLabel: 'Sección Editor QR',
    title: '6. Acomoda el código QR en la plantilla',
    description:
      'Combina un propietario con cualquier plantilla, arrastra o ajusta las coordenadas exactas (X, Y y tamaño), elige el estilo del QR y guarda la etiqueta.',
    selector: '[data-tour="nav-editor"]',
    mobileFallbackSelector: '[data-tour="mobile-menu-btn"]',
    preferredSide: 'right',
    targetModule: 'editor',
    icon: QrCode,
  },
  {
    id: 'theme-public',
    sectionLabel: 'Diseño y Ficha pública',
    title: '7. Personaliza la ficha y pruébala',
    description:
      'En "Diseño de ficha" cambias colores, tema claro u oscuro, portada y logo global o por persona. En "Ficha pública" ves exactamente lo que abre el celular al escanear.',
    selector: '[data-tour="nav-card-theme"]',
    mobileFallbackSelector: '[data-tour="mobile-menu-btn"]',
    preferredSide: 'right',
    targetModule: 'card-theme',
    icon: Palette,
  },
  {
    id: 'replay',
    sectionLabel: 'Siempre disponible',
    title: '8. Repite esta guía cuando la necesites',
    description:
      'Si en cualquier momento quieres volver a ver estas instrucciones señalando cada botón y sección, solo presiona este botón en el panel principal.',
    selector: '[data-tour="replay-tour-btn"]',
    preferredSide: 'top',
    icon: BookOpen,
  },
];

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

type ArrowSide = 'top' | 'bottom' | 'left' | 'right' | 'none';

interface PopoverPlacement {
  top: number;
  left: number;
  arrowSide: ArrowSide;
  arrowOffset: number;
}

function getVisibleRect(selector: string): { el: HTMLElement; rect: RectBox } | null {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  return {
    el,
    rect: {
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      right: r.right,
      bottom: r.bottom,
    },
  };
}

function computePopoverPlacement(
  spot: RectBox | null,
  cardWidth: number,
  cardHeight: number,
  preferredSide: TourStep['preferredSide'] = 'auto',
): PopoverPlacement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;
  const gap = 16;

  if (!spot) {
    return {
      top: Math.max(margin, Math.round((vh - cardHeight) / 2)),
      left: Math.max(margin, Math.round((vw - cardWidth) / 2)),
      arrowSide: 'none',
      arrowOffset: 0,
    };
  }

  const spotCenterX = spot.left + spot.width / 2;
  const spotCenterY = spot.top + spot.height / 2;

  const spaceRight = vw - spot.right - margin;
  const spaceBottom = vh - spot.bottom - margin;
  const spaceTop = spot.top - margin;
  const spaceLeft = spot.left - margin;

  let side: Exclude<ArrowSide, 'none'> = 'bottom';
  if (preferredSide === 'right' && spaceRight >= cardWidth + gap) {
    side = 'right';
  } else if (preferredSide === 'top' && spaceTop >= cardHeight + gap) {
    side = 'top';
  } else if (preferredSide === 'bottom' && spaceBottom >= cardHeight + gap) {
    side = 'bottom';
  } else if (spaceRight >= cardWidth + gap && spot.width < 320) {
    side = 'right';
  } else if (spaceBottom >= cardHeight + gap) {
    side = 'bottom';
  } else if (spaceTop >= cardHeight + gap) {
    side = 'top';
  } else if (spaceLeft >= cardWidth + gap) {
    side = 'left';
  } else {
    side = spaceBottom >= spaceTop ? 'bottom' : 'top';
  }

  let top = margin;
  let left = margin;
  let arrowSide: ArrowSide = 'none';
  let arrowOffset = 24;

  if (side === 'right') {
    left = Math.min(vw - cardWidth - margin, spot.right + gap);
    top = Math.min(
      vh - cardHeight - margin,
      Math.max(margin, spotCenterY - cardHeight / 2),
    );
    arrowSide = 'left';
    arrowOffset = Math.min(
      cardHeight - 28,
      Math.max(24, spotCenterY - top),
    );
  } else if (side === 'left') {
    left = Math.max(margin, spot.left - gap - cardWidth);
    top = Math.min(
      vh - cardHeight - margin,
      Math.max(margin, spotCenterY - cardHeight / 2),
    );
    arrowSide = 'right';
    arrowOffset = Math.min(
      cardHeight - 28,
      Math.max(24, spotCenterY - top),
    );
  } else if (side === 'bottom') {
    top = Math.min(vh - cardHeight - margin, spot.bottom + gap);
    left = Math.min(
      vw - cardWidth - margin,
      Math.max(margin, spotCenterX - cardWidth / 2),
    );
    arrowSide = 'top';
    arrowOffset = Math.min(
      cardWidth - 28,
      Math.max(24, spotCenterX - left),
    );
  } else {
    top = Math.max(margin, spot.top - gap - cardHeight);
    left = Math.min(
      vw - cardWidth - margin,
      Math.max(margin, spotCenterX - cardWidth / 2),
    );
    arrowSide = 'bottom';
    arrowOffset = Math.min(
      cardWidth - 28,
      Math.max(24, spotCenterX - left),
    );
  }

  return {
    top: Math.round(top),
    left: Math.round(left),
    arrowSide,
    arrowOffset: Math.round(arrowOffset),
  };
}

interface AdminOnboardingTourProps {
  open: boolean;
  onClose: () => void;
  onHighlightModule?: (module: AdminModule | null) => void;
  onNavigateToModule?: (module: AdminModule) => void;
}

export function AdminOnboardingTour({
  open,
  onClose,
  onHighlightModule,
  onNavigateToModule,
}: AdminOnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<RectBox | null>(null);
  const [placement, setPlacement] = useState<PopoverPlacement>({
    top: 80,
    left: 24,
    arrowSide: 'none',
    arrowOffset: 0,
  });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const currentStep = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];

  useEffect(() => {
    if (open) {
      setStepIndex(0);
    } else {
      setSpotlightRect(null);
      onHighlightModule?.(null);
    }
  }, [open, onHighlightModule]);

  const measureAndPosition = useCallback(
    (shouldScrollIntoView: boolean) => {
      if (!open) return;

      const found =
        getVisibleRect(currentStep.selector) ??
        (currentStep.mobileFallbackSelector
          ? getVisibleRect(currentStep.mobileFallbackSelector)
          : null);

      if (found && shouldScrollIntoView) {
        found.el.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      }

      const fresh =
        getVisibleRect(currentStep.selector) ??
        (currentStep.mobileFallbackSelector
          ? getVisibleRect(currentStep.mobileFallbackSelector)
          : null);

      let nextSpot: RectBox | null = null;
      if (fresh) {
        const pad = 8;
        const r = fresh.rect;
        const top = Math.max(4, r.top - pad);
        const left = Math.max(4, r.left - pad);
        const right = Math.min(window.innerWidth - 4, r.right + pad);
        const bottom = Math.min(window.innerHeight - 4, r.bottom + pad);
        nextSpot = {
          top,
          left,
          right,
          bottom,
          width: Math.max(20, right - left),
          height: Math.max(20, bottom - top),
        };
      }

      setSpotlightRect(nextSpot);

      const cardWidth = cardRef.current?.offsetWidth || Math.min(368, window.innerWidth - 24);
      const cardHeight = cardRef.current?.offsetHeight || 250;
      setPlacement(
        computePopoverPlacement(
          nextSpot,
          cardWidth,
          cardHeight,
          currentStep.preferredSide,
        ),
      );
    },
    [open, currentStep],
  );

  useLayoutEffect(() => {
    if (!open) return;
    onHighlightModule?.(currentStep.targetModule ?? null);
    measureAndPosition(true);
    const t1 = window.setTimeout(() => measureAndPosition(false), 180);
    const t2 = window.setTimeout(() => measureAndPosition(false), 450);

    const observer = new MutationObserver(() => {
      const target =
        getVisibleRect(currentStep.selector) ??
        (currentStep.mobileFallbackSelector
          ? getVisibleRect(currentStep.mobileFallbackSelector)
          : null);
      if (target) {
        measureAndPosition(false);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      observer.disconnect();
    };
  }, [open, stepIndex, currentStep, measureAndPosition, onHighlightModule]);

  useEffect(() => {
    if (!open) return;
    const onUpdate = () => measureAndPosition(false);
    window.addEventListener('resize', onUpdate);
    window.addEventListener('scroll', onUpdate, true);
    return () => {
      window.removeEventListener('resize', onUpdate);
      window.removeEventListener('scroll', onUpdate, true);
    };
  }, [open, measureAndPosition]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        markAdminTourSeen();
        onHighlightModule?.(null);
        onClose();
      } else if (event.key === 'ArrowRight') {
        setStepIndex((prev) => Math.min(TOUR_STEPS.length - 1, prev + 1));
      } else if (event.key === 'ArrowLeft') {
        setStepIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, onHighlightModule]);

  if (!open) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const StepIcon = currentStep.icon;

  const handleFinishOrDismiss = () => {
    markAdminTourSeen();
    onHighlightModule?.(null);
    onClose();
  };

  const handleJumpToSection = () => {
    if (!currentStep.targetModule || !onNavigateToModule) return;
    markAdminTourSeen();
    onHighlightModule?.(null);
    onNavigateToModule(currentStep.targetModule);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cascoqr-tour-title"
    >
      {/* Click-blocker + backdrop */}
      <div
        className={`fixed inset-0 z-[70] transition-colors ${
          spotlightRect ? 'bg-transparent' : 'bg-slate-950/75 backdrop-blur-[2px]'
        }`}
        onClick={handleFinishOrDismiss}
        aria-hidden="true"
      />

      {/* Real Element Spotlight Cutout with Dark Surrounding Shadow */}
      {spotlightRect && (
        <div
          aria-hidden="true"
          className="fixed z-[75] pointer-events-none rounded-xl border-2 border-blue-400 transition-all duration-200 ease-out"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
            boxShadow:
              '0 0 0 9999px rgba(2, 6, 23, 0.78), 0 0 0 5px rgba(59, 130, 246, 0.28)',
          }}
        />
      )}

      {/* Floating Guided Coachmark Card with Directional Arrow */}
      <div
        ref={cardRef}
        className="fixed z-[80] w-[calc(100vw-24px)] max-w-[376px] rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-200 ease-out"
        style={{
          top: placement.top,
          left: placement.left,
        }}
      >
        {/* Directional Arrow pointing directly at the highlighted element */}
        {placement.arrowSide === 'top' && (
          <div
            aria-hidden="true"
            className="absolute -top-2 w-4 h-4 rotate-45 bg-white border-l border-t border-slate-200"
            style={{ left: placement.arrowOffset - 8 }}
          />
        )}
        {placement.arrowSide === 'bottom' && (
          <div
            aria-hidden="true"
            className="absolute -bottom-2 w-4 h-4 rotate-45 bg-white border-r border-b border-slate-200"
            style={{ left: placement.arrowOffset - 8 }}
          />
        )}
        {placement.arrowSide === 'left' && (
          <div
            aria-hidden="true"
            className="absolute -left-2 w-4 h-4 rotate-45 bg-white border-l border-b border-slate-200"
            style={{ top: placement.arrowOffset - 8 }}
          />
        )}
        {placement.arrowSide === 'right' && (
          <div
            aria-hidden="true"
            className="absolute -right-2 w-4 h-4 rotate-45 bg-white border-r border-t border-slate-200"
            style={{ top: placement.arrowOffset - 8 }}
          />
        )}

        {/* Progress strip */}
        <div className="h-1.5 w-full bg-slate-100 rounded-t-2xl overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-200"
            style={{ width: `${((stepIndex + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-4 sm:p-5 space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <StepIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 font-mono tabular-nums">
                  Paso {stepIndex + 1} de {TOUR_STEPS.length} · {currentStep.sectionLabel}
                </p>
                <h2
                  id="cascoqr-tour-title"
                  className="text-base font-bold text-slate-900 leading-snug"
                >
                  {currentStep.title}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFinishOrDismiss}
              aria-label="Cerrar guía"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            {currentStep.description}
          </p>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-1" role="tablist" aria-label="Pasos de la guía">
              {TOUR_STEPS.map((step, idx) => {
                const active = idx === stepIndex;
                return (
                  <button
                    key={step.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-label={`Ir al paso ${idx + 1}: ${step.title}`}
                    onClick={() => setStepIndex(idx)}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      active ? 'w-5 bg-blue-600' : 'w-2 bg-slate-200 hover:bg-slate-300'
                    }`}
                  />
                );
              })}
            </div>

            {currentStep.targetModule && onNavigateToModule && (
              <button
                type="button"
                onClick={handleJumpToSection}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer whitespace-nowrap"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Abrir sección</span>
              </button>
            )}
          </div>

          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleFinishOrDismiss}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 px-1 py-1 cursor-pointer"
            >
              Omitir
            </button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Anterior</span>
                </Button>
              )}

              {isLast ? (
                <Button type="button" size="sm" onClick={handleFinishOrDismiss}>
                  <BookOpen className="h-4 w-4" />
                  <span>Entendido</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    setStepIndex((prev) => Math.min(TOUR_STEPS.length - 1, prev + 1))
                  }
                >
                  <span>Siguiente</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
