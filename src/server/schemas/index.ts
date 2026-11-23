import { z } from 'zod';
import {
  BLOOD_TYPE_OPTIONS,
  calculateAgeFromBirthDate,
  RELATIONSHIP_OPTIONS,
} from '../../lib/emergency-profile.ts';
import { validateEmergencyPhone } from '../../lib/phone-countries.ts';
import { QR_STYLE_IDS } from '../../lib/qr-styled.ts';
import {
  EMAIL_REGEX,
  normalizePersonName,
  PERSON_NAME_REGEX,
  PHONE_REGEX,
} from '../../lib/utils.ts';

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'El usuario es obligatorio.').max(150),
  password: z.string().min(1, 'La contraseña es obligatoria.').max(200),
});

const optionalEmailSchema = z
  .string()
  .trim()
  .max(150, 'El correo electrónico no puede exceder 150 caracteres.')
  .refine(
    (val) => val === '' || EMAIL_REGEX.test(val),
    'Formato de correo electrónico inválido.',
  )
  .transform((val) => (val === '' ? null : val));

const optionalPhoneSchema = z
  .string()
  .trim()
  .max(30, 'El teléfono no puede exceder 30 caracteres.')
  .refine(
    (val) => val === '' || PHONE_REGEX.test(val),
    'Formato de teléfono inválido.',
  )
  .transform((val) => (val === '' ? null : val));

const firstNameSchema = z
  .string()
  .transform((val) => normalizePersonName(val))
  .pipe(
    z
      .string()
      .min(1, 'El nombre es obligatorio.')
      .max(100, 'El nombre no puede exceder 100 caracteres.')
      .regex(PERSON_NAME_REGEX, 'El nombre solo debe contener letras.'),
  );

const lastNameSchema = z
  .string()
  .transform((val) => normalizePersonName(val))
  .pipe(
    z
      .string()
      .min(1, 'Los apellidos son obligatorios.')
      .max(100, 'Los apellidos no pueden exceder 100 caracteres.')
      .regex(PERSON_NAME_REGEX, 'Los apellidos solo deben contener letras.'),
  );

export const ownerInfoSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  email: optionalEmailSchema.optional().default(''),
  phone: optionalPhoneSchema.optional().default(''),
});

export const qrStyleSchema = z.enum(QR_STYLE_IDS, {
  error: 'Estilo de código QR inválido.',
});

export const labelConfigSchema = z.object({
  templateId: z.string().uuid('La plantilla seleccionada no es válida.'),
  x: z.coerce.number().min(0, 'X no puede ser negativo.').max(100, 'X no puede exceder 100%.'),
  y: z.coerce.number().min(0, 'Y no puede ser negativo.').max(100, 'Y no puede exceder 100%.'),
  width: z.coerce
    .number()
    .min(5, 'El ancho mínimo del código QR es 5%.')
    .max(100, 'El ancho no puede exceder 100%.'),
  height: z.coerce
    .number()
    .gt(0, 'El alto debe ser mayor que 0.')
    .max(100, 'El alto no puede exceder 100%.'),
  qrStyle: qrStyleSchema.optional().default('fluid'),
});

export const ownerStatusSchema = z.object({
  status: z.boolean(),
});

export const documentVisibilitySchema = z.object({
  isPublic: z.boolean(),
});

export const templateCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre de la plantilla es obligatorio.')
    .max(255, 'El nombre no puede exceder 255 caracteres.'),
});

export const printSheetSchema = z.object({
  ownerIds: z
    .array(z.string().uuid('Identificador de propietario inválido.'))
    .min(1, 'Selecciona al menos un propietario para armar la hoja.')
    .max(20, 'Puedes incluir hasta 20 etiquetas por hoja.'),
  paperSize: z.enum(['letter', 'tabloid']).default('letter'),
  columns: z.coerce.number().int().min(2).max(4).default(3),
  cutGuides: z.boolean().default(true),
  gapSize: z.enum(['compact', 'normal']).default('normal'),
});

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'El color debe ser un código hexadecimal válido (ej. #F97316).');

export const publicCardThemeSchema = z.object({
  brandName: z.string().trim().min(1, 'El nombre visible es obligatorio.').max(60),
  subtitleText: z.string().trim().max(80).default(''),
  showBrandName: z.boolean().default(true),
  showSubtitle: z.boolean().default(true),
  headerColor: hexColorSchema.default('#F97316'),
  headerHeight: z.coerce.number().int().min(80).max(280).default(160),
  logoVisible: z.boolean().default(true),
  logoShape: z.enum(['circle', 'rounded', 'square', 'none']).default('circle'),
  logoSize: z.coerce.number().int().min(56).max(180).default(112),
  logoX: z.coerce.number().int().min(5).max(95).default(50),
  logoY: z.coerce.number().int().min(10).max(130).default(100),
  pageBg: z.enum(['slate', 'white', 'warm', 'dark']).default('slate'),
  showLabelPreviewButton: z.boolean().default(true),
  footerNote: z.string().trim().max(200).default(''),
});

export const ownerCardThemeOverrideSchema = z
  .object({
    useGlobalTheme: z.boolean().default(true),
    brandName: z.string().trim().max(60).nullable().optional(),
    subtitleText: z.string().trim().max(80).nullable().optional(),
    showBrandName: z.boolean().nullable().optional(),
    showSubtitle: z.boolean().nullable().optional(),
    headerColor: hexColorSchema.nullable().optional(),
    headerHeight: z.coerce.number().int().min(80).max(280).nullable().optional(),
    logoVisible: z.boolean().nullable().optional(),
    logoShape: z.enum(['circle', 'rounded', 'square', 'none']).nullable().optional(),
    logoSize: z.coerce.number().int().min(56).max(180).nullable().optional(),
    logoX: z.coerce.number().int().min(5).max(95).nullable().optional(),
    logoY: z.coerce.number().int().min(10).max(130).nullable().optional(),
    pageBg: z.enum(['slate', 'white', 'warm', 'dark']).nullable().optional(),
    showLabelPreviewButton: z.boolean().nullable().optional(),
    footerNote: z.string().trim().max(200).nullable().optional(),
  })
  .nullable()
  .optional();

const emergencyRelationshipIds = RELATIONSHIP_OPTIONS.map((r) => r.id) as [
  (typeof RELATIONSHIP_OPTIONS)[number]['id'],
  ...(typeof RELATIONSHIP_OPTIONS)[number]['id'][],
];

const emergencyContactSchema = z.object({
  name: z.string().trim().max(100).optional().default(''),
  phone: z
    .string()
    .trim()
    .max(30, 'El teléfono del contacto de emergencia no puede exceder 30 caracteres.')
    .refine(
      (val) => validateEmergencyPhone(val) === null,
      'El teléfono del contacto debe incluir los dígitos completos según su país (10 dígitos para México +52).',
    )
    .optional()
    .default(''),
  relationship: z
    .union([z.enum(emergencyRelationshipIds), z.literal('')])
    .optional()
    .default(''),
  relationshipCustom: z.string().trim().max(40).optional().default(''),
});

const emergencyTagGroupSchema = z.object({
  noneKnown: z.boolean().optional().default(false),
  selected: z.array(z.string().trim().max(80)).max(15).optional().default([]),
  custom: z.array(z.string().trim().max(80)).max(20).optional().default([]),
});

export const emergencyProfileSchema = z
  .object({
    birthDate: z
      .string()
      .trim()
      .refine(
        (val) => val === '' || calculateAgeFromBirthDate(val) !== null,
        'La fecha de nacimiento no es válida.',
      )
      .optional()
      .default(''),
    bloodType: z
      .union([z.enum(BLOOD_TYPE_OPTIONS), z.literal('')])
      .optional()
      .default(''),
    organDonor: z.enum(['unspecified', 'yes', 'no']).optional().default('unspecified'),
    cityState: z.string().trim().max(80).optional().default(''),
    contact1: emergencyContactSchema.optional(),
    contact2: emergencyContactSchema.optional(),
    allergies: emergencyTagGroupSchema.optional(),
    conditions: emergencyTagGroupSchema.optional(),
    medications: z
      .object({
        noneKnown: z.boolean().optional().default(false),
        items: z.array(z.string().trim().max(80)).max(20).optional().default([]),
      })
      .optional(),
    insurance: z
      .object({
        institution: z.string().trim().max(80).optional().default(''),
        nss: z.string().trim().max(40).optional().default(''),
        policyNumber: z.string().trim().max(60).optional().default(''),
        clinic: z.string().trim().max(80).optional().default(''),
      })
      .optional(),
    rescueNotes: z.string().trim().max(280).optional().default(''),
  })
  .nullable()
  .optional();

export const uuidParamSchema = z.string().uuid('Identificador inválido.');
export const publicTokenParamSchema = z
  .string()
  .trim()
  .min(16, 'Token inválido.')
  .max(128, 'Token inválido.')
  .regex(/^[A-Za-z0-9_-]+$/, 'Token inválido.');
