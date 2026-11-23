import React, { useEffect, useState } from 'react';
import { Input } from '@/src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select';
import {
  DEFAULT_PHONE_COUNTRY_ISO,
  formatPhoneWithCountry,
  getPhoneCountryByIso,
  parsePhoneWithCountry,
  PHONE_COUNTRY_OPTIONS,
  type PhoneCountryIso,
} from '@/src/lib/phone-countries';

function CountryFlag({
  iso,
  className = 'h-3.5 w-5 rounded-[2px] border border-slate-200 shrink-0',
}: {
  iso: PhoneCountryIso;
  className?: string;
}) {
  switch (iso) {
    case 'MX':
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="8" height="16" x="0" y="0" fill="#006847" />
          <rect width="8" height="16" x="8" y="0" fill="#FFFFFF" />
          <rect width="8" height="16" x="16" y="0" fill="#CE1126" />
          <circle cx="12" cy="8" r="2.1" fill="#8B5A2B" />
          <circle cx="12" cy="7.5" r="1.1" fill="#D4AF37" />
        </svg>
      );
    case 'US':
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="24" height="16" fill="#FFFFFF" />
          <rect width="24" height="2.3" y="0" fill="#B22234" />
          <rect width="24" height="2.3" y="4.6" fill="#B22234" />
          <rect width="24" height="2.3" y="9.2" fill="#B22234" />
          <rect width="24" height="2.3" y="13.7" fill="#B22234" />
          <rect width="10.5" height="9" x="0" y="0" fill="#3C3B6E" />
          <circle cx="3" cy="2.6" r="0.7" fill="#FFFFFF" />
          <circle cx="6.5" cy="2.6" r="0.7" fill="#FFFFFF" />
          <circle cx="4.8" cy="4.7" r="0.7" fill="#FFFFFF" />
          <circle cx="3" cy="6.8" r="0.7" fill="#FFFFFF" />
          <circle cx="6.5" cy="6.8" r="0.7" fill="#FFFFFF" />
        </svg>
      );
    case 'CA':
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="6" height="16" x="0" y="0" fill="#D80621" />
          <rect width="12" height="16" x="6" y="0" fill="#FFFFFF" />
          <rect width="6" height="16" x="18" y="0" fill="#D80621" />
          <polygon points="12,3.5 13.5,7 16,6.5 14,9 14.5,11 12.4,10.5 12.4,12.8 11.6,12.8 11.6,10.5 9.5,11 10,9 8,6.5 10.5,7" fill="#D80621" />
        </svg>
      );
    case 'GT':
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="8" height="16" x="0" y="0" fill="#4997D0" />
          <rect width="8" height="16" x="8" y="0" fill="#FFFFFF" />
          <rect width="8" height="16" x="16" y="0" fill="#4997D0" />
          <circle cx="12" cy="8" r="1.9" fill="#3C8D40" />
        </svg>
      );
    case 'CO':
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="24" height="8" x="0" y="0" fill="#FCD116" />
          <rect width="24" height="4" x="0" y="8" fill="#003893" />
          <rect width="24" height="4" x="0" y="12" fill="#CE1126" />
        </svg>
      );
    case 'AR':
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="24" height="5.3" x="0" y="0" fill="#74ACDF" />
          <rect width="24" height="5.4" x="0" y="5.3" fill="#FFFFFF" />
          <rect width="24" height="5.3" x="0" y="10.7" fill="#74ACDF" />
          <circle cx="12" cy="8" r="1.8" fill="#F6B40E" />
        </svg>
      );
    case 'CL':
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="24" height="8" x="0" y="0" fill="#FFFFFF" />
          <rect width="24" height="8" x="0" y="8" fill="#D52B1E" />
          <rect width="9" height="8" x="0" y="0" fill="#0039A6" />
          <circle cx="4.5" cy="4" r="1.4" fill="#FFFFFF" />
        </svg>
      );
    case 'PE':
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="8" height="16" x="0" y="0" fill="#D91023" />
          <rect width="8" height="16" x="8" y="0" fill="#FFFFFF" />
          <rect width="8" height="16" x="16" y="0" fill="#D91023" />
        </svg>
      );
    case 'ES':
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="24" height="4" x="0" y="0" fill="#AA151B" />
          <rect width="24" height="8" x="0" y="4" fill="#F1BF00" />
          <rect width="24" height="4" x="0" y="12" fill="#AA151B" />
          <rect width="2.2" height="3.2" x="5.5" y="6.4" rx="0.5" fill="#AA151B" />
        </svg>
      );
  }
}

interface PhoneCountryInputProps {
  id: string;
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
}

export function PhoneCountryInput({
  id,
  value,
  onChange,
  disabled = false,
}: PhoneCountryInputProps) {
  const [selectedIso, setSelectedIso] = useState<PhoneCountryIso>(
    () => parsePhoneWithCountry(value, DEFAULT_PHONE_COUNTRY_ISO).country.iso,
  );

  useEffect(() => {
    if (!value.trim()) return;
    const parsed = parsePhoneWithCountry(value, selectedIso);
    if (parsed.country.iso !== selectedIso) {
      setSelectedIso(parsed.country.iso);
    }
  }, [value, selectedIso]);

  const activeCountry = getPhoneCountryByIso(selectedIso);
  const { localDigits } = parsePhoneWithCountry(value, selectedIso);

  const handleCountryChange = (nextIsoRaw: string) => {
    const nextIso = nextIsoRaw as PhoneCountryIso;
    setSelectedIso(nextIso);
    if (localDigits) {
      onChange(formatPhoneWithCountry(nextIso, localDigits));
    }
  };

  const handleDigitsChange = (rawInput: string) => {
    const onlyDigits = rawInput.replace(/\D/g, '').slice(0, activeCountry.digitsLength);
    onChange(formatPhoneWithCountry(selectedIso, onlyDigits));
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Select
          value={selectedIso}
          disabled={disabled}
          onValueChange={handleCountryChange}
        >
          <SelectTrigger
            aria-label="Código de país y bandera"
            className="w-[108px] shrink-0 px-2.5 font-mono tabular-nums"
          >
            <SelectValue>
              <span className="inline-flex items-center gap-1.5">
                <CountryFlag iso={activeCountry.iso} />
                <span className="text-xs font-semibold text-slate-800">
                  {activeCountry.dialCode}
                </span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-[230px]">
            {PHONE_COUNTRY_OPTIONS.map((opt) => (
              <SelectItem key={opt.iso} value={opt.iso}>
                <span className="inline-flex items-center gap-2">
                  <CountryFlag iso={opt.iso} />
                  <span className="text-slate-900">{opt.name}</span>
                  <span className="font-mono text-xs text-slate-500">{opt.dialCode}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={localDigits}
          disabled={disabled}
          maxLength={activeCountry.digitsLength}
          placeholder={activeCountry.placeholder}
          className="font-mono tabular-nums flex-1 min-w-0"
          onChange={(e) => handleDigitsChange(e.target.value)}
        />
      </div>

      <p className="text-[11px] text-slate-500">
        {localDigits.length > 0 && localDigits.length !== activeCountry.digitsLength ? (
          <span className="text-amber-700 font-medium">
            Faltan {activeCountry.digitsLength - localDigits.length} dígitos (
            {localDigits.length}/{activeCountry.digitsLength}).
          </span>
        ) : (
          <span>
            {activeCountry.digitsLength} dígitos ({activeCountry.name}). Se guarda con lada{' '}
            <span className="font-mono">{activeCountry.dialCode}</span>.
          </span>
        )}
      </p>
    </div>
  );
}
