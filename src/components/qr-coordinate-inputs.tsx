import React, { useEffect, useState } from 'react';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import {
  clampSquareLabelGeometry,
  round2,
  type LabelGeometry,
} from '@/src/lib/qr-geometry';

type EditableField = 'x' | 'y' | 'width';

interface QrCoordinateInputsProps {
  idPrefix: string;
  geometry: LabelGeometry;
  templateWidth: number;
  templateHeight: number;
  onChange: (next: LabelGeometry) => void;
  disabled?: boolean;
  columns?: 2 | 4;
  compactLabels?: boolean;
}

function parseDecimalInput(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized || normalized === '.' || !/^\d+(\.\d*)?$/.test(normalized)) {
    return null;
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function QrCoordinateInputs({
  idPrefix,
  geometry,
  templateWidth,
  templateHeight,
  onChange,
  disabled = false,
  columns = 4,
  compactLabels = false,
}: QrCoordinateInputsProps) {
  const [focusedField, setFocusedField] = useState<EditableField | null>(null);
  const [drafts, setDrafts] = useState<Record<EditableField, string>>({
    x: String(geometry.x),
    y: String(geometry.y),
    width: String(geometry.width),
  });

  useEffect(() => {
    setDrafts((prev) => ({
      x: focusedField === 'x' ? prev.x : String(geometry.x),
      y: focusedField === 'y' ? prev.y : String(geometry.y),
      width: focusedField === 'width' ? prev.width : String(geometry.width),
    }));
  }, [geometry.x, geometry.y, geometry.width, focusedField]);

  const commitGeometry = (field: EditableField, numericValue: number) => {
    const next = clampSquareLabelGeometry(
      {
        x: field === 'x' ? round2(numericValue) : geometry.x,
        y: field === 'y' ? round2(numericValue) : geometry.y,
        width: field === 'width' ? round2(numericValue) : geometry.width,
      },
      templateWidth,
      templateHeight,
    );
    onChange(next);
    return next;
  };

  const handleFieldChange = (field: EditableField, raw: string) => {
    const cleaned = raw.replace(',', '.');
    if (cleaned !== '' && !/^\d*\.?\d{0,2}$/.test(cleaned)) {
      return;
    }

    setDrafts((prev) => ({ ...prev, [field]: cleaned }));

    if (cleaned.endsWith('.')) return;
    const parsed = parseDecimalInput(cleaned);
    if (parsed === null) return;

    // For width, avoid clamping upward mid-typing (e.g. typing "2" on the way to "25.5")
    if (field === 'width' && parsed < 5) return;

    commitGeometry(field, parsed);
  };

  const handleFieldBlur = (field: EditableField) => {
    setFocusedField((curr) => (curr === field ? null : curr));
    const parsed = parseDecimalInput(drafts[field]);
    if (parsed === null) {
      setDrafts((prev) => ({ ...prev, [field]: String(geometry[field]) }));
      return;
    }
    const clamped = commitGeometry(field, parsed);
    setDrafts((prev) => ({ ...prev, [field]: String(clamped[field]) }));
  };

  const handleKeyDown = (field: EditableField, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const parsed = parseDecimalInput(drafts[field]);
      if (parsed !== null) {
        const clamped = commitGeometry(field, parsed);
        setDrafts((prev) => ({ ...prev, [field]: String(clamped[field]) }));
      }
    }
  };

  const gridClass =
    columns === 2 ? 'grid grid-cols-2 gap-4' : 'grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2';
  const labelClass = compactLabels ? 'text-xs' : undefined;
  const inputHeightClass = compactLabels ? 'h-9' : '';

  const fields: Array<{ key: EditableField; label: string; placeholder: string }> = [
    { key: 'x', label: 'Posición X (%)', placeholder: '0.00' },
    { key: 'y', label: 'Posición Y (%)', placeholder: '0.00' },
    { key: 'width', label: 'Ancho QR (%)', placeholder: '20.00' },
  ];

  return (
    <div className={gridClass}>
      {fields.map(({ key, label, placeholder }) => (
        <div key={key} className={compactLabels ? 'space-y-1' : 'space-y-1.5'}>
          <Label htmlFor={`${idPrefix}-${key}`} className={labelClass}>
            {label}
          </Label>
          <Input
            id={`${idPrefix}-${key}`}
            type="text"
            inputMode="decimal"
            disabled={disabled}
            placeholder={placeholder}
            value={drafts[key]}
            onFocus={() => setFocusedField(key)}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            onBlur={() => handleFieldBlur(key)}
            onKeyDown={(e) => handleKeyDown(key, e)}
            className={`font-mono tabular-nums ${inputHeightClass}`}
          />
        </div>
      ))}

      <div className={compactLabels ? 'space-y-1' : 'space-y-1.5'}>
        <Label htmlFor={`${idPrefix}-h`} className={labelClass}>
          Alto QR (% · 1:1)
        </Label>
        <Input
          id={`${idPrefix}-h`}
          type="text"
          value={geometry.height}
          readOnly
          disabled
          className={`font-mono tabular-nums bg-slate-50 ${inputHeightClass}`}
        />
      </div>
    </div>
  );
}
