import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Monitor,
  RotateCcw,
  Save,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import { PublicCardView } from '@/src/components/public-card-renderer';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { apiClient, ApiError, type PublicCardData } from '@/src/lib/api-client';
import {
  DEFAULT_PUBLIC_CARD_THEME,
  HEADER_COLOR_PRESETS,
  type LogoShape,
  type PageBackgroundMode,
  type PublicCardTheme,
} from '@/src/lib/public-card-theme';

const PREVIEW_SAMPLE_CARD: PublicCardData = {
  fullName: 'Carlos Mendoza Ruiz',
  email: 'carlos@ejemplo.com',
  phone: '+52 55 1234 5678',
  documents: [
    {
      id: 'preview-doc-1',
      originalName: 'Licencia vigente.png',
      mimeType: 'image/png',
    },
    {
      id: 'preview-doc-2',
      originalName: 'Póliza de seguro.jpg',
      mimeType: 'image/jpeg',
    },
  ],
};

type ControlTab = 'header' | 'logo' | 'texts';

export function CardThemeModule() {
  const [theme, setTheme] = useState<PublicCardTheme>(DEFAULT_PUBLIC_CARD_THEME);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);

  const [previewViewport, setPreviewViewport] = useState<'mobile' | 'desktop'>('mobile');
  const [activeTab, setActiveTab] = useState<ControlTab>('header');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.getCardTheme();
        if (cancelled) return;
        setTheme(res.theme);
        setLogoUrl(res.logoUrl);
        setMigrationPending(Boolean(res.migrationPending));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'No se pudo cargar el diseño de ficha pública.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const { hasCustomLogo: _ignored, ...payload } = theme;
      const res = await apiClient.updateCardTheme(payload);
      setTheme(res.theme);
      setLogoUrl(res.logoUrl);
      setMigrationPending(false);
      setFeedback('Diseño global guardado. Todas las fichas sin personalización propia ya muestran estos cambios.');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo guardar el diseño.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUploadLogo = async (file: File | null) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['jpg', 'jpeg', 'png'].includes(ext)) {
      setError('El logo debe ser una imagen JPG, JPEG o PNG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('El logo no puede exceder 2 MB.');
      return;
    }

    setUploadingLogo(true);
    setError(null);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await apiClient.uploadCardLogo(fd);
      setTheme(res.theme);
      setLogoUrl(res.logoUrl);
      setMigrationPending(false);
      setFeedback('Logo personalizado subido y aplicado.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo subir el logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveCustomLogo = async () => {
    setUploadingLogo(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiClient.deleteCardLogo();
      setTheme(res.theme);
      setLogoUrl(null);
      setFeedback('Se restauró el ícono de casco predeterminado.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo quitar el logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleResetDefaults = () => {
    setFeedback(null);
    setTheme((prev) => ({
      ...DEFAULT_PUBLIC_CARD_THEME,
      hasCustomLogo: prev.hasCustomLogo,
    }));
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-12 w-72 rounded-xl bg-slate-200 animate-pulse" />
        <div className="h-[540px] rounded-2xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Diseño de ficha pública
          </h2>
          <p className="text-sm text-slate-500">
            Personaliza la pantalla que ven al escanear el QR: arrastra el logo libremente y ajusta el tamaño del encabezado.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleResetDefaults}
            disabled={saving}
          >
            <RotateCcw className="h-4 w-4" />
            <span>Restablecer</span>
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Guardando...' : 'Guardar diseño global'}</span>
          </Button>
        </div>
      </div>

      {migrationPending && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Estás viendo la vista previa con valores predeterminados. Ejecuta la migración SQL en Neon antes de guardar cambios en la base de datos.
          </span>
        </div>
      )}

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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Live Interactive Preview */}
        <div className="xl:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-600 font-mono tabular-nums">
              Encabezado: <strong>{theme.headerHeight}px</strong>
              {theme.logoVisible ? (
                <>
                  {' '}· Logo: <strong>X {theme.logoX}%</strong> ·{' '}
                  <strong>Y {theme.logoY}%</strong> · <strong>{theme.logoSize}px</strong>
                </>
              ) : (
                ' · Logo oculto'
              )}
            </div>

            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70">
              <button
                type="button"
                onClick={() => setPreviewViewport('mobile')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  previewViewport === 'mobile'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>Móvil</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewViewport('desktop')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  previewViewport === 'desktop'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
                <span>Escritorio</span>
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-6 bg-slate-100 flex justify-center overflow-auto max-h-[760px]">
            <div
              className={`border border-slate-300 shadow-md overflow-hidden transition-all ${
                previewViewport === 'mobile'
                  ? 'w-full max-w-[390px] rounded-[28px]'
                  : 'w-full rounded-xl'
              }`}
            >
              <PublicCardView
                card={PREVIEW_SAMPLE_CARD}
                theme={theme}
                logoUrl={logoUrl}
                interactive
                onThemeChange={setTheme}
              />
            </div>
          </div>
        </div>

        {/* Right: Free Controls Panel */}
        <div className="xl:col-span-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div
            role="tablist"
            className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-xs font-semibold"
          >
            {(
              [
                { id: 'header', label: 'Encabezado' },
                { id: 'logo', label: 'Logo libre' },
                { id: 'texts', label: 'Textos y extras' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-2 text-center transition-colors cursor-pointer border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-600 bg-white text-blue-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-5">
            {activeTab === 'header' && (
              <>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label>Color principal del encabezado</Label>
                    <span className="text-xs font-mono text-slate-500">
                      {theme.headerColor}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {HEADER_COLOR_PRESETS.map((preset) => {
                      const active =
                        theme.headerColor.toUpperCase() === preset.hex.toUpperCase();
                      return (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() =>
                            setTheme((prev) => ({ ...prev, headerColor: preset.hex }))
                          }
                          title={preset.label}
                          className={`h-9 rounded-lg border flex items-center justify-center gap-1.5 px-2 text-[11px] font-medium cursor-pointer transition-all ${
                            active
                              ? 'border-slate-900 ring-2 ring-slate-900/20'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <span
                            className="h-4 w-4 rounded-full shrink-0 border border-black/10"
                            style={{ backgroundColor: preset.hex }}
                          />
                          <span className="truncate text-slate-700">
                            {preset.label.split(' ')[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="color"
                      value={theme.headerColor}
                      onChange={(e) =>
                        setTheme((prev) => ({
                          ...prev,
                          headerColor: e.target.value.toUpperCase(),
                        }))
                      }
                      aria-label="Selector de color libre"
                      className="h-10 w-14 rounded-lg border border-slate-200 bg-white p-1 cursor-pointer"
                    />
                    <span className="text-xs text-slate-500">
                      O elige cualquier color personalizado con el selector.
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="header-height-range">Alto de la franja superior</Label>
                    <span className="text-xs font-mono tabular-nums text-slate-700">
                      {theme.headerHeight} px
                    </span>
                  </div>
                  <input
                    id="header-height-range"
                    type="range"
                    min={80}
                    max={280}
                    step={2}
                    value={theme.headerHeight}
                    onChange={(e) =>
                      setTheme((prev) => ({
                        ...prev,
                        headerHeight: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <div className="flex gap-1.5">
                    {[
                      { label: 'Compacto (100px)', val: 100 },
                      { label: 'Estándar (160px)', val: 160 },
                      { label: 'Amplio (220px)', val: 220 },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() =>
                          setTheme((prev) => ({ ...prev, headerHeight: opt.val }))
                        }
                        className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <Label>Fondo de la página</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'slate', label: 'Gris claro' },
                        { id: 'white', label: 'Blanco puro' },
                        { id: 'warm', label: 'Arena cálido' },
                        { id: 'dark', label: 'Modo oscuro' },
                      ] as Array<{ id: PageBackgroundMode; label: string }>
                    ).map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => setTheme((prev) => ({ ...prev, pageBg: bg.id }))}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium text-left cursor-pointer transition-colors ${
                          theme.pageBg === bg.id
                            ? 'border-blue-600 bg-blue-50/70 text-blue-700 ring-1 ring-blue-600'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {bg.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'logo' && (
              <>
                <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 cursor-pointer">
                  <span className="text-sm font-medium text-slate-800">
                    Mostrar logo en la ficha
                  </span>
                  <input
                    type="checkbox"
                    checked={theme.logoVisible}
                    onChange={(e) =>
                      setTheme((prev) => ({ ...prev, logoVisible: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                </label>

                <div className="space-y-2 pt-1">
                  <Label>Imagen del logo</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer ${
                        uploadingLogo ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>
                        {uploadingLogo
                          ? 'Subiendo...'
                          : theme.hasCustomLogo
                            ? 'Cambiar logo (PNG/JPG)'
                            : 'Subir logo propio'}
                      </span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                        className="sr-only"
                        disabled={uploadingLogo}
                        onChange={(e) => {
                          void handleUploadLogo(e.target.files?.[0] ?? null);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    {theme.hasCustomLogo && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingLogo}
                        onClick={() => void handleRemoveCustomLogo()}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Usar casco original</span>
                      </Button>
                    )}
                  </div>
                </div>

                {theme.logoVisible && (
                  <>
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <Label>Marco del logo</Label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(
                          [
                            { id: 'circle', label: 'Círculo' },
                            { id: 'rounded', label: 'Suave' },
                            { id: 'square', label: 'Cuadro' },
                            { id: 'none', label: 'Sin fondo' },
                          ] as Array<{ id: LogoShape; label: string }>
                        ).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() =>
                              setTheme((prev) => ({ ...prev, logoShape: s.id }))
                            }
                            className={`rounded-lg border py-2 text-xs font-medium cursor-pointer transition-colors ${
                              theme.logoShape === s.id
                                ? 'border-blue-600 bg-blue-50/70 text-blue-700 ring-1 ring-blue-600'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="logo-size-range">Tamaño del logo</Label>
                        <span className="text-xs font-mono tabular-nums text-slate-700">
                          {theme.logoSize} px
                        </span>
                      </div>
                      <input
                        id="logo-size-range"
                        type="range"
                        min={56}
                        max={180}
                        step={2}
                        value={theme.logoSize}
                        onChange={(e) =>
                          setTheme((prev) => ({
                            ...prev,
                            logoSize: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <p className="text-xs text-slate-500">
                        Puedes arrastrar el logo directamente sobre la vista previa o ajustarlo aquí:
                      </p>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="logo-x-range">Posición horizontal (X)</Label>
                          <span className="text-xs font-mono tabular-nums text-slate-700">
                            {theme.logoX}%
                          </span>
                        </div>
                        <input
                          id="logo-x-range"
                          type="range"
                          min={5}
                          max={95}
                          step={1}
                          value={theme.logoX}
                          onChange={(e) =>
                            setTheme((prev) => ({
                              ...prev,
                              logoX: Number(e.target.value),
                            }))
                          }
                          className="w-full accent-blue-600 cursor-pointer"
                        />
                        <div className="flex gap-1.5">
                          {[
                            { label: 'Izquierda', val: 18 },
                            { label: 'Centro', val: 50 },
                            { label: 'Derecha', val: 82 },
                          ].map((p) => (
                            <button
                              key={p.val}
                              type="button"
                              onClick={() =>
                                setTheme((prev) => ({ ...prev, logoX: p.val }))
                              }
                              className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="logo-y-range">Posición vertical (Y)</Label>
                          <span className="text-xs font-mono tabular-nums text-slate-700">
                            {theme.logoY}%
                          </span>
                        </div>
                        <input
                          id="logo-y-range"
                          type="range"
                          min={10}
                          max={130}
                          step={1}
                          value={theme.logoY}
                          onChange={(e) =>
                            setTheme((prev) => ({
                              ...prev,
                              logoY: Number(e.target.value),
                            }))
                          }
                          className="w-full accent-blue-600 cursor-pointer"
                        />
                        <div className="flex gap-1.5">
                          {[
                            { label: 'Arriba', val: 35 },
                            { label: 'Dentro', val: 55 },
                            { label: 'Al borde', val: 100 },
                          ].map((p) => (
                            <button
                              key={p.val}
                              type="button"
                              onClick={() =>
                                setTheme((prev) => ({ ...prev, logoY: p.val }))
                              }
                              className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {activeTab === 'texts' && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="brand-name-input">Título superior izquierdo</Label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={theme.showBrandName}
                        onChange={(e) =>
                          setTheme((prev) => ({
                            ...prev,
                            showBrandName: e.target.checked,
                          }))
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                      />
                      <span>Visible</span>
                    </label>
                  </div>
                  <Input
                    id="brand-name-input"
                    value={theme.brandName}
                    onChange={(e) =>
                      setTheme((prev) => ({ ...prev, brandName: e.target.value }))
                    }
                    maxLength={60}
                    placeholder="CascoQR"
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="subtitle-text-input">Texto / insignia superior derecho</Label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={theme.showSubtitle}
                        onChange={(e) =>
                          setTheme((prev) => ({
                            ...prev,
                            showSubtitle: e.target.checked,
                          }))
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                      />
                      <span>Visible</span>
                    </label>
                  </div>
                  <Input
                    id="subtitle-text-input"
                    value={theme.subtitleText}
                    onChange={(e) =>
                      setTheme((prev) => ({ ...prev, subtitleText: e.target.value }))
                    }
                    maxLength={80}
                    placeholder="Ficha de identificación"
                  />
                </div>

                <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 cursor-pointer">
                  <span className="text-xs font-medium text-slate-800">
                    Mostrar botón &ldquo;Ver etiqueta QR asociada&rdquo;
                  </span>
                  <input
                    type="checkbox"
                    checked={theme.showLabelPreviewButton}
                    onChange={(e) =>
                      setTheme((prev) => ({
                        ...prev,
                        showLabelPreviewButton: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                </label>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <Label htmlFor="footer-note-input">Nota opcional al pie de la ficha</Label>
                  <Input
                    id="footer-note-input"
                    value={theme.footerNote}
                    onChange={(e) =>
                      setTheme((prev) => ({ ...prev, footerNote: e.target.value }))
                    }
                    maxLength={200}
                    placeholder="Ej. En caso de emergencia o extravío, contacta al titular."
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
