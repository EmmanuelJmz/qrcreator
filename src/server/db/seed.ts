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

const STARTER_TEMPLATES: StarterTemplateDef[] = [
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

export function resetSeedFlagForTests(): void {
  seeded = false;
}
