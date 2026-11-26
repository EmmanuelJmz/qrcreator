import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  clampSquareLabelGeometry,
  computeSquareHeightPct,
  defaultSquareLabelGeometry,
  validateLabelGeometry,
} from '@/src/lib/qr-geometry';
import { QR_STYLE_IDS, renderStyledQrSvg } from '@/src/lib/qr-styled';
import {
  buildOwnerOverrideFromTheme,
  computeBannerVisuals,
  computeLogoOverhangPx,
  DEFAULT_PUBLIC_CARD_THEME,
  mergeThemeWithOwnerOverride,
  normalizeOwnerCardOverride,
  normalizePublicCardTheme,
} from '@/src/lib/public-card-theme';
import {
  buildEmergencyWhatsAppUrl,
  calculateAgeFromBirthDate,
  createEmptyEmergencyContact,
  formatBirthDateEs,
  formatRelationshipLabel,
  normalizeEmergencyProfile,
  resolveLocationShareRecipient,
  syncLocationShareWithContacts,
} from '@/src/lib/emergency-profile';
import { computeExactSheetCapacity } from '@/src/lib/print-sheet-layout';
import {
  formatPhoneWithCountry,
  parsePhoneWithCountry,
  validateEmergencyPhone,
} from '@/src/lib/phone-countries';
import {
  emergencyProfileSchema,
  labelConfigSchema,
  ownerCardThemeOverrideSchema,
  ownerInfoSchema,
  printSheetSchema,
  publicCardThemeSchema,
} from '@/src/server/schemas';
import {
  composePrintSheetPdf,
  composePrintSheetPng,
  generateQrPngBuffer,
} from '@/src/server/services/label-render.service';
import {
  createAdminSessionToken,
  SessionSecretNotConfiguredError,
} from '@/src/server/services/admin-auth.service';
import { detectImageSignature } from '@/src/server/services/file-validation';
import {
  decryptPublicToken,
  encryptPublicToken,
  generatePublicToken,
  hashPublicToken,
  TokenEncryptionNotConfiguredError,
} from '@/src/server/services/token.service';

import { isDatabaseConfigured } from '@/src/server/db';
import {
  DEFAULT_R2_S3_API_URL,
  isStorageConfigured,
  resolveR2Config,
} from '@/src/server/services/storage';

describe('Geometría cuadrada 1:1 y límites del editor QR', () => {
  it('mantiene proporción cuadrada 1:1 en plantillas rectangulares (1200x600)', () => {
    const height = computeSquareHeightPct(20, 1200, 600);
    expect(height).toBe(40);
    const check = validateLabelGeometry({ x: 10, y: 10, width: 20, height: 40 }, 1200, 600);
    expect(check.valid).toBe(true);
  });

  it('rechaza coordenadas negativas, ancho menor a 5% o desbordamiento > 100%', () => {
    expect(validateLabelGeometry({ x: -1, y: 10, width: 20, height: 20 }, 1000, 1000).valid).toBe(false);
    expect(validateLabelGeometry({ x: 10, y: -0.5, width: 20, height: 20 }, 1000, 1000).valid).toBe(false);
    expect(validateLabelGeometry({ x: 10, y: 10, width: 0, height: 0 }, 1000, 1000).valid).toBe(false);
    expect(validateLabelGeometry({ x: 10, y: 10, width: 4.5, height: 4.5 }, 1000, 1000).valid).toBe(false);
    expect(validateLabelGeometry({ x: 85, y: 10, width: 20, height: 20 }, 1000, 1000).valid).toBe(false);
    expect(validateLabelGeometry({ x: 10, y: 85, width: 20, height: 20 }, 1000, 1000).valid).toBe(false);
  });

  it('rechaza QR rectangular deformado (> 1 px de diferencia)', () => {
    expect(validateLabelGeometry({ x: 10, y: 10, width: 20, height: 35 }, 1000, 1000).valid).toBe(false);
    expect(validateLabelGeometry({ x: 10, y: 10, width: 20, height: 20.5 }, 1000, 1000).valid).toBe(false);
  });

  it('limita el desplazamiento dentro del área [0, 100]% sin deformar', () => {
    const clamped = clampSquareLabelGeometry({ x: 95, y: 95, width: 20 }, 1200, 600);
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(100);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(100);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
    expect(validateLabelGeometry(clamped, 1200, 600).valid).toBe(true);
  });
});

describe('Seguridad criptográfica de tokens y firma binaria de archivos', () => {
  it('genera tokens únicos de alta entropía, los hashea y los cifra/descifra', () => {
    const t1 = generatePublicToken();
    const t2 = generatePublicToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThanOrEqual(40);
    expect(hashPublicToken(t1)).toHaveLength(64);
    const enc = encryptPublicToken(t1);
    expect(enc).not.toContain(t1);
    expect(decryptPublicToken(enc)).toBe(t1);
  });

  it('valida magic bytes reales de PNG y JPEG y rechaza payloads falsos', () => {
    const fakeSvg = Buffer.from('<svg></svg>');
    expect(detectImageSignature(fakeSvg)).toBeNull();

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(detectImageSignature(pngHeader)).toBe('image/png');

    const jpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectImageSignature(jpgHeader)).toBe('image/jpeg');
  });

  it('resuelve endpoint y bucket de Cloudflare R2 desde S3 API URL y protege URLs placeholder', () => {
    const r2 = resolveR2Config();
    expect(DEFAULT_R2_S3_API_URL).toContain('r2.cloudflarestorage.com/qrimages');
    expect(r2.endpoint).toBe('https://e749a5c3d625e2a80eef9b33b5a97e31.r2.cloudflarestorage.com');
    expect(r2.bucket).toBe('qrimages');
    expect(r2.region).toBe('auto');
    expect(r2.forcePathStyle).toBe(true);
    expect(isStorageConfigured()).toBe(false);

    const prevDb = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      'postgresql://AUN NO LAS PONDRÉ@ep-wandering-water-bdrfb5k6-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require';
    expect(isDatabaseConfigured()).toBe(false);
    if (prevDb === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = prevDb;
    }
  });

  it('exige TOKEN_ENCRYPTION_KEY y SESSION_SECRET explícitos cuando VERCEL=1', async () => {
    const prevVercel = process.env.VERCEL;
    const prevTokenKey = process.env.TOKEN_ENCRYPTION_KEY;
    const prevSession = process.env.SESSION_SECRET;

    process.env.VERCEL = '1';
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.SESSION_SECRET;

    try {
      expect(() => encryptPublicToken('sample-token')).toThrow(TokenEncryptionNotConfiguredError);
      await expect(createAdminSessionToken('admin')).rejects.toThrow(
        SessionSecretNotConfiguredError,
      );
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
      if (prevTokenKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
      else process.env.TOKEN_ENCRYPTION_KEY = prevTokenKey;
      if (prevSession === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = prevSession;
    }
  });

  it('valida que nombre y apellidos solo acepten letras y valida formato de email y teléfono', () => {
    const valid = ownerInfoSchema.safeParse({
      firstName: '  María   José ',
      lastName: "Pérez-O'Connor",
      email: 'maria@ejemplo.com',
      phone: '+52 55 1234-5678',
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.firstName).toBe('María José');
    }

    expect(
      ownerInfoSchema.safeParse({ firstName: 'Juan123', lastName: 'López' }).success,
    ).toBe(false);
    expect(
      ownerInfoSchema.safeParse({ firstName: 'Juan', lastName: 'López@#' }).success,
    ).toBe(false);
    expect(
      ownerInfoSchema.safeParse({
        firstName: 'Juan',
        lastName: 'López',
        email: 'correo-invalido',
      }).success,
    ).toBe(false);
    expect(
      ownerInfoSchema.safeParse({
        firstName: 'Juan',
        lastName: 'López',
        phone: 'abc-tel',
      }).success,
    ).toBe(false);
  });

  it('genera los 4 estilos de QR en SVG y PNG cuadrado', async () => {
    const sampleUrl = 'https://cascoqr.app/ficha/ejemplo-token-123';

    for (const style of QR_STYLE_IDS) {
      const svg = renderStyledQrSvg(sampleUrl, { style });
      expect(svg).toContain('<svg');
      expect(svg).toContain('<path d="M');

      const png = await generateQrPngBuffer(sampleUrl, 240, style);
      const meta = await sharp(png).metadata();
      expect(meta.format).toBe('png');
      expect(meta.width).toBe(240);
      expect(meta.height).toBe(240);
    }

    expect(renderStyledQrSvg(sampleUrl, { style: 'classic' })).toContain('fill="#000000"');
    expect(renderStyledQrSvg(sampleUrl, { style: 'fluid' })).toContain('fill="#DC4C0D"');
    expect(renderStyledQrSvg(sampleUrl, { style: 'dots' })).toContain('<circle');
    expect(renderStyledQrSvg(sampleUrl, { style: 'rounded' })).toContain('<linearGradient');
    expect(renderStyledQrSvg(sampleUrl, { style: 'diamonds' })).toContain('fill="#DC2626"');
  });

  it('conserva precisión de 2 decimales (ej. 45.21 y 67.98) en geometría 1:1', () => {
    const clamped = clampSquareLabelGeometry({ x: 45.21, y: 67.98, width: 20.15 }, 1000, 1000);
    expect(clamped).toEqual({ x: 45.21, y: 67.98, width: 20.15, height: 20.15 });
    expect(validateLabelGeometry(clamped, 1000, 1000).valid).toBe(true);
  });

  it('valida qrStyle en labelConfigSchema y asigna fluid por defecto', () => {
    const base = {
      templateId: '550e8400-e29b-41d4-a716-446655440000',
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    };

    const withDefault = labelConfigSchema.safeParse(base);
    expect(withDefault.success).toBe(true);
    if (withDefault.success) {
      expect(withDefault.data.qrStyle).toBe('fluid');
    }

    for (const style of QR_STYLE_IDS) {
      const parsed = labelConfigSchema.safeParse({ ...base, qrStyle: style });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.qrStyle).toBe(style);
      }
    }

    expect(labelConfigSchema.safeParse({ ...base, qrStyle: 'invalid-style' }).success).toBe(false);
  });

  it('valida printSheetSchema (1..20 etiquetas y 2..4 columnas) y genera hojas Carta y Tabloide en PNG', async () => {
    const sampleId = '550e8400-e29b-41d4-a716-446655440000';
    expect(
      printSheetSchema.safeParse({
        ownerIds: [sampleId],
        paperSize: 'letter',
        columns: 3,
        cutGuides: true,
        gapSize: 'normal',
      }).success,
    ).toBe(true);

    expect(
      printSheetSchema.safeParse({
        ownerIds: [],
        paperSize: 'letter',
        columns: 3,
      }).success,
    ).toBe(false);

    expect(
      printSheetSchema.safeParse({
        ownerIds: Array.from({ length: 21 }, (_, idx) => `550e8400-e29b-41d4-a716-4466554400${String(idx).padStart(2, '0')}`),
        paperSize: 'tabloid',
        columns: 4,
      }).success,
    ).toBe(false);

    expect(
      printSheetSchema.safeParse({
        ownerIds: [sampleId],
        paperSize: 'letter',
        columns: 5,
      }).success,
    ).toBe(false);

    const templateBuffer = await sharp({
      create: {
        width: 400,
        height: 240,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();

    const items = [
      {
        ownerId: sampleId,
        templateStorageKey: 'templates/test.png',
        templateWidth: 400,
        templateHeight: 240,
        positionX: 10,
        positionY: 10,
        widthPct: 25,
        publicUrl: 'https://cascoqr.app/ficha/demo-1',
        qrStyle: 'classic' as const,
        cachedTemplateBuffer: templateBuffer,
      },
      {
        ownerId: '550e8400-e29b-41d4-a716-446655440001',
        templateStorageKey: 'templates/test.png',
        templateWidth: 400,
        templateHeight: 240,
        positionX: 10,
        positionY: 10,
        widthPct: 25,
        publicUrl: 'https://cascoqr.app/ficha/demo-2',
        qrStyle: 'fluid' as const,
        cachedTemplateBuffer: templateBuffer,
      },
    ];

    const letterSheet = await composePrintSheetPng(items, {
      paperSize: 'letter',
      columns: 2,
      cutGuides: true,
      gapSize: 'normal',
    });
    const letterMeta = await sharp(letterSheet).metadata();
    expect(letterMeta.format).toBe('png');
    expect(letterMeta.width).toBe(1275);
    expect(letterMeta.height).toBe(1650);

    const tabloidSheet = await composePrintSheetPng(items, {
      paperSize: 'tabloid',
      columns: 3,
      cutGuides: false,
      gapSize: 'compact',
    });
    const tabloidMeta = await sharp(tabloidSheet).metadata();
    expect(tabloidMeta.format).toBe('png');
    expect(tabloidMeta.width).toBe(1650);
    expect(tabloidMeta.height).toBe(2550);
  });

  it('normaliza diseño de ficha pública, fusiona personalización híbrida y calcula contraste y overhang del logo', () => {
    const normalized = normalizePublicCardTheme({
      headerColor: '#1e293b',
      headerHeight: 400, // clamped to 280
      logoX: 2, // clamped to 5
      logoY: 160, // clamped to 130
      logoSize: 30, // clamped to 56
    });
    expect(normalized.headerColor).toBe('#1E293B');
    expect(normalized.headerHeight).toBe(280);
    expect(normalized.logoX).toBe(5);
    expect(normalized.logoY).toBe(130);
    expect(normalized.logoSize).toBe(56);

    // Hybrid merge: global stays intact when override is null or useGlobalTheme is true
    const untouched = mergeThemeWithOwnerOverride(DEFAULT_PUBLIC_CARD_THEME, null);
    expect(untouched.headerColor).toBe('#F97316');

    const customized = mergeThemeWithOwnerOverride(DEFAULT_PUBLIC_CARD_THEME, {
      useGlobalTheme: false,
      headerColor: '#2563EB',
      subtitleText: 'Motoclub Halcones',
      pageBg: 'dark',
    });
    expect(customized.headerColor).toBe('#2563EB');
    expect(customized.subtitleText).toBe('Motoclub Halcones');
    expect(customized.pageBg).toBe('dark');
    expect(customized.brandName).toBe('CascoQR'); // inherited from global

    // Luminance contrast check
    expect(computeBannerVisuals('#F8FAFC').textColor).toBe('#0F172A');
    expect(computeBannerVisuals('#0F172A').textColor).toBe('#FFFFFF');

    // Logo overhang
    expect(
      computeLogoOverhangPx({
        logoVisible: true,
        logoY: 100,
        logoSize: 112,
        headerHeight: 160,
      }),
    ).toBe(56);
    expect(
      computeLogoOverhangPx({
        logoVisible: true,
        logoY: 50,
        logoSize: 80,
        headerHeight: 160,
      }),
    ).toBe(0);

    // Schema validation
    expect(
      publicCardThemeSchema.safeParse({
        brandName: 'Mi Club',
        headerColor: 'no-es-hex',
      }).success,
    ).toBe(false);
    expect(
      ownerCardThemeOverrideSchema.safeParse({
        useGlobalTheme: false,
        headerColor: '#DC2626',
        subtitleText: 'VIP',
      }).success,
    ).toBe(true);

    // Full-layout per-owner override & revert
    const fullOverride = buildOwnerOverrideFromTheme({
      ...DEFAULT_PUBLIC_CARD_THEME,
      brandName: 'Escuadra Norte',
      subtitleText: 'Unidad 07',
      showBrandName: true,
      showSubtitle: false,
      headerColor: '#059669',
      headerHeight: 240,
      logoVisible: false,
      logoShape: 'square',
      logoSize: 80,
      logoX: 20,
      logoY: 40,
      pageBg: 'warm',
      showLabelPreviewButton: false,
      footerNote: 'Solo uso interno',
    });
    const mergedFull = mergeThemeWithOwnerOverride(DEFAULT_PUBLIC_CARD_THEME, fullOverride);
    expect(mergedFull).toMatchObject({
      brandName: 'Escuadra Norte',
      headerColor: '#059669',
      headerHeight: 240,
      logoVisible: false,
      logoShape: 'square',
      logoSize: 80,
      logoX: 20,
      logoY: 40,
      pageBg: 'warm',
      showSubtitle: false,
      showLabelPreviewButton: false,
      footerNote: 'Solo uso interno',
    });
    expect(normalizeOwnerCardOverride({ useGlobalTheme: true })).toBeNull();
  });

  it('normaliza ficha de emergencia, calcula edad, formatea parentesco y valida esquema médico y NSS', () => {
    expect(normalizeEmergencyProfile(null)).toBeNull();
    expect(normalizeEmergencyProfile({})).toBeNull();

    const ref = new Date(2026, 10, 23); // 23 nov 2026
    expect(calculateAgeFromBirthDate('1994-06-15', ref)).toBe(32);
    expect(calculateAgeFromBirthDate('1994-12-01', ref)).toBe(31);
    expect(calculateAgeFromBirthDate('2025-02-29', ref)).toBeNull();
    expect(formatBirthDateEs('1994-06-15')).toBe('15 jun 1994');

    const normalized = normalizeEmergencyProfile({
      birthDate: '1994-06-15',
      bloodType: 'O+',
      organDonor: 'yes',
      cityState: '  Monterrey, N.L. ',
      contact1: {
        name: '  Martha Ruiz ',
        phone: '+52 81 1234 5678',
        relationship: 'mama',
        relationshipCustom: 'Ignorado si no es otro',
      },
      contact2: {
        name: 'Carlos',
        phone: '8112340000',
        relationship: 'otro',
        relationshipCustom: '  Primo hermano ',
      },
      allergies: {
        noneKnown: false,
        selected: ['Penicilina', 'penicilina'],
        custom: ['  Yodo ', 'yodo', 'Polen'],
      },
      conditions: {
        noneKnown: true,
        selected: ['Asma'],
        custom: ['Algo'],
      },
      medications: {
        noneKnown: false,
        items: ['Metformina', 'metformina', 'Omeprazol'],
      },
      insurance: {
        institution: 'IMSS',
        nss: ' 12345678901 ',
        clinic: 'UMF 26',
      },
      rescueNotes: '  Casco rojo  ',
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.cityState).toBe('Monterrey, N.L.');
    expect(normalized?.contact1.relationshipCustom).toBe('');
    expect(normalized?.contact2.relationshipCustom).toBe('Primo hermano');
    expect(formatRelationshipLabel(normalized!.contact1)).toBe('Mamá');
    expect(formatRelationshipLabel(normalized!.contact2)).toBe('Primo hermano');
    expect(normalized?.allergies.selected).toEqual(['Penicilina']);
    expect(normalized?.allergies.custom).toEqual(['Yodo', 'Polen']);
    expect(normalized?.conditions).toEqual({ noneKnown: true, selected: [], custom: [] });
    expect(normalized?.medications.items).toEqual(['Metformina', 'Omeprazol']);
    expect(normalized?.insurance.nss).toBe('12345678901');
    expect(normalized?.rescueNotes).toBe('Casco rojo');

    expect(
      emergencyProfileSchema.safeParse({
        birthDate: '1994-06-15',
        bloodType: 'O+',
        contact1: {
          name: 'Ana',
          phone: '+52 55 1111 2222',
          relationship: 'mama',
        },
        insurance: { institution: 'IMSS', nss: '12345678901' },
      }).success,
    ).toBe(true);

    expect(
      emergencyProfileSchema.safeParse({
        contact1: { phone: 'telefono-invalido' },
      }).success,
    ).toBe(false);

    expect(
      emergencyProfileSchema.safeParse({
        birthDate: '2099-01-01',
      }).success,
    ).toBe(false);
  });

  it('parsea, formatea y valida teléfonos de emergencia con lada por país y 10 dígitos MX por defecto', () => {
    expect(parsePhoneWithCountry('')).toMatchObject({
      country: { iso: 'MX', dialCode: '+52' },
      localDigits: '',
    });

    // Legacy 10-digit number defaults to Mexico (+52)
    expect(parsePhoneWithCountry('7776343425')).toMatchObject({
      country: { iso: 'MX', dialCode: '+52' },
      localDigits: '7776343425',
    });

    // Matches +502 Guatemala before +52 Mexico
    expect(parsePhoneWithCountry('+502 55551234')).toMatchObject({
      country: { iso: 'GT', dialCode: '+502' },
      localDigits: '55551234',
    });

    expect(formatPhoneWithCountry('MX', '777-634-3425')).toBe('+52 7776343425');
    expect(formatPhoneWithCountry('US', '555123456789')).toBe('+1 5551234567');
    expect(formatPhoneWithCountry('MX', '')).toBe('');

    expect(validateEmergencyPhone('')).toBeNull();
    expect(validateEmergencyPhone('+52 7776343425')).toBeNull();
    expect(validateEmergencyPhone('7776343425')).toBeNull();
    expect(validateEmergencyPhone('+1 5551234567')).toBeNull();
    expect(validateEmergencyPhone('+502 55551234')).toBeNull();

    // Rejects incomplete numbers
    expect(validateEmergencyPhone('+52 777634')).toContain('10 dígitos');
    expect(validateEmergencyPhone('777634')).toContain('10 dígitos');
    expect(validateEmergencyPhone('+502 5555')).toContain('8 dígitos');
  });

  it('centra el QR automáticamente en plantillas cuadradas/circulares de gota 5 cm', () => {
    expect(defaultSquareLabelGeometry(1000, 1000)).toEqual({
      x: 28,
      y: 28,
      width: 44,
      height: 44,
    });
  });

  it('aplica reglas del switch de ubicación por WhatsApp (0/1/2 contactos) y genera enlace wa.me', () => {
    const empty = createEmptyEmergencyContact();
    const c1 = { name: 'Ana Ruiz', phone: '+52 5511223344', relationship: 'mama' as const, relationshipCustom: '' };
    const c2 = { name: 'Luis Díaz', phone: '8112345678', relationship: 'hermano' as const, relationshipCustom: '' };

    // 0 contacts -> forced disabled
    expect(syncLocationShareWithContacts(empty, empty, { enabled: true, targetContact: 'contact1' })).toEqual({
      enabled: false,
      targetContact: '',
    });

    // Only contact 1 -> auto assigns contact1
    expect(syncLocationShareWithContacts(c1, empty, { enabled: true, targetContact: '' })).toEqual({
      enabled: true,
      targetContact: 'contact1',
    });

    // Only contact 2 -> auto assigns contact2
    expect(syncLocationShareWithContacts(empty, c2, { enabled: true, targetContact: 'contact1' })).toEqual({
      enabled: true,
      targetContact: 'contact2',
    });

    // Both contacts -> respects chosen slot (contact1 or contact2)
    expect(syncLocationShareWithContacts(c1, c2, { enabled: true, targetContact: 'contact2' })).toEqual({
      enabled: true,
      targetContact: 'contact2',
    });

    // Build WhatsApp URL with and without coords (prepends 52 to 10-digit legacy number)
    const urlWithCoords = buildEmergencyWhatsAppUrl({
      phone: '8112345678',
      ownerFullName: 'Carlos Mendoza',
      latitude: 19.432608,
      longitude: -99.133209,
    });
    expect(urlWithCoords).toContain('https://wa.me/528112345678?text=');
    expect(decodeURIComponent(urlWithCoords!)).toContain('https://maps.google.com/?q=19.432608,-99.133209');

    const normalized = normalizeEmergencyProfile({
      contact1: c1,
      contact2: c2,
      locationShare: { enabled: true, targetContact: 'contact2' },
    });
    expect(resolveLocationShareRecipient(normalized)).toMatchObject({
      slot: 'contact2',
      contact: { phone: '8112345678' },
    });
  });

  it('calcula capacidad exacta en cm (5.0 cm en Carta = 12/hoja) y genera PDF 1:1 multipágina y PNG 300 DPI', async () => {
    const cap = computeExactSheetCapacity({
      paperSize: 'letter',
      exactSizeCm: 5.0,
      gapSize: 'normal',
    });
    expect(cap.maxCols).toBe(3);
    expect(cap.maxRows).toBe(4);
    expect(cap.perPage).toBe(12);

    const squareTpl = await sharp({
      create: {
        width: 500,
        height: 500,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const items = Array.from({ length: 15 }, (_, idx) => ({
      ownerId: `550e8400-e29b-41d4-a716-4466554400${String(idx).padStart(2, '0')}`,
      templateStorageKey: 'templates/circular.png',
      templateWidth: 500,
      templateHeight: 500,
      positionX: 28,
      positionY: 28,
      widthPct: 44,
      publicUrl: `https://cascoqr.app/ficha/demo-${idx}`,
      qrStyle: 'classic' as const,
      cachedTemplateBuffer: squareTpl,
    }));

    const pdfBuf = await composePrintSheetPdf(items, {
      paperSize: 'letter',
      columns: 3,
      cutGuides: true,
      gapSize: 'normal',
      sizeMode: 'exact',
      exactSizeCm: 5.0,
      cutGuideShape: 'circle',
      format: 'pdf',
    });
    expect(pdfBuf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    const loadedPdf = await PDFDocument.load(pdfBuf);
    expect(loadedPdf.getPageCount()).toBe(2);

    const exactPng = await composePrintSheetPng(items.slice(0, 2), {
      paperSize: 'letter',
      columns: 3,
      cutGuides: true,
      gapSize: 'normal',
      sizeMode: 'exact',
      exactSizeCm: 5.0,
      cutGuideShape: 'circle',
      format: 'png',
    });
    const meta = await sharp(exactPng).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(2550);
    expect(meta.height).toBe(3300);
    expect(meta.density).toBe(300);
  });
});
