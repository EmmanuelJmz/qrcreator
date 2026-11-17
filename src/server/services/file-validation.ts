import path from 'path';
import sharp from 'sharp';

export const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB (compatible con límite de 4.5 MB en Vercel)
export const MAX_DOCUMENTS_PER_OWNER = 5;

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

export interface ValidatedImageResult {
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  fileSize: number;
}

export function detectImageSignature(buffer: Buffer): 'image/jpeg' | 'image/png' | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  return null;
}

export async function validateUploadedImage(
  buffer: Buffer,
  originalName: string,
): Promise<ValidatedImageResult> {
  if (!buffer || buffer.length === 0) {
    throw new Error('El archivo está vacío.');
  }
  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('El archivo excede el límite máximo de 4 MB.');
  }

  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('Solo se permiten imágenes en formato JPG, JPEG o PNG.');
  }

  const signatureMime = detectImageSignature(buffer);
  if (!signatureMime) {
    throw new Error('La firma binaria del archivo no corresponde a una imagen JPG o PNG válida.');
  }

  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height || (meta.format !== 'jpeg' && meta.format !== 'png')) {
    throw new Error('No se pudo decodificar la imagen o el formato no está soportado.');
  }
  if (meta.width > 10000 || meta.height > 10000) {
    throw new Error('Las dimensiones máximas permitidas para la imagen son 10000×10000 píxeles.');
  }

  const actualMime: 'image/jpeg' | 'image/png' =
    meta.format === 'jpeg' ? 'image/jpeg' : 'image/png';

  if (actualMime !== signatureMime) {
    throw new Error('El contenido real de la imagen no coincide con su cabecera.');
  }

  return {
    mimeType: actualMime,
    width: meta.width,
    height: meta.height,
    fileSize: buffer.length,
  };
}
