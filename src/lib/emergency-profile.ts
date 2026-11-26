export const BLOOD_TYPE_OPTIONS = [
  'O+',
  'O-',
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
] as const;

export type BloodType = (typeof BLOOD_TYPE_OPTIONS)[number];

export const RELATIONSHIP_OPTIONS = [
  { id: 'mama', label: 'Mamá' },
  { id: 'papa', label: 'Papá' },
  { id: 'pareja', label: 'Esposo(a) / Pareja' },
  { id: 'hermano', label: 'Hermano(a)' },
  { id: 'hijo', label: 'Hijo(a)' },
  { id: 'tio', label: 'Tío(a)' },
  { id: 'amigo', label: 'Amigo(a)' },
  { id: 'otro', label: 'Otro' },
] as const;

export type RelationshipType = (typeof RELATIONSHIP_OPTIONS)[number]['id'];

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  mama: 'Mamá',
  papa: 'Papá',
  pareja: 'Esposo(a) / Pareja',
  hermano: 'Hermano(a)',
  hijo: 'Hijo(a)',
  tio: 'Tío(a)',
  amigo: 'Amigo(a)',
  otro: 'Otro',
};

export type OrganDonorStatus = 'unspecified' | 'yes' | 'no';

export const COMMON_ALLERGIES = [
  'Penicilina',
  'Antibióticos / Sulfas',
  'Analgésicos (AINES / Ibuprofeno)',
  'Látex',
  'Mariscos',
  'Picadura de insectos',
] as const;

export const COMMON_CONDITIONS = [
  'Diabetes (azúcar)',
  'Hipertensión (presión alta)',
  'Gastritis / Úlcera',
  'Asma',
  'Epilepsia / Convulsiones',
  'Problemas cardíacos',
  'Trastorno de coagulación',
] as const;

export const INSURANCE_INSTITUTION_PRESETS = [
  'IMSS',
  'ISSSTE',
  'IMSS-Bienestar',
  'Cruz Roja',
  'Seguro privado',
] as const;

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: RelationshipType | '';
  relationshipCustom: string;
}

export interface EmergencyTagGroup {
  noneKnown: boolean;
  selected: string[];
  custom: string[];
}

export interface EmergencyMedications {
  noneKnown: boolean;
  items: string[];
}

export interface EmergencyInsurance {
  institution: string;
  nss: string;
  policyNumber: string;
  clinic: string;
}

export type LocationShareContactSlot = 'contact1' | 'contact2' | '';

export interface EmergencyLocationShare {
  enabled: boolean;
  targetContact: LocationShareContactSlot;
}

export interface OwnerEmergencyProfile {
  birthDate: string;
  bloodType: BloodType | '';
  organDonor: OrganDonorStatus;
  cityState: string;
  contact1: EmergencyContact;
  contact2: EmergencyContact;
  locationShare: EmergencyLocationShare;
  allergies: EmergencyTagGroup;
  conditions: EmergencyTagGroup;
  medications: EmergencyMedications;
  insurance: EmergencyInsurance;
  rescueNotes: string;
}

export function createEmptyEmergencyContact(): EmergencyContact {
  return {
    name: '',
    phone: '',
    relationship: '',
    relationshipCustom: '',
  };
}

export function createEmptyEmergencyProfile(): OwnerEmergencyProfile {
  return {
    birthDate: '',
    bloodType: '',
    organDonor: 'unspecified',
    cityState: '',
    contact1: createEmptyEmergencyContact(),
    contact2: createEmptyEmergencyContact(),
    locationShare: { enabled: false, targetContact: '' },
    allergies: { noneKnown: false, selected: [], custom: [] },
    conditions: { noneKnown: false, selected: [], custom: [] },
    medications: { noneKnown: false, items: [] },
    insurance: { institution: '', nss: '', policyNumber: '', clinic: '' },
    rescueNotes: '',
  };
}

function cleanStringList(raw: unknown, maxItems = 20, maxLen = 80): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().slice(0, maxLen);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeContact(raw: unknown): EmergencyContact {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rel =
    typeof src.relationship === 'string' &&
    RELATIONSHIP_OPTIONS.some((opt) => opt.id === src.relationship)
      ? (src.relationship as RelationshipType)
      : '';
  return {
    name: typeof src.name === 'string' ? src.name.trim().slice(0, 100) : '',
    phone: typeof src.phone === 'string' ? src.phone.trim().slice(0, 30) : '',
    relationship: rel,
    relationshipCustom:
      rel === 'otro' && typeof src.relationshipCustom === 'string'
        ? src.relationshipCustom.trim().slice(0, 40)
        : '',
  };
}

function normalizeTagGroup(raw: unknown): EmergencyTagGroup {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const noneKnown = Boolean(src.noneKnown);
  if (noneKnown) {
    return { noneKnown: true, selected: [], custom: [] };
  }
  return {
    noneKnown: false,
    selected: cleanStringList(src.selected, 15, 80),
    custom: cleanStringList(src.custom, 20, 80),
  };
}

function normalizeMedications(raw: unknown): EmergencyMedications {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const noneKnown = Boolean(src.noneKnown);
  if (noneKnown) {
    return { noneKnown: true, items: [] };
  }
  return {
    noneKnown: false,
    items: cleanStringList(src.items, 20, 80),
  };
}

function normalizeInsurance(raw: unknown): EmergencyInsurance {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    institution:
      typeof src.institution === 'string' ? src.institution.trim().slice(0, 80) : '',
    nss: typeof src.nss === 'string' ? src.nss.trim().slice(0, 40) : '',
    policyNumber:
      typeof src.policyNumber === 'string' ? src.policyNumber.trim().slice(0, 60) : '',
    clinic: typeof src.clinic === 'string' ? src.clinic.trim().slice(0, 80) : '',
  };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeBirthDate(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const val = raw.trim();
  if (!ISO_DATE_RE.test(val)) return '';
  const age = calculateAgeFromBirthDate(val);
  if (age === null) return '';
  return val;
}

export function syncLocationShareWithContacts(
  contact1: EmergencyContact,
  contact2: EmergencyContact,
  rawShare?: Partial<EmergencyLocationShare> | null,
): EmergencyLocationShare {
  const hasC1 = Boolean(contact1.phone.trim());
  const hasC2 = Boolean(contact2.phone.trim());

  if (!rawShare?.enabled || (!hasC1 && !hasC2)) {
    return { enabled: false, targetContact: '' };
  }

  if (hasC1 && !hasC2) {
    return { enabled: true, targetContact: 'contact1' };
  }
  if (!hasC1 && hasC2) {
    return { enabled: true, targetContact: 'contact2' };
  }

  return {
    enabled: true,
    targetContact: rawShare.targetContact === 'contact2' ? 'contact2' : 'contact1',
  };
}

export function normalizeEmergencyProfile(raw: unknown): OwnerEmergencyProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;

  const bloodType: BloodType | '' =
    typeof src.bloodType === 'string' &&
    (BLOOD_TYPE_OPTIONS as readonly string[]).includes(src.bloodType)
      ? (src.bloodType as BloodType)
      : '';

  const organDonor: OrganDonorStatus =
    src.organDonor === 'yes' || src.organDonor === 'no' ? src.organDonor : 'unspecified';

  const contact1 = normalizeContact(src.contact1);
  const contact2 = normalizeContact(src.contact2);
  const rawShare =
    src.locationShare && typeof src.locationShare === 'object'
      ? (src.locationShare as Partial<EmergencyLocationShare>)
      : null;

  const profile: OwnerEmergencyProfile = {
    birthDate: normalizeBirthDate(src.birthDate),
    bloodType,
    organDonor,
    cityState: typeof src.cityState === 'string' ? src.cityState.trim().slice(0, 80) : '',
    contact1,
    contact2,
    locationShare: syncLocationShareWithContacts(contact1, contact2, rawShare),
    allergies: normalizeTagGroup(src.allergies),
    conditions: normalizeTagGroup(src.conditions),
    medications: normalizeMedications(src.medications),
    insurance: normalizeInsurance(src.insurance),
    rescueNotes:
      typeof src.rescueNotes === 'string' ? src.rescueNotes.trim().slice(0, 280) : '',
  };

  return hasEmergencyProfileData(profile) ? profile : null;
}

export function hasContactData(contact: EmergencyContact): boolean {
  return Boolean(contact.name || contact.phone);
}

export function hasEmergencyProfileData(
  profile?: OwnerEmergencyProfile | null,
): boolean {
  if (!profile) return false;
  return Boolean(
    profile.birthDate ||
      profile.bloodType ||
      profile.organDonor !== 'unspecified' ||
      profile.cityState ||
      hasContactData(profile.contact1) ||
      hasContactData(profile.contact2) ||
      profile.allergies.noneKnown ||
      profile.allergies.selected.length > 0 ||
      profile.allergies.custom.length > 0 ||
      profile.conditions.noneKnown ||
      profile.conditions.selected.length > 0 ||
      profile.conditions.custom.length > 0 ||
      profile.medications.noneKnown ||
      profile.medications.items.length > 0 ||
      profile.insurance.institution ||
      profile.insurance.nss ||
      profile.insurance.policyNumber ||
      profile.insurance.clinic ||
      profile.rescueNotes,
  );
}

export function calculateAgeFromBirthDate(
  birthDate: string,
  refDate = new Date(),
): number | null {
  if (!ISO_DATE_RE.test(birthDate)) return null;
  const [yStr, mStr, dStr] = birthDate.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  const refYear = refDate.getFullYear();
  const refMonth = refDate.getMonth() + 1;
  const refDay = refDate.getDate();

  let age = refYear - year;
  if (refMonth < month || (refMonth === month && refDay < day)) {
    age -= 1;
  }

  if (age < 0 || age > 120) return null;
  return age;
}

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export function formatBirthDateEs(birthDate: string): string {
  if (!ISO_DATE_RE.test(birthDate)) return '';
  const [yStr, mStr, dStr] = birthDate.split('-');
  const mIdx = Number(mStr) - 1;
  const day = Number(dStr);
  if (mIdx < 0 || mIdx > 11 || !day) return birthDate;
  return `${day} ${MONTHS_ES[mIdx]} ${yStr}`;
}

export function formatRelationshipLabel(contact: EmergencyContact): string {
  if (!contact.relationship) return '';
  if (contact.relationship === 'otro') {
    return contact.relationshipCustom.trim() || 'Contacto de emergencia';
  }
  return RELATIONSHIP_LABELS[contact.relationship] || '';
}

export function resolveLocationShareRecipient(
  profile?: OwnerEmergencyProfile | null,
): { slot: 'contact1' | 'contact2'; contact: EmergencyContact } | null {
  if (!profile?.locationShare?.enabled) return null;

  const hasC1 = Boolean(profile.contact1.phone.trim());
  const hasC2 = Boolean(profile.contact2.phone.trim());
  if (!hasC1 && !hasC2) return null;

  if (profile.locationShare.targetContact === 'contact2' && hasC2) {
    return { slot: 'contact2', contact: profile.contact2 };
  }
  if (hasC1) {
    return { slot: 'contact1', contact: profile.contact1 };
  }
  if (hasC2) {
    return { slot: 'contact2', contact: profile.contact2 };
  }
  return null;
}

export function normalizePhoneForWhatsApp(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (!trimmed.startsWith('+') && digits.length === 10) {
    return `52${digits}`;
  }
  return digits;
}

export function buildEmergencyWhatsAppUrl(params: {
  phone: string;
  ownerFullName: string;
  latitude?: number | null;
  longitude?: number | null;
}): string | null {
  const waNumber = normalizePhoneForWhatsApp(params.phone);
  if (!waNumber) return null;

  const ownerName = params.ownerFullName.trim() || 'el propietario del casco';
  const hasCoords =
    typeof params.latitude === 'number' &&
    Number.isFinite(params.latitude) &&
    typeof params.longitude === 'number' &&
    Number.isFinite(params.longitude);

  const message = hasCoords
    ? `EMERGENCIA CASCOQR: Escaneé el casco de ${ownerName}. Esta es la ubicación actual: https://maps.google.com/?q=${params.latitude!.toFixed(6)},${params.longitude!.toFixed(6)}`
    : `EMERGENCIA CASCOQR: Escaneé el casco de ${ownerName} y necesito comunicarme contigo de inmediato.`;

  return `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
}
