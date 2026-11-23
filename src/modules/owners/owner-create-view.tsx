import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Save, Trash2, Upload } from 'lucide-react';
import { CircularLogoCropperDialog } from '@/src/components/circular-logo-cropper-dialog';
import { OwnerCardThemeControl } from '@/src/components/owner-card-theme-control';
import { OwnerEmergencyFields } from '@/src/components/owner-emergency-fields';
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
import {
  createEmptyEmergencyProfile,
  hasEmergencyProfileData,
  normalizeEmergencyProfile,
  type OwnerEmergencyProfile,
} from '@/src/lib/emergency-profile';
import type { OwnerCardThemeOverride } from '@/src/lib/public-card-theme';
import {
  clampSquareLabelGeometry,
  defaultSquareLabelGeometry,
  type LabelGeometry,
} from '@/src/lib/qr-geometry';
import { renderStyledQrSvg, type QrStyle } from '@/src/lib/qr-styled';
import { validateEmergencyPhone } from '@/src/lib/phone-countries';
import {
  formatFileSize,
  isValidPersonName,
  normalizePersonName,
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

  const [draftDocs, setDraftDocs] = useState<DraftDocument[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [qrStyle, setQrStyle] = useState<QrStyle>('classic');
  const [geometry, setGeometry] = useState<LabelGeometry>({ x: 65, y: 20, width: 20, height: 20 });
  const [cardThemeOverride, setCardThemeOverride] = useState<OwnerCardThemeOverride | null>(null);
  const [cropSource, setCropSource] = useState<{ url: string; fileName: string } | null>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingLogoPreviewUrl, setPendingLogoPreviewUrl] = useState<string | null>(null);
  const pendingLogoUrlRef = useRef<string | null>(null);
  const cropUrlRef = useRef<string | null>(null);
  const [emergencyProfile, setEmergencyProfile] = useState<OwnerEmergencyProfile>(
    createEmptyEmergencyProfile,
  );
  const [leftTab, setLeftTab] = useState<'general' | 'emergency'>('general');

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

  useEffect(() => {
    return () => {
      if (pendingLogoUrlRef.current) {
        URL.revokeObjectURL(pendingLogoUrlRef.current);
      }
      if (cropUrlRef.current) {
        URL.revokeObjectURL(cropUrlRef.current);
      }
    };
  }, []);

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

  const handleSelectOwnerLogoFile = (file: File | null) => {
    if (!file) return;
    setError(null);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['jpg', 'jpeg', 'png'].includes(ext)) {
      setError('La foto o logo debe estar en formato JPG, JPEG o PNG.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setError('La imagen seleccionada excede el tamaño máximo de 4 MB.');
      return;
    }

    if (cropUrlRef.current) {
      URL.revokeObjectURL(cropUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    cropUrlRef.current = url;
    setCropSource({ url, fileName: file.name });
  };

  const handleCancelCrop = () => {
    if (cropUrlRef.current) {
      URL.revokeObjectURL(cropUrlRef.current);
      cropUrlRef.current = null;
    }
    setCropSource(null);
  };

  const handleConfirmOwnerLogoCrop = (croppedFile: File) => {
    if (pendingLogoUrlRef.current) {
      URL.revokeObjectURL(pendingLogoUrlRef.current);
    }
    const nextPreview = URL.createObjectURL(croppedFile);
    pendingLogoUrlRef.current = nextPreview;
    setPendingLogoFile(croppedFile);
    setPendingLogoPreviewUrl(nextPreview);
    handleCancelCrop();
  };

  const handleRemovePendingOwnerLogo = () => {
    if (pendingLogoUrlRef.current) {
      URL.revokeObjectURL(pendingLogoUrlRef.current);
      pendingLogoUrlRef.current = null;
    }
    setPendingLogoFile(null);
    setPendingLogoPreviewUrl(null);
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
    const c1PhoneErr = validateEmergencyPhone(emergencyProfile.contact1.phone);
    const c2PhoneErr = validateEmergencyPhone(emergencyProfile.contact2.phone);
    if (c1PhoneErr || c2PhoneErr) {
      setLeftTab('emergency');
      setError(`Contacto de emergencia ${c1PhoneErr ? '1' : '2'}: ${c1PhoneErr || c2PhoneErr}`);
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
      const normalizedEmergency = normalizeEmergencyProfile(emergencyProfile);
      if (normalizedEmergency) {
        fd.append('emergencyProfile', JSON.stringify(normalizedEmergency));
      }
      fd.append(
        'documentVisibilities',
        JSON.stringify(initialBatch.map((d) => d.isPublic)),
      );
      for (const d of initialBatch) {
        fd.append('documents', d.file);
      }

      const created = await apiClient.createOwnerWithLabel(fd);

      if (pendingLogoFile) {
        const logoFd = new FormData();
        logoFd.append('logo', pendingLogoFile);
        await apiClient.uploadOwnerCardLogo(created.owner.id, logoFd);
      }

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
        {/* Left: Owner Info, Emergency Profile & Documents */}
        <div className="xl:col-span-5 space-y-4">
          <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1 gap-1">
            <button
              type="button"
              onClick={() => setLeftTab('general')}
              className={`rounded-lg py-2 px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                leftTab === 'general'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Datos y documentos
            </button>
            <button
              type="button"
              onClick={() => setLeftTab('emergency')}
              className={`rounded-lg py-2 px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                leftTab === 'emergency'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Emergencia y médico{hasEmergencyProfileData(emergencyProfile) ? ' · ✓' : ''}
            </button>
          </div>

          {leftTab === 'general' ? (
            <>
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

                <OwnerCardThemeControl
                  value={cardThemeOverride}
                  onChange={setCardThemeOverride}
                  logoControl={{
                    hasCustomLogo: Boolean(pendingLogoFile),
                    previewUrl: pendingLogoPreviewUrl,
                    onSelectFile: handleSelectOwnerLogoFile,
                    onRemoveCustomLogo: handleRemovePendingOwnerLogo,
                  }}
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
            </>
          ) : (
            <OwnerEmergencyFields
              value={emergencyProfile}
              onChange={setEmergencyProfile}
              disabled={saving}
              idPrefix="create-emg"
            />
          )}
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

      <CircularLogoCropperDialog
        open={Boolean(cropSource)}
        imageSrc={cropSource?.url ?? null}
        fileName={cropSource?.fileName}
        onCancel={handleCancelCrop}
        onConfirm={handleConfirmOwnerLogoCrop}
      />
    </form>
  );
}
