import { PHONE_REGEX } from './utils.ts';

export type PhoneCountryIso =
  | 'MX'
  | 'US'
  | 'CA'
  | 'GT'
  | 'CO'
  | 'AR'
  | 'CL'
  | 'PE'
  | 'ES';

export interface PhoneCountryOption {
  iso: PhoneCountryIso;
  name: string;
  dialCode: string;
  digitsLength: number;
  placeholder: string;
}

export const PHONE_COUNTRY_OPTIONS: readonly PhoneCountryOption[] = [
  {
    iso: 'MX',
    name: 'México',
    dialCode: '+52',
    digitsLength: 10,
    placeholder: '7776343425',
  },
  {
    iso: 'US',
    name: 'Estados Unidos',
    dialCode: '+1',
    digitsLength: 10,
    placeholder: '5551234567',
  },
  {
    iso: 'CA',
    name: 'Canadá',
    dialCode: '+1',
    digitsLength: 10,
    placeholder: '4165550199',
  },
  {
    iso: 'GT',
    name: 'Guatemala',
    dialCode: '+502',
    digitsLength: 8,
    placeholder: '55551234',
  },
  {
    iso: 'CO',
    name: 'Colombia',
    dialCode: '+57',
    digitsLength: 10,
    placeholder: '3001234567',
  },
  {
    iso: 'AR',
    name: 'Argentina',
    dialCode: '+54',
    digitsLength: 10,
    placeholder: '1123456789',
  },
  {
    iso: 'CL',
    name: 'Chile',
    dialCode: '+56',
    digitsLength: 9,
    placeholder: '912345678',
  },
  {
    iso: 'PE',
    name: 'Perú',
    dialCode: '+51',
    digitsLength: 9,
    placeholder: '987654321',
  },
  {
    iso: 'ES',
    name: 'España',
    dialCode: '+34',
    digitsLength: 9,
    placeholder: '612345678',
  },
] as const;

export const DEFAULT_PHONE_COUNTRY_ISO: PhoneCountryIso = 'MX';

const COUNTRY_BY_ISO: Record<PhoneCountryIso, PhoneCountryOption> = Object.fromEntries(
  PHONE_COUNTRY_OPTIONS.map((c) => [c.iso, c]),
) as Record<PhoneCountryIso, PhoneCountryOption>;

// Sort longest dial code first so +502 matches before +52 / +51
const COUNTRIES_BY_DIAL_DESC = [...PHONE_COUNTRY_OPTIONS].sort(
  (a, b) => b.dialCode.length - a.dialCode.length,
);

export function getPhoneCountryByIso(iso: PhoneCountryIso): PhoneCountryOption {
  return COUNTRY_BY_ISO[iso] ?? COUNTRY_BY_ISO[DEFAULT_PHONE_COUNTRY_ISO];
}

export function parsePhoneWithCountry(
  rawPhone: string,
  preferredIso: PhoneCountryIso = DEFAULT_PHONE_COUNTRY_ISO,
): { country: PhoneCountryOption; localDigits: string } {
  const trimmed = rawPhone.trim();
  const preferred = getPhoneCountryByIso(preferredIso);

  if (!trimmed) {
    return { country: preferred, localDigits: '' };
  }

  if (trimmed.startsWith('+')) {
    const matched = COUNTRIES_BY_DIAL_DESC.filter((c) => trimmed.startsWith(c.dialCode));
    if (matched.length > 0) {
      const chosen =
        matched.find((c) => c.iso === preferredIso) ?? matched[0];
      const remainder = trimmed.slice(chosen.dialCode.length).replace(/\D/g, '');
      return {
        country: chosen,
        localDigits: remainder.slice(0, chosen.digitsLength),
      };
    }
  }

  // Legacy values stored without country code default to México (+52)
  const onlyDigits = trimmed.replace(/\D/g, '');
  const fallback = trimmed.startsWith('+') ? preferred : COUNTRY_BY_ISO.MX;
  return {
    country: fallback,
    localDigits: onlyDigits.slice(0, fallback.digitsLength),
  };
}

export function formatPhoneWithCountry(
  countryIso: PhoneCountryIso,
  rawDigits: string,
): string {
  const country = getPhoneCountryByIso(countryIso);
  const digits = rawDigits.replace(/\D/g, '').slice(0, country.digitsLength);
  if (!digits) return '';
  return `${country.dialCode} ${digits}`;
}

export function validateEmergencyPhone(rawPhone: string): string | null {
  const trimmed = rawPhone.trim();
  if (!trimmed) return null;

  if (!PHONE_REGEX.test(trimmed)) {
    return 'Formato de teléfono inválido.';
  }

  if (trimmed.startsWith('+')) {
    const matched = COUNTRIES_BY_DIAL_DESC.find((c) => trimmed.startsWith(c.dialCode));
    if (matched) {
      const digits = trimmed.slice(matched.dialCode.length).replace(/\D/g, '');
      if (digits.length !== matched.digitsLength) {
        return `El teléfono para ${matched.name} (${matched.dialCode}) debe tener ${matched.digitsLength} dígitos.`;
      }
      return null;
    }
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length !== 10) {
    return 'El teléfono debe tener exactamente 10 dígitos.';
  }
  return null;
}
