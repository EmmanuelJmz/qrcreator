import React, { useMemo } from 'react';
import { QR_STYLE_OPTIONS, renderStyledQrSvg, type QrStyle } from '@/src/lib/qr-styled';

interface QrStyleSelectorProps {
  value: QrStyle;
  onChange: (style: QrStyle) => void;
  disabled?: boolean;
}

export function QrStyleSelector({
  value,
  onChange,
  disabled = false,
}: QrStyleSelectorProps) {
  const previews = useMemo(
    () =>
      QR_STYLE_OPTIONS.map((opt) => ({
        ...opt,
        svg: renderStyledQrSvg('https://cascoqr.app/ficha/demo', { style: opt.id }),
      })),
    [],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">Estilo del código QR</span>
        <span className="text-xs text-slate-500">
          {QR_STYLE_OPTIONS.find((o) => o.id === value)?.description}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Estilo del código QR"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5"
      >
        {previews.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              title={opt.description}
              className={`group flex flex-col items-center gap-2 rounded-lg border p-2.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              } ${
                selected
                  ? 'border-orange-600 ring-2 ring-orange-500/20 bg-orange-50/40'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
              }`}
            >
              <div
                className="h-14 w-14 rounded-md border border-slate-200 bg-white p-1 [&_svg]:h-full [&_svg]:w-full [&_svg]:block pointer-events-none select-none"
                dangerouslySetInnerHTML={{ __html: opt.svg }}
              />
              <span
                className={`text-xs font-medium leading-tight whitespace-nowrap ${
                  selected ? 'text-orange-700' : 'text-slate-700'
                }`}
              >
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
