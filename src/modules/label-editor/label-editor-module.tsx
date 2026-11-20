import React, { useCallback, useEffect, useState } from 'react';
import { Download, RotateCcw, Save } from 'lucide-react';
import { QRLabelCanvas } from '@/src/components/qr-label-canvas';
import { QrCoordinateInputs } from '@/src/components/qr-coordinate-inputs';
import { QrStyleSelector } from '@/src/components/qr-style-selector';
import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select';
import {
  apiClient,
  ApiError,
  type OwnerSummary,
  type TemplateItem,
} from '@/src/lib/api-client';
import {
  clampSquareLabelGeometry,
  defaultSquareLabelGeometry,
  type LabelGeometry,
} from '@/src/lib/qr-geometry';
import {
  normalizeQrStyle,
  renderStyledQrSvg,
  type QrStyle,
} from '@/src/lib/qr-styled';

interface LabelEditorModuleProps {
  initialOwnerId?: string | null;
}

export function LabelEditorModule({ initialOwnerId }: LabelEditorModuleProps) {
  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(initialOwnerId || '');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [qrStyle, setQrStyle] = useState<QrStyle>('fluid');
  const [geometry, setGeometry] = useState<LabelGeometry>({ x: 65, y: 20, width: 20, height: 20 });
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');

  const [qrSvg, setQrSvg] = useState<string>('');
  const [ownerPublicUrl, setOwnerPublicUrl] = useState<string | null>(null);
  const [ownerActive, setOwnerActive] = useState<boolean>(true);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingLabel, setLoadingLabel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (initialOwnerId) {
      setSelectedOwnerId(initialOwnerId);
    }
  }, [initialOwnerId]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setLoadingInit(true);
      setError(null);
      try {
        const [ownersRes, templatesRes] = await Promise.all([
          apiClient.listOwners(),
          apiClient.listTemplates(),
        ]);
        if (cancelled) return;
        setOwners(ownersRes.owners);
        setTemplates(templatesRes.templates);

        if (!selectedOwnerId && ownersRes.owners.length > 0) {
          setSelectedOwnerId(ownersRes.owners[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Error al inicializar el editor.');
        }
      } finally {
        if (!cancelled) setLoadingInit(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadOwnerLabelAndQr = useCallback(
    async (ownerId: string, availTemplates: TemplateItem[]) => {
      if (!ownerId) return;
      setLoadingLabel(true);
      setError(null);
      setFeedback(null);

      try {
        const labelRes = await apiClient.getOwnerLabel(ownerId);
        setOwnerActive(labelRes.owner.status);
        setOwnerPublicUrl(labelRes.owner.publicUrl);

        let loadedStyle: QrStyle = 'fluid';
        if (labelRes.label) {
          loadedStyle = normalizeQrStyle(labelRes.label.qrStyle);
          const geom: LabelGeometry = {
            x: labelRes.label.x,
            y: labelRes.label.y,
            width: labelRes.label.width,
            height: labelRes.label.height,
          };
          setSelectedTemplateId(labelRes.label.templateId);
          setQrStyle(loadedStyle);
          setGeometry(geom);
          setSavedSnapshot(
            JSON.stringify({
              templateId: labelRes.label.templateId,
              ...geom,
              qrStyle: loadedStyle,
            }),
          );
        } else if (availTemplates.length > 0) {
          const fallbackTpl = availTemplates[0];
          const geom = defaultSquareLabelGeometry(fallbackTpl.width, fallbackTpl.height);
          setSelectedTemplateId(fallbackTpl.id);
          setQrStyle('fluid');
          setGeometry(geom);
          setSavedSnapshot('');
        }

        if (labelRes.owner.status) {
          const svg = await apiClient.fetchQrSvg(ownerId, loadedStyle);
          setQrSvg(svg);
        } else {
          setQrSvg('');
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error al cargar la etiqueta.');
      } finally {
        setLoadingLabel(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedOwnerId && templates.length > 0) {
      void loadOwnerLabelAndQr(selectedOwnerId, templates);
    }
  }, [selectedOwnerId, templates, loadOwnerLabelAndQr]);

  const activeTemplate = templates.find((t) => t.id === selectedTemplateId) || null;

  const handleTemplateChange = (nextTemplateId: string) => {
    setSelectedTemplateId(nextTemplateId);
    setFeedback(null);
    const tpl = templates.find((t) => t.id === nextTemplateId);
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

  const handleQrStyleChange = (nextStyle: QrStyle) => {
    setQrStyle(nextStyle);
    setFeedback(null);
    if (!ownerActive) return;

    if (ownerPublicUrl) {
      setQrSvg(renderStyledQrSvg(ownerPublicUrl, { style: nextStyle }));
    } else if (selectedOwnerId) {
      void apiClient
        .fetchQrSvg(selectedOwnerId, nextStyle)
        .then(setQrSvg)
        .catch(() => {});
    }
  };

  const handleReset = () => {
    if (!activeTemplate) return;
    setGeometry(defaultSquareLabelGeometry(activeTemplate.width, activeTemplate.height));
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!selectedOwnerId || !selectedTemplateId || !activeTemplate) return;
    setSaving(true);
    setError(null);
    setFeedback(null);

    const clamped = clampSquareLabelGeometry(
      { x: geometry.x, y: geometry.y, width: geometry.width },
      activeTemplate.width,
      activeTemplate.height,
    );

    try {
      const res = await apiClient.saveOwnerLabel(selectedOwnerId, {
        templateId: selectedTemplateId,
        ...clamped,
        qrStyle,
      });
      const updatedGeom = {
        x: res.label.x,
        y: res.label.y,
        width: res.label.width,
        height: res.label.height,
      };
      const updatedStyle = normalizeQrStyle(res.label.qrStyle);
      setGeometry(updatedGeom);
      setQrStyle(updatedStyle);
      setSavedSnapshot(
        JSON.stringify({
          templateId: res.label.templateId,
          ...updatedGeom,
          qrStyle: updatedStyle,
        }),
      );
      setFeedback('Configuración de etiqueta guardada correctamente.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la etiqueta.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPng = async () => {
    if (!selectedOwnerId || !selectedTemplateId || !activeTemplate || !ownerActive) return;
    setExporting(true);
    setError(null);

    try {
      const currentSnap = JSON.stringify({
        templateId: selectedTemplateId,
        ...geometry,
        qrStyle,
      });
      if (currentSnap !== savedSnapshot) {
        const clamped = clampSquareLabelGeometry(
          { x: geometry.x, y: geometry.y, width: geometry.width },
          activeTemplate.width,
          activeTemplate.height,
        );
        await apiClient.saveOwnerLabel(selectedOwnerId, {
          templateId: selectedTemplateId,
          ...clamped,
          qrStyle,
        });
        setSavedSnapshot(
          JSON.stringify({ templateId: selectedTemplateId, ...clamped, qrStyle }),
        );
      }

      const blob = await apiClient.renderLabelPng(selectedOwnerId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const ownerObj = owners.find((o) => o.id === selectedOwnerId);
      const safeName = ownerObj
        ? ownerObj.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        : 'etiqueta';
      link.href = url;
      link.download = `etiqueta-${safeName}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setFeedback('Imagen final PNG generada y descargada.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al generar la imagen final.');
    } finally {
      setExporting(false);
    }
  };

  if (loadingInit) {
    return (
      <div className="h-96 rounded-xl border border-slate-200 bg-white animate-pulse" />
    );
  }

  if (owners.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          No hay propietarios registrados
        </h2>
        <p className="text-sm text-slate-500">
          Registra al menos un propietario en el módulo Propietarios para editar su etiqueta QR.
        </p>
      </div>
    );
  }

  const hasUnsavedChanges =
    savedSnapshot !==
    JSON.stringify({ templateId: selectedTemplateId, ...geometry, qrStyle });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Editor de etiquetas QR</h2>
          <p className="text-sm text-slate-500">
            Ajusta la posición y el tamaño cuadrado (1:1) del código QR sobre la plantilla.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={!activeTemplate || !ownerActive}
          >
            <RotateCcw className="h-4 w-4" />
            <span>Restablecer</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleDownloadPng()}
            disabled={exporting || !activeTemplate || !ownerActive}
          >
            <Download className="h-4 w-4" />
            <span>{exporting ? 'Generando PNG...' : 'Descargar imagen PNG'}</span>
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !activeTemplate}
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Guardando...' : 'Guardar configuración'}</span>
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

      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {feedback}
        </div>
      )}

      {!ownerActive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este propietario está inactivo y su token QR fue revocado. Reactívalo en el módulo Propietarios para emitir un nuevo código QR y exportar la etiqueta.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Propietario</Label>
                <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un propietario" />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((owner) => (
                      <SelectItem key={owner.id} value={owner.id}>
                        {owner.fullName} {owner.status ? '' : '(Inactivo)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Plantilla de etiqueta</Label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
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

            <div className="pt-2 border-t border-slate-100">
              <QrStyleSelector
                value={qrStyle}
                onChange={handleQrStyleChange}
                disabled={!ownerActive || saving}
              />
            </div>
          </div>

          {loadingLabel ? (
            <div className="h-96 rounded-xl border border-slate-200 bg-white animate-pulse" />
          ) : activeTemplate && qrSvg ? (
            <QRLabelCanvas
              templateImageUrl={`/api/v1/templates/${activeTemplate.id}/image`}
              templateName={activeTemplate.name}
              templateWidth={activeTemplate.width}
              templateHeight={activeTemplate.height}
              qrSvg={qrSvg}
              geometry={geometry}
              onChange={setGeometry}
              disabled={!ownerActive}
            />
          ) : activeTemplate ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              No hay código QR activo para previsualizar en este propietario.
            </div>
          ) : null}
        </div>

        <aside className="xl:col-span-4 rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-900">
              Coordenadas relativas (%)
            </h3>
            <p className="text-xs text-slate-500">
              Proporción cuadrada 1:1 bloqueada automáticamente para asegurar la lectura del QR.
            </p>
          </div>

          {activeTemplate && (
            <QrCoordinateInputs
              idPrefix="coord"
              geometry={geometry}
              templateWidth={activeTemplate.width}
              templateHeight={activeTemplate.height}
              onChange={setGeometry}
              disabled={!ownerActive}
              columns={2}
            />
          )}

          {activeTemplate && (
            <div className="pt-4 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Plantilla original</span>
                <span className="font-mono tabular-nums">
                  {activeTemplate.width} × {activeTemplate.height} px
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tamaño QR en salida</span>
                <span className="font-mono tabular-nums">
                  {Math.round((geometry.width / 100) * activeTemplate.width)} ×{' '}
                  {Math.round((geometry.width / 100) * activeTemplate.width)} px
                </span>
              </div>
              {hasUnsavedChanges && (
                <p className="text-blue-700 font-medium pt-2">
                  Hay cambios pendientes por guardar.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
