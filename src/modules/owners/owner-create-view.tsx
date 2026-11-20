import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Save, Trash2, Upload } from 'lucide-react';
import { OwnerCardThemeControl } from '@/src/components/owner-card-theme-control';
import { QRLabelCanvas } from '@/src/components/qr-label-canvas';
import { QrCoordinateInputs } from '@/src/components/qr-coordinate-inputs';
import { QrStyleSelector } from '@/src/components/qr-style-selector';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { PublicDocVisibilityControl } from '@/src/components/public-doc-visibility-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select';
import { apiClient, ApiError, type TemplateItem } from '@/src/lib/api-client';
import type { OwnerCardThemeOverride } from '@/src/lib/public-card-theme';
import {
  clampSquareLabelGeometry,
  defaultSquareLabelGeometry,
  type LabelGeometry,
} from '@/src/lib/qr-geometry';
import { renderStyledQrSvg, type QrStyle } from '@/src/lib/qr-styled';
import {
  EMAIL_REGEX,
  formatFileSize,
  isValidPersonName,
  normalizePersonName,
  PHONE_REGEX,
} from '@/src/lib/utils';

interface DraftDocument {
  id: string;
  file: File;
  previewUrl: string;
  isPublic: boolean;
}

interface OwnerCreateViewProps {
  onCancel: () => void;
  onCreated: () => void;
}

const MAX_DOCS = 5;
const MAX_SIZE = 4 * 1024 * 1024;
const MAX_BATCH_BYTES = Math.floor(3.8 * 1024 * 1024);

export function OwnerCreateView({ onCancel, onCreated }: OwnerCreateViewProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [draftDocs, setDraftDocs] = useState<DraftDocument[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [qrStyle, setQrStyle] = useState<QrStyle>('classic');
  const [geometry, setGeometry] = useState<LabelGeometry>({ x: 65, y: 20, width: 20, height: 20 });
  const [cardThemeOverride, setCardThemeOverride] = useState<OwnerCardThemeOverride | null>(null);

  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewQrSvg = useMemo(
    () => renderStyledQrSvg('https://cascoqr.app/ficha/vista-previa', { style: qrStyle }),
    [qrStyle],
  );

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const tplRes = await apiClient.listTemplates();
        if (cancelled) return;
        setTemplates(tplRes.templates);

        if (tplRes.templates.length > 0) {
          const first = tplRes.templates[0];
          setSelectedTemplateId(first.id);
          setGeometry(defaultSquareLabelGeometry(first.width, first.height));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Error al cargar plantillas.');
        }
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const doc of draftDocs) {
        URL.revokeObjectURL(doc.previewUrl);
      }
    };
  }, [draftDocs]);

  const activeTemplate = templates.find((t) => t.id === selectedTemplateId) || null;

  const handleTemplateSelect = (nextId: string) => {
    setSelectedTemplateId(nextId);
    const tpl = templates.find((t) => t.id === nextId);
    if (tpl) {
      setGeometry((prev) =>
        clampSquareLabelGeometry(
          { x: prev.x, y: prev.y, width: prev.width },
          tpl.width,
          tpl.height,
        ),
      );
    }
  };

  const handleAddFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);

    const incoming = Array.from(fileList);
    if (draftDocs.length + incoming.length > MAX_DOCS) {
      setError(`Solo puedes adjuntar hasta ${MAX_DOCS} documentos por propietario.`);
      return;
    }

    const accepted: DraftDocument[] = [];
    for (const file of incoming) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!['jpg', 'jpeg', 'png'].includes(ext)) {
        setError(`"${file.name}" no tiene un formato permitido (solo JPG, JPEG o PNG).`);
        return;
      }
      if (file.size > MAX_SIZE) {
        setError(`"${file.name}" excede el tamaño máximo de 4 MB.`);
        return;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        isPublic: false,
      });
    }

    setDraftDocs((prev) => [...prev, ...accepted]);
  };

  const handleRemoveDraftDoc = (id: string) => {
    setDraftDocs((prev) => {
      const target = prev.find((d) => d.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((d) => d.id !== id);
    });
  };

  const handleToggleDraftVisibility = (id: string, isPublic: boolean) => {
    setDraftDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, isPublic } : d)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanFirst = normalizePersonName(firstName);
    const cleanLast = normalizePersonName(lastName);
    if (!cleanFirst || !cleanLast) {
      setError('El nombre y los apellidos son obligatorios.');
      return;
    }
    if (!isValidPersonName(cleanFirst)) {
      setError('El nombre solo debe contener letras.');
      return;
    }
    if (!isValidPersonName(cleanLast)) {
      setError('Los apellidos solo deben contener letras.');
      return;
    }
    if (email.trim() && !EMAIL_REGEX.test(email.trim())) {
      setError('Formato de correo electrónico inválido.');
      return;
    }
    if (phone.trim() && !PHONE_REGEX.test(phone.trim())) {
      setError('Formato de teléfono inválido.');
      return;
    }

    if (!selectedTemplateId || !activeTemplate) {
      setError('Debes seleccionar una plantilla para generar la etiqueta QR.');
      return;
    }

    setSaving(true);
    try {
      const clamped = clampSquareLabelGeometry(
        { x: geometry.x, y: geometry.y, width: geometry.width },
        activeTemplate.width,
        activeTemplate.height,
      );

      const initialBatch: DraftDocument[] = [];
      const overflowDocs: DraftDocument[] = [];
      let batchBytes = 0;

      for (const doc of draftDocs) {
        if (batchBytes + doc.file.size <= MAX_BATCH_BYTES) {
          initialBatch.push(doc);
          batchBytes += doc.file.size;
        } else {
          overflowDocs.push(doc);
        }
      }

      const fd = new FormData();
      fd.append('firstName', cleanFirst);
      fd.append('lastName', cleanLast);
      fd.append('email', email.trim());
      fd.append('phone', phone.trim());
      fd.append(
        'label',
        JSON.stringify({
          templateId: selectedTemplateId,
          ...clamped,
          qrStyle,
        }),
      );
      if (cardThemeOverride && cardThemeOverride.useGlobalTheme === false) {
        fd.append('cardThemeOverride', JSON.stringify(cardThemeOverride));
      }
      fd.append(
        'documentVisibilities',
        JSON.stringify(initialBatch.map((d) => d.isPublic)),
      );
      for (const d of initialBatch) {
        fd.append('documents', d.file);
      }

      const created = await apiClient.createOwnerWithLabel(fd);

      for (const extraDoc of overflowDocs) {
        const docFd = new FormData();
        docFd.append('isPublic', String(extraDoc.isPublic));
        docFd.append('documents', extraDoc.file);
        await apiClient.uploadDocuments(created.owner.id, docFd);
      }

      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo completar el registro.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" onClick={onCancel} aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Registrar propietario y etiqueta QR
            </h2>
            <p className="text-sm text-slate-500">
              Completa los datos personales, documentos y el diseño inicial de la etiqueta en una sola operación.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !activeTemplate}>
            <Save className="h-4 w-4" />
            <span>{saving ? 'Guardando...' : 'Guardar propietario y etiqueta'}</span>
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Owner Info & Documents */}
        <div className="xl:col-span-5 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">
              Datos del propietario
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="owner-first-name">Nombre(s) *</Label>
                <Input
                  id="owner-first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={100}
                  placeholder="Ej. Carlos Alberto"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="owner-last-name">Apellidos *</Label>
                <Input
                  id="owner-last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={100}
                  placeholder="Ej. Mendoza Ruiz"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="owner-email">Correo electrónico</Label>
              <Input
                id="owner-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={150}
                placeholder="carlos@ejemplo.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="owner-phone">Teléfono</Label>
              <Input
                id="owner-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={30}
                placeholder="+52 55 1234 5678"
                className="font-mono tabular-nums"
              />
            </div>

            <OwnerCardThemeControl
              value={cardThemeOverride}
              onChange={setCardThemeOverride}
              disabled={saving}
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Documentos ({draftDocs.length} / {MAX_DOCS})
                </h3>
                <p className="text-xs text-slate-500">
                  Opcional. Formatos JPG, JPEG o PNG de hasta 4 MB cada uno.
                </p>
              </div>

              <label
                className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer ${
                  draftDocs.length >= MAX_DOCS ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Agregar</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  multiple
                  className="sr-only"
                  disabled={draftDocs.length >= MAX_DOCS}
                  onChange={(e) => {
                    handleAddFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {draftDocs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
                Sin documentos adjuntos. Los documentos marcados como privados nunca aparecerán en la ficha pública.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {draftDocs.map((doc) => (
                  <div key={doc.id} className="p-3.5 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <img
                        src={doc.previewUrl}
                        alt={doc.file.name}
                        className="h-12 w-12 rounded object-cover border border-slate-200 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {doc.file.name}
                        </p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums">
                          {formatFileSize(doc.file.size)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveDraftDoc(doc.id)}
                        aria-label={`Quitar ${doc.file.name}`}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <PublicDocVisibilityControl
                      documentName={doc.file.name}
                      isPublic={doc.isPublic}
                      onConfirmChange={(checked) =>
                        handleToggleDraftVisibility(doc.id, checked)
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Initial QR Label Designer */}
        <div className="xl:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900">
                Diseño inicial de etiqueta QR
              </h3>
              <p className="text-xs text-slate-500">
                Selecciona una plantilla, arrastra el QR y ajusta su tamaño manteniendo proporción cuadrada 1:1.
              </p>
            </div>

            <div className="w-full sm:w-72 space-y-1.5">
              <Label>Plantilla *</Label>
              <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una plantilla" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.width}×{tpl.height})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <QrStyleSelector value={qrStyle} onChange={setQrStyle} disabled={saving} />

          {loadingTemplates ? (
            <div className="h-80 rounded-xl bg-slate-100 animate-pulse" />
          ) : !activeTemplate ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
              No hay plantillas disponibles. Carga al menos una plantilla en el módulo Plantillas para registrar propietarios.
            </div>
          ) : (
            <>
              {previewQrSvg && (
                <QRLabelCanvas
                  templateImageUrl={`/api/v1/templates/${activeTemplate.id}/image`}
                  templateName={activeTemplate.name}
                  templateWidth={activeTemplate.width}
                  templateHeight={activeTemplate.height}
                  qrSvg={previewQrSvg}
                  geometry={geometry}
                  onChange={setGeometry}
                />
              )}

              <QrCoordinateInputs
                idPrefix="init"
                geometry={geometry}
                templateWidth={activeTemplate.width}
                templateHeight={activeTemplate.height}
                onChange={setGeometry}
                disabled={saving}
                columns={4}
                compactLabels
              />
            </>
          )}
        </div>
      </div>
    </form>
  );
}
