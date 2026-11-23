import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Save, Trash2, Upload } from 'lucide-react';
import { OwnerCardThemeControl } from '@/src/components/owner-card-theme-control';
import { OwnerEmergencyFields } from '@/src/components/owner-emergency-fields';
import { ProtectedImage } from '@/src/components/protected-image';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { PublicDocVisibilityControl } from '@/src/components/public-doc-visibility-control';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import {
  apiClient,
  ApiError,
  type OwnerDocumentItem,
} from '@/src/lib/api-client';
import {
  createEmptyEmergencyProfile,
  hasEmergencyProfileData,
  normalizeEmergencyProfile,
  type OwnerEmergencyProfile,
} from '@/src/lib/emergency-profile';
import type { OwnerCardThemeOverride } from '@/src/lib/public-card-theme';
import {
  formatDateShort,
  formatFileSize,
  isValidPersonName,
  normalizePersonName,
  PHONE_REGEX,
} from '@/src/lib/utils';

interface OwnerEditDialogProps {
  ownerId: string | null;
  onClose: () => void;
  onSaved: () => void;
  onOpenFullCardTheme?: (ownerId: string) => void;
}

const MAX_DOCS = 5;
const MAX_SIZE = 4 * 1024 * 1024;
const MAX_BATCH_BYTES = Math.floor(3.8 * 1024 * 1024);

export function OwnerEditDialog({
  ownerId,
  onClose,
  onSaved,
  onOpenFullCardTheme,
}: OwnerEditDialogProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [documents, setDocuments] = useState<OwnerDocumentItem[]>([]);
  const [cardThemeOverride, setCardThemeOverride] = useState<OwnerCardThemeOverride | null>(null);
  const [emergencyProfile, setEmergencyProfile] = useState<OwnerEmergencyProfile>(
    createEmptyEmergencyProfile,
  );
  const [activeTab, setActiveTab] = useState<'general' | 'emergency' | 'documents'>('general');
  const [previewDoc, setPreviewDoc] = useState<OwnerDocumentItem | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadOwnerDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setFeedback(null);
    setActiveTab('general');
    try {
      const res = await apiClient.getOwner(id);
      setFirstName(res.owner.firstName);
      setLastName(res.owner.lastName);
      setCardThemeOverride(res.owner.cardThemeOverride ?? null);
      setEmergencyProfile(res.owner.emergencyProfile ?? createEmptyEmergencyProfile());
      setDocuments(res.documents);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar el propietario.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ownerId) {
      void loadOwnerDetail(ownerId);
    }
  }, [ownerId, loadOwnerDetail]);

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerId) return;

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
    if (
      (emergencyProfile.contact1.phone.trim() &&
        !PHONE_REGEX.test(emergencyProfile.contact1.phone.trim())) ||
      (emergencyProfile.contact2.phone.trim() &&
        !PHONE_REGEX.test(emergencyProfile.contact2.phone.trim()))
    ) {
      setActiveTab('emergency');
      setError('El teléfono de alguno de los contactos de emergencia tiene formato inválido.');
      return;
    }

    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      await apiClient.updateOwner(ownerId, {
        firstName: cleanFirst,
        lastName: cleanLast,
        cardThemeOverride,
        emergencyProfile: normalizeEmergencyProfile(emergencyProfile),
      });
      setFeedback('Datos personales y ficha médica actualizados. El token QR vigente se mantiene sin cambios.');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron actualizar los datos.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadMore = async (fileList: FileList | null) => {
    if (!ownerId || !fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    if (documents.length + files.length > MAX_DOCS) {
      setError(`Solo se permiten máximo ${MAX_DOCS} documentos por propietario.`);
      return;
    }

    for (const f of files) {
      if (f.size > MAX_SIZE) {
        setError(`"${f.name}" excede el tamaño máximo permitido de 4 MB.`);
        return;
      }
    }

    setUploading(true);
    setError(null);
    setFeedback(null);
    try {
      const batches: File[][] = [];
      let currentBatch: File[] = [];
      let currentBytes = 0;

      for (const f of files) {
        if (currentBatch.length > 0 && currentBytes + f.size > MAX_BATCH_BYTES) {
          batches.push(currentBatch);
          currentBatch = [f];
          currentBytes = f.size;
        } else {
          currentBatch.push(f);
          currentBytes += f.size;
        }
      }
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }

      const uploadedDocs: OwnerDocumentItem[] = [];
      for (const batch of batches) {
        const fd = new FormData();
        for (const f of batch) {
          fd.append('documents', f);
        }
        const res = await apiClient.uploadDocuments(ownerId, fd);
        uploadedDocs.push(...res.documents);
      }

      setDocuments((prev) => [...prev, ...uploadedDocs]);
      setFeedback('Documentos cargados correctamente.');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al subir documentos.');
    } finally {
      setUploading(false);
    }
  };

  const handleToggleVisibility = async (doc: OwnerDocumentItem, isPublic: boolean) => {
    setError(null);
    try {
      await apiClient.setDocumentVisibility(doc.id, isPublic);
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, isPublic } : d)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la visibilidad.');
    }
  };

  const handleDeleteDoc = async (doc: OwnerDocumentItem) => {
    setError(null);
    try {
      await apiClient.deleteDocument(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar el documento.');
    }
  };

  return (
    <>
      <Dialog open={Boolean(ownerId)} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Editar propietario, datos médicos y documentos</DialogTitle>
            <DialogDescription>
              Actualizar datos personales y de emergencia conserva intacto el token QR vigente.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="h-56 rounded-lg bg-slate-100 animate-pulse" />
          ) : (
            <div className="space-y-5">
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              {feedback && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
                  {feedback}
                </div>
              )}

              <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-slate-100 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('general')}
                  className={`rounded-lg py-2 px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'general'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Datos generales
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('emergency')}
                  className={`rounded-lg py-2 px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'emergency'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Emergencia y médico{hasEmergencyProfileData(emergencyProfile) ? ' · ✓' : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('documents')}
                  className={`rounded-lg py-2 px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'documents'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Documentos ({documents.length}/{MAX_DOCS})
                </button>
              </div>

              {activeTab !== 'documents' ? (
                <form onSubmit={handleSaveInfo} className="space-y-4">
                  {activeTab === 'general' ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="edit-first-name">Nombre(s) *</Label>
                          <Input
                            id="edit-first-name"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            maxLength={100}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="edit-last-name">Apellidos *</Label>
                          <Input
                            id="edit-last-name"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            maxLength={100}
                            required
                          />
                        </div>
                      </div>

                      <OwnerCardThemeControl
                        value={cardThemeOverride}
                        onChange={setCardThemeOverride}
                        onOpenFullEditor={
                          ownerId && onOpenFullCardTheme
                            ? () => {
                                onClose();
                                onOpenFullCardTheme(ownerId);
                              }
                            : undefined
                        }
                        disabled={saving}
                      />
                    </>
                  ) : (
                    <OwnerEmergencyFields
                      value={emergencyProfile}
                      onChange={setEmergencyProfile}
                      disabled={saving}
                      idPrefix="edit-emg"
                    />
                  )}

                  <div className="flex justify-end pt-2 border-t border-slate-100">
                    <Button type="submit" disabled={saving}>
                      <Save className="h-4 w-4" />
                      <span>{saving ? 'Guardando...' : 'Guardar cambios'}</span>
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        Documentos ({documents.length} / {MAX_DOCS})
                      </h4>
                      <p className="text-xs text-slate-500">
                        Controla qué documentos se muestran en la ficha pública.
                      </p>
                    </div>

                    <label
                      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer ${
                        documents.length >= MAX_DOCS || uploading
                          ? 'opacity-50 pointer-events-none'
                          : ''
                      }`}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>{uploading ? 'Subiendo...' : 'Cargar documento'}</span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                        multiple
                        className="sr-only"
                        disabled={documents.length >= MAX_DOCS || uploading}
                        onChange={(e) => {
                          void handleUploadMore(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  {documents.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
                      Este propietario aún no tiene documentos cargados.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {documents.map((doc) => (
                        <div key={doc.id} className="p-3.5 space-y-2.5">
                          <div className="flex items-center gap-3">
                            <ProtectedImage
                              src={`/api/v1/documents/${doc.id}/preview`}
                              alt={doc.originalName}
                              className="h-12 w-12 rounded object-cover border border-slate-200 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {doc.originalName}
                              </p>
                              <p className="text-xs text-slate-500 font-mono tabular-nums">
                                {formatFileSize(doc.fileSize)} · {formatDateShort(doc.createdAt)}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setPreviewDoc(doc)}
                                aria-label={`Visualizar ${doc.originalName}`}
                                className="h-9 w-9 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteDoc(doc)}
                                aria-label={`Eliminar ${doc.originalName}`}
                                className="h-9 w-9 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <PublicDocVisibilityControl
                            documentName={doc.originalName}
                            isPublic={doc.isPublic}
                            onConfirmChange={(checked) =>
                              handleToggleVisibility(doc, checked)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewDoc)} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-3xl">
          {previewDoc && (
            <>
              <DialogHeader>
                <DialogTitle>{previewDoc.originalName}</DialogTitle>
                <DialogDescription>
                  Visibilidad: {previewDoc.isPublic ? 'Público' : 'Privado'}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-slate-200 bg-slate-100 p-3 flex items-center justify-center max-h-[70vh] overflow-auto">
                <ProtectedImage
                  src={`/api/v1/documents/${previewDoc.id}/preview`}
                  alt={previewDoc.originalName}
                  className="max-w-full max-h-[64vh] object-contain"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
