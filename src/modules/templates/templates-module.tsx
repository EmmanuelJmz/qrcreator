import React, { useCallback, useEffect, useState } from 'react';
import { Eye, FileImage, Plus, Trash2, Upload } from 'lucide-react';
import { ProtectedImage } from '@/src/components/protected-image';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { apiClient, ApiError, type TemplateItem } from '@/src/lib/api-client';
import { formatDateShort } from '@/src/lib/utils';

export function TemplatesModule() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplFile, setTplFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [previewTpl, setPreviewTpl] = useState<TemplateItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listTemplates();
      setTemplates(res.templates);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar las plantillas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplFile) {
      setError('Selecciona una imagen JPG, JPEG o PNG.');
      return;
    }
    if (tplFile.size > 4 * 1024 * 1024) {
      setError('El archivo excede el tamaño máximo de 4 MB.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('name', tplName.trim());
      fd.append('image', tplFile);
      await apiClient.uploadTemplate(fd);
      setTplName('');
      setTplFile(null);
      setUploadOpen(false);
      setFeedback('Plantilla cargada correctamente.');
      await loadTemplates();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar la plantilla.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (tpl: TemplateItem) => {
    if (tpl.inUse) return;
    setDeletingId(tpl.id);
    setError(null);
    setFeedback(null);
    try {
      await apiClient.deleteTemplate(tpl.id);
      setFeedback(`Plantilla "${tpl.name}" eliminada.`);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar la plantilla.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Catálogo de plantillas</h2>
          <p className="text-sm text-slate-500">
            Administra los diseños base para las etiquetas físicas de los cascos.
          </p>
        </div>

        <Button onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4" />
          <span>Cargar plantilla</span>
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {feedback}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-72 rounded-xl border border-slate-200 bg-white animate-pulse"
            />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center space-y-3">
          <FileImage className="h-10 w-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-semibold text-slate-900">
            No hay plantillas registradas
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Carga una imagen en formato JPG o PNG para utilizarla como diseño base en las etiquetas QR.
          </p>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" />
            <span>Cargar primera plantilla</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((tpl) => (
            <article
              key={tpl.id}
              className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col"
            >
              <div className="h-52 bg-slate-100 border-b border-slate-200 p-4 flex items-center justify-center overflow-hidden">
                <ProtectedImage
                  src={`/api/v1/templates/${tpl.id}/image`}
                  alt={tpl.name}
                  className="max-h-full max-w-full object-contain rounded shadow-xs"
                />
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-slate-900 truncate">
                    {tpl.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums">
                    <span>
                      {tpl.width} × {tpl.height} px
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{tpl.mimeType === 'image/png' ? 'PNG' : 'JPG'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateShort(tpl.createdAt)}</span>
                  </div>
                  <p className="text-xs font-medium text-slate-600 pt-1">
                    {tpl.inUse
                      ? `En uso por ${tpl.usageCount} etiqueta${tpl.usageCount === 1 ? '' : 's'}`
                      : 'Sin etiquetas asociadas'}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewTpl(tpl)}
                    className="flex-1"
                  >
                    <Eye className="h-4 w-4" />
                    <span>Visualizar</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={tpl.inUse || deletingId === tpl.id}
                    title={
                      tpl.inUse
                        ? 'No se puede eliminar una plantilla asignada a etiquetas'
                        : 'Eliminar plantilla'
                    }
                    onClick={() => void handleDelete(tpl)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:text-slate-400"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>{deletingId === tpl.id ? 'Eliminando...' : 'Eliminar'}</span>
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cargar nueva plantilla</DialogTitle>
            <DialogDescription>
              Formatos permitidos: JPG, JPEG y PNG (máximo 4 MB). Se conservarán sus proporciones originales.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="template-name">Nombre de la plantilla</Label>
              <Input
                id="template-name"
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                placeholder="Ej. Etiqueta Lateral Casco Deportivo"
                maxLength={255}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-file">Archivo de imagen</Label>
              <Input
                id="template-file"
                type="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                onChange={(e) => setTplFile(e.target.files?.[0] || null)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setUploadOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                <Upload className="h-4 w-4" />
                <span>{submitting ? 'Guardando...' : 'Guardar plantilla'}</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={Boolean(previewTpl)} onOpenChange={(open) => !open && setPreviewTpl(null)}>
        <DialogContent className="max-w-4xl">
          {previewTpl && (
            <>
              <DialogHeader>
                <DialogTitle>{previewTpl.name}</DialogTitle>
                <DialogDescription>
                  Dimensiones originales: {previewTpl.width} × {previewTpl.height} px ·{' '}
                  {previewTpl.originalName}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-slate-200 bg-slate-100 p-4 flex items-center justify-center max-h-[70vh] overflow-auto">
                <ProtectedImage
                  src={`/api/v1/templates/${previewTpl.id}/image`}
                  alt={previewTpl.name}
                  className="max-w-full max-h-[62vh] object-contain"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
