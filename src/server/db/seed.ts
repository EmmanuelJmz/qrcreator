import crypto from 'crypto';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { getDb, isDatabaseConfigured } from './index.ts';
import { templates } from './schema.ts';
import { getStorageProvider, isStorageConfigured } from '../services/storage/index.ts';

interface StarterTemplateDef {
  name: string;
  originalName: string;
  width: number;
  height: number;
  svg: string;
}

export const CIRCULAR_DOME_TEMPLATES: StarterTemplateDef[] = [
  {
    name: 'Circular 5 cm · SOS QR Naranja (Gota)',
    originalName: 'circular-5cm-sos-naranja.png',
    width: 1000,
    height: 1000,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
      <circle cx="500" cy="500" r="494" fill="#0F172A"/>
      <circle cx="500" cy="500" r="466" fill="none" stroke="#F97316" stroke-width="20"/>
      <text x="500" y="138" text-anchor="middle" font-family="sans-serif" font-size="56" font-weight="800" fill="#FFFFFF" letter-spacing="2">SOS QR</text>
      <text x="500" y="186" text-anchor="middle" font-family="sans-serif" font-size="23" font-weight="700" fill="#FDBA74" letter-spacing="0.6">ESCANÉAME EN EMERGENCIAS</text>
      <rect x="250" y="222" width="500" height="500" rx="28" fill="#FFFFFF"/>
      <rect x="272" y="244" width="456" height="456" rx="18" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="10 8"/>
      <text x="500" y="786" text-anchor="middle" font-family="sans-serif" font-size="25" font-weight="700" fill="#FFFFFF">DATOS MÉDICOS Y CONTACTOS</text>
      <text x="500" y="830" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="700" fill="#F97316" letter-spacing="1.5">CASCOQR · IDENTIFICACIÓN</text>
    </svg>`,
  },
  {
    name: 'Circular 5 cm · Emergencia Médica Rojo (Gota)',
    originalName: 'circular-5cm-emergencia-rojo.png',
    width: 1000,
    height: 1000,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
      <circle cx="500" cy="500" r="494" fill="#DC2626"/>
      <circle cx="500" cy="500" r="458" fill="#FFFFFF"/>
      <rect x="488" y="82" width="24" height="52" rx="6" fill="#DC2626"/>
      <rect x="474" y="96" width="52" height="24" rx="6" fill="#DC2626"/>
      <text x="500" y="170" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="800" fill="#DC2626" letter-spacing="1">SOS · EMERGENCIA</text>
      <text x="500" y="205" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="700" fill="#0F172A">ESCANÉAME SI TENGO UN ACCIDENTE</text>
      <rect x="250" y="226" width="500" height="500" rx="26" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="4"/>
      <rect x="272" y="248" width="456" height="456" rx="18" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="10 8"/>
      <text x="500" y="786" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="800" fill="#0F172A">SANGRE · ALERGIAS · NSS</text>
      <text x="500" y="828" text-anchor="middle" font-family="sans-serif" font-size="19" font-weight="700" fill="#DC2626">CONTACTOS DIRECTOS AL ESCANEAR</text>
    </svg>`,
  },
  {
    name: 'Circular 5 cm · Moto Negro/Ámbar (Gota)',
    originalName: 'circular-5cm-moto-ambar.png',
    width: 1000,
    height: 1000,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
      <circle cx="500" cy="500" r="494" fill="#111827"/>
      <circle cx="500" cy="500" r="472" fill="none" stroke="#F59E0B" stroke-width="16"/>
      <circle cx="500" cy="500" r="446" fill="none" stroke="#374151" stroke-width="4"/>
      <text x="500" y="146" text-anchor="middle" font-family="sans-serif" font-size="44" font-weight="800" fill="#F59E0B" letter-spacing="1.5">¡ESCANÉAME!</text>
      <text x="500" y="192" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="700" fill="#F8FAFC" letter-spacing="0.6">EMERGENCIA MOTOCICLISTA</text>
      <rect x="250" y="222" width="500" height="500" rx="24" fill="#FFFFFF"/>
      <rect x="272" y="244" width="456" height="456" rx="16" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="10 8"/>
      <text x="500" y="786" text-anchor="middle" font-family="sans-serif" font-size="23" font-weight="700" fill="#F59E0B">FICHA MÉDICA Y CONTACTO SOS</text>
      <text x="500" y="828" text-anchor="middle" font-family="sans-serif" font-size="19" font-weight="600" fill="#CBD5E1">CASCOQR.APP</text>
    </svg>`,
  },
];

const STARTER_TEMPLATES: StarterTemplateDef[] = [
  ...CIRCULAR_DOME_TEMPLATES,
  {
    name: 'Etiqueta Identificación Horizontal',
    originalName: 'etiqueta-identificacion-horizontal.png',
    width: 1200,
    height: 600,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">
      <rect width="1200" height="600" rx="28" fill="#0F172A"/>
      <rect x="20" y="20" width="1160" height="560" rx="20" fill="#FFFFFF"/>
      <rect x="20" y="20" width="1160" height="104" rx="20" fill="#1D4ED8"/>
      <rect x="20" y="88" width="1160" height="36" fill="#1D4ED8"/>
      <text x="64" y="86" font-family="sans-serif" font-size="38" font-weight="700" fill="#FFFFFF" letter-spacing="1">CASCO IDENTIFICADO</text>
      <text x="64" y="210" font-family="sans-serif" font-size="34" font-weight="700" fill="#0F172A">FICHA DEL CONDUCTOR</text>
      <text x="64" y="264" font-family="sans-serif" font-size="24" fill="#475569">Escanea el código QR para consultar</text>
      <text x="64" y="300" font-family="sans-serif" font-size="24" fill="#475569">datos de contacto y documentos autorizados.</text>
      <rect x="64" y="360" width="520" height="2" fill="#E2E8F0"/>
      <text x="64" y="420" font-family="sans-serif" font-size="22" font-weight="600" fill="#1D4ED8">USO EN EMERGENCIA Y CONTROL</text>
      <text x="64" y="460" font-family="sans-serif" font-size="20" fill="#64748B">Etiqueta resistente para casco de motocicleta</text>
      <rect x="680" y="156" width="440" height="390" rx="18" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="3" stroke-dasharray="10 8"/>
    </svg>`,
  },
  {
    name: 'Etiqueta Compacta Seguridad Vial',
    originalName: 'etiqueta-compacta-seguridad.png',
    width: 900,
    height: 500,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500" viewBox="0 0 900 500">
      <rect width="900" height="500" fill="#F8FAFC"/>
      <rect x="16" y="16" width="868" height="468" rx="22" fill="#FFFFFF" stroke="#0F172A" stroke-width="6"/>
      <rect x="16" y="16" width="26" height="468" fill="#DC2626"/>
      <text x="72" y="96" font-family="sans-serif" font-size="34" font-weight="700" fill="#0F172A">REGISTRO DE CASCO</text>
      <text x="72" y="146" font-family="sans-serif" font-size="22" font-weight="600" fill="#DC2626">INFORMACIÓN PÚBLICA POR QR</text>
      <line x1="72" y1="184" x2="470" y2="184" stroke="#E2E8F0" stroke-width="3"/>
      <text x="72" y="242" font-family="sans-serif" font-size="21" fill="#334155">1. Abre la cámara de tu teléfono</text>
      <text x="72" y="286" font-family="sans-serif" font-size="21" fill="#334155">2. Enfoca el código QR</text>
      <text x="72" y="330" font-family="sans-serif" font-size="21" fill="#334155">3. Accede a la ficha vigente</text>
      <text x="72" y="425" font-family="sans-serif" font-size="18" font-weight="600" fill="#64748B">CascoQR · Etiqueta Oficial</text>
      <rect x="515" y="68" width="330" height="364" rx="16" fill="#F1F5F9" stroke="#94A3B8" stroke-width="2" stroke-dasharray="8 8"/>
    </svg>`,
  },
  {
    name: 'Etiqueta Vertical Casco',
    originalName: 'etiqueta-vertical-casco.png',
    width: 600,
    height: 900,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
      <rect width="600" height="900" fill="#0F172A"/>
      <rect x="24" y="24" width="552" height="852" rx="24" fill="#FFFFFF"/>
      <rect x="24" y="24" width="552" height="140" rx="24" fill="#0F172A"/>
      <text x="300" y="92" text-anchor="middle" font-family="sans-serif" font-size="36" font-weight="700" fill="#FFFFFF">CASCO SEGURO</text>
      <text x="300" y="134" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#93C5FD">ESCANEA EN CASO DE EMERGENCIA</text>
      <rect x="75" y="210" width="450" height="450" rx="20" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="3" stroke-dasharray="10 8"/>
      <text x="300" y="730" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="700" fill="#0F172A">FICHA DE PROPIETARIO</text>
      <text x="300" y="772" text-anchor="middle" font-family="sans-serif" font-size="19" fill="#475569">Datos de contacto y documentos autorizados</text>
      <text x="300" y="832" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="600" fill="#2563EB">CASCOQR.APP</text>
    </svg>`,
  },
];

let seeded = false;

export async function seedStarterTemplatesIfEmpty(): Promise<void> {
  if (seeded || !isDatabaseConfigured() || !isStorageConfigured()) return;

  const db = getDb();
  const countRes = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(templates);

  if ((countRes[0]?.total || 0) > 0) {
    seeded = true;
    return;
  }

  const storage = getStorageProvider();

  for (const tpl of STARTER_TEMPLATES) {
    const id = crypto.randomUUID();
    const storageKey = `templates/${id}.png`;
    const pngBuffer = await sharp(Buffer.from(tpl.svg)).png().toBuffer();

    await storage.putObject(storageKey, pngBuffer, 'image/png');
    await db.insert(templates).values({
      id,
      name: tpl.name,
      originalName: tpl.originalName,
      storageKey,
      mimeType: 'image/png',
      width: tpl.width,
      height: tpl.height,
    });
  }

  seeded = true;
}

export async function installCircularTemplatesPack(): Promise<{
  added: number;
  skipped: number;
}> {
  const db = getDb();
  const storage = getStorageProvider();
  const existingRows = await db
    .select({ originalName: templates.originalName })
    .from(templates);
  const existingNames = new Set(existingRows.map((r) => r.originalName));

  let added = 0;
  let skipped = 0;

  for (const tpl of CIRCULAR_DOME_TEMPLATES) {
    if (existingNames.has(tpl.originalName)) {
      skipped += 1;
      continue;
    }
    const id = crypto.randomUUID();
    const storageKey = `templates/${id}.png`;
    const pngBuffer = await sharp(Buffer.from(tpl.svg)).png().toBuffer();

    await storage.putObject(storageKey, pngBuffer, 'image/png');
    await db.insert(templates).values({
      id,
      name: tpl.name,
      originalName: tpl.originalName,
      storageKey,
      mimeType: 'image/png',
      width: tpl.width,
      height: tpl.height,
    });
    added += 1;
  }

  return { added, skipped };
}

export function resetSeedFlagForTests(): void {
  seeded = false;
}
