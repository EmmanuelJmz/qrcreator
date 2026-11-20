import { z } from 'zod';
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

export const uuidParamSchema = z.string().uuid('Identificador inválido.');
export const publicTokenParamSchema = z
  .string()
  .trim()
  .min(16, 'Token inválido.')
  .max(128, 'Token inválido.')
  .regex(/^[A-Za-z0-9_-]+$/, 'Token inválido.');
