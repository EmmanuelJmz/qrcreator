import React from 'react';
import { Palette } from 'lucide-react';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import {
  HEADER_COLOR_PRESETS,
  type OwnerCardThemeOverride,
  type PageBackgroundMode,
} from '@/src/lib/public-card-theme';

interface OwnerCardThemeControlProps {
  value: OwnerCardThemeOverride | null;
  onChange: (next: OwnerCardThemeOverride | null) => void;
  disabled?: boolean;
}

export function OwnerCardThemeControl({
  value,
  onChange,
  disabled = false,
}: OwnerCardThemeControlProps) {
  const isCustom = Boolean(value && value.useGlobalTheme === false);

  const enableCustom = () => {
    onChange({
      useGlobalTheme: false,
      headerColor: value?.headerColor ?? '#1E293B',
      subtitleText: value?.subtitleText ?? '',
      pageBg: value?.pageBg ?? null,
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-slate-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Apariencia al escanear QR
            </p>
            <p className="text-xs text-slate-500">
              Usa el diseño global o define un color e insignia propios para este propietario.
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 self-start sm:self-auto">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              !isCustom
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Diseño global
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={enableCustom}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              isCustom
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Personalizar
          </button>
        </div>
      </div>

      {isCustom && value && (
        <div className="pt-2 border-t border-slate-200 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Color del encabezado</Label>
              <span className="text-[11px] font-mono text-slate-500">
                {value.headerColor || 'Hereda global'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {HEADER_COLOR_PRESETS.map((preset) => {
                const selected =
                  value.headerColor?.toUpperCase() === preset.hex.toUpperCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...value,
                        useGlobalTheme: false,
                        headerColor: preset.hex,
                      })
                    }
                    title={preset.label}
                    className={`h-7 w-7 rounded-full border cursor-pointer transition-transform ${
                      selected
                        ? 'ring-2 ring-offset-1 ring-slate-900 scale-105'
                        : 'border-black/15 hover:scale-105'
                    }`}
                    style={{ backgroundColor: preset.hex }}
                  />
                );
              })}

              <input
                type="color"
                disabled={disabled}
                value={value.headerColor || '#F97316'}
                onChange={(e) =>
                  onChange({
                    ...value,
                    useGlobalTheme: false,
                    headerColor: e.target.value.toUpperCase(),
                  })
                }
                aria-label="Color personalizado de ficha"
                className="h-7 w-9 rounded border border-slate-300 bg-white p-0.5 cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Insignia / texto superior (opcional)</Label>
              <Input
                value={value.subtitleText ?? ''}
                disabled={disabled}
                maxLength={80}
                placeholder="Ej. Motoclub Halcones"
                onChange={(e) =>
                  onChange({
                    ...value,
                    useGlobalTheme: false,
                    subtitleText: e.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Fondo de ficha</Label>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: null, label: 'Global' },
                    { id: 'slate', label: 'Claro' },
                    { id: 'dark', label: 'Oscuro' },
                  ] as Array<{ id: PageBackgroundMode | null; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...value,
                        useGlobalTheme: false,
                        pageBg: opt.id,
                      })
                    }
                    className={`h-9 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
                      (value.pageBg ?? null) === opt.id
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
