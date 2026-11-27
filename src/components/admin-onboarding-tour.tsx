import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileImage,
  Palette,
  Printer,
  QrCode,
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
  tips: string[];
  targetModule?: AdminModule;
  icon: React.ComponentType<{ className?: string }>;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'overview',
    sectionLabel: 'Panel principal',
    title: 'Bienvenido al panel de CascoQR',
    description:
      'Desde aquí administras los cascos registrados, su ficha médica pública, las plantillas y la impresión de etiquetas QR.',
    tips: [
      'Las 4 tarjetas superiores muestran tus totales reales y funcionan como filtro rápido (Todos, Activos, Inactivos y Plantillas).',
      'Puedes volver a abrir esta guía cuando quieras usando el botón "Repetir guía de uso" en el panel principal.',
    ],
    targetModule: 'owners',
    icon: ShieldCheck,
  },
  {
    id: 'owners',
    sectionLabel: 'Sección 1 · Propietarios',
    title: 'Registrar y gestionar propietarios',
    description:
      'Cada motociclista tiene su ficha médica de emergencia, documentos opcionales y un enlace QR único.',
    tips: [
      'Pulsa "Nuevo propietario" para capturar tipo de sangre, alergias, contactos y activar el envío de ubicación GPS por WhatsApp.',
      'En la lista puedes editar datos en cualquier momento o desactivar un propietario para revocar de inmediato su código QR anterior.',
    ],
    targetModule: 'owners',
    icon: Users,
  },
  {
    id: 'templates',
    sectionLabel: 'Sección 2 · Plantillas',
    title: 'Elegir o subir plantillas de etiqueta',
    description:
      'Las plantillas son el diseño de fondo donde se incrustará el código QR del propietario.',
    tips: [
      'Al iniciar dispones de diseños base listos y un pack de 5 plantillas circulares de 5 cm ideales para casco.',
      'También puedes subir tus propios diseños PNG con fondo transparente para logos de moto clubs o diseños personalizados.',
    ],
    targetModule: 'templates',
    icon: FileImage,
  },
  {
    id: 'editor',
    sectionLabel: 'Sección 3 · Editor de etiquetas QR',
    title: 'Ubicar y personalizar el código QR',
    description:
      'Combina cualquier propietario activo con una plantilla y ajusta la posición exacta del QR antes de guardar.',
    tips: [
      'Arrastra el código QR sobre el lienzo o escribe coordenadas X, Y y tamaño en píxeles para máxima precisión.',
      'Escoge el estilo visual del código (clásico, redondeado, puntos o marco) y pulsa "Guardar etiqueta".',
    ],
    targetModule: 'editor',
    icon: QrCode,
  },
  {
    id: 'printing',
    sectionLabel: 'Impresión rápida y hojas',
    title: 'Imprimir en mini impresora o en hoja completa',
    description:
      'Una vez que el propietario tiene su etiqueta guardada, puedes descargarla lista para imprimir.',
    tips: [
      'Usa "Mini impresora / 1 sticker" para obtener un PNG cuadrado exacto a 300 DPI con fondo blanco listo para impresoras portátiles.',
      'Si seleccionas varios propietarios en la lista, también puedes generar hojas Carta o Tabloide en PDF 1:1 con guías de corte.',
    ],
    targetModule: 'owners',
    icon: Printer,
  },
  {
    id: 'theme-and-public',
    sectionLabel: 'Secciones 4 y 5 · Diseño y Ficha pública',
    title: 'Personalizar la ficha y verificar el escaneo',
    description:
      'Controla cómo se ve la pantalla que abre cualquier celular al escanear el casco.',
    tips: [
      'En "Diseño de ficha" defines colores, tema claro u oscuro, banner y foto/logo global o exclusivo para cada motociclista.',
      'En "Ficha pública" (o desde el ícono de ojo en la tabla) puedes probar la vista real, copiar el enlace o abrirla en pantalla completa.',
    ],
    targetModule: 'card-theme',
    icon: Palette,
  },
];

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

  useEffect(() => {
    if (open) {
      setStepIndex(0);
    } else {
      onHighlightModule?.(null);
    }
  }, [open, onHighlightModule]);

  const currentStep = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];

  useEffect(() => {
    if (!open) return;
    onHighlightModule?.(currentStep.targetModule ?? null);
  }, [open, currentStep, onHighlightModule]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        markAdminTourSeen();
        onClose();
      } else if (event.key === 'ArrowRight') {
        setStepIndex((prev) => Math.min(TOUR_STEPS.length - 1, prev + 1));
      } else if (event.key === 'ArrowLeft') {
        setStepIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

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
      {/* Dark backdrop overlay */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/75 backdrop-blur-[2px] transition-opacity"
        onClick={handleFinishOrDismiss}
        aria-hidden="true"
      />

      {/* Informative Tutorial Modal */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div className="pointer-events-auto relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Progress bar */}
        <div className="h-1.5 w-full bg-slate-100">
          <div
            className="h-full bg-blue-600 transition-all duration-200"
            style={{ width: `${((stepIndex + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-5 sm:p-7 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <StepIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 font-mono tabular-nums">
                  Paso {stepIndex + 1} de {TOUR_STEPS.length} · {currentStep.sectionLabel}
                </p>
                <h2
                  id="cascoqr-tour-title"
                  className="text-lg sm:text-xl font-bold text-slate-900 leading-snug"
                >
                  {currentStep.title}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFinishOrDismiss}
              aria-label="Cerrar guía"
              className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Description */}
          <p className="text-sm text-slate-600 leading-relaxed">
            {currentStep.description}
          </p>

          {/* Actionable tips */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-2.5">
            {currentStep.tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="mt-0.5 text-xs font-mono tabular-nums font-semibold text-blue-600 shrink-0">
                  0{idx + 1}.
                </span>
                <p className="leading-snug">{tip}</p>
              </div>
            ))}
          </div>

          {/* Step selector dots / navigation */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Pasos del tutorial">
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
                    className={`h-2.5 rounded-full transition-all cursor-pointer ${
                      active
                        ? 'w-7 bg-blue-600'
                        : 'w-2.5 bg-slate-200 hover:bg-slate-300'
                    }`}
                  />
                );
              })}
            </div>

            {currentStep.targetModule && onNavigateToModule && (
              <button
                type="button"
                onClick={handleJumpToSection}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer whitespace-nowrap"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Ir a esta sección</span>
              </button>
            )}
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleFinishOrDismiss}
              className="text-slate-500 hover:text-slate-800"
            >
              Omitir guía
            </Button>

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
                  <span>Finalizar guía</span>
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
    </div>
  );
}
