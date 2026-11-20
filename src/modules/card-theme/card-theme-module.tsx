import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Globe,
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
  type PublicCardData,
} from '@/src/lib/api-client';
import {
  buildOwnerOverrideFromTheme,
  DEFAULT_PUBLIC_CARD_THEME,
  HEADER_COLOR_PRESETS,
  mergeThemeWithOwnerOverride,
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

const GLOBAL_SCOPE_VALUE = '__global__';
type ControlTab = 'header' | 'logo' | 'texts';

interface CardThemeModuleProps {
  initialOwnerId?: string | null;
}

export function CardThemeModule({ initialOwnerId }: CardThemeModuleProps) {
  const [globalTheme, setGlobalTheme] = useState<PublicCardTheme>(DEFAULT_PUBLIC_CARD_THEME);
  const [theme, setTheme] = useState<PublicCardTheme>(DEFAULT_PUBLIC_CARD_THEME);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);

  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [scopeId, setScopeId] = useState<string>(initialOwnerId || GLOBAL_SCOPE_VALUE);
  const [ownerHasCustom, setOwnerHasCustom] = useState(false);
  const [previewCard, setPreviewCard] = useState<PublicCardData>(PREVIEW_SAMPLE_CARD);
  const [loadingOwner, setLoadingOwner] = useState(false);

  const [previewViewport, setPreviewViewport] = useState<'mobile' | 'desktop'>('mobile');
  const [activeTab, setActiveTab] = useState<ControlTab>('header');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (initialOwnerId) {
      setScopeId(initialOwnerId);
    }
  }, [initialOwnerId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [themeRes, ownersRes] = await Promise.all([
          apiClient.getCardTheme(),
          apiClient.listOwners().catch(() => ({ owners: [] as OwnerSummary[] })),
        ]);
        if (cancelled) return;
        setGlobalTheme(themeRes.theme);
        setTheme(themeRes.theme);
        setLogoUrl(themeRes.logoUrl);
        setMigrationPending(Boolean(themeRes.migrationPending));
        setOwners(ownersRes.owners);
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

  useEffect(() => {
    if (loading) return;

    if (scopeId === GLOBAL_SCOPE_VALUE) {
      setTheme(globalTheme);
      setOwnerHasCustom(false);
      setPreviewCard(PREVIEW_SAMPLE_CARD);
      return;
    }

    let cancelled = false;
    async function loadOwnerTheme() {
      setLoadingOwner(true);
      setError(null);
      try {
        const detail = await apiClient.getOwner(scopeId);
        if (cancelled) return;
        const override = detail.owner.cardThemeOverride ?? null;
        setOwnerHasCustom(Boolean(override && override.useGlobalTheme === false));
        setTheme(mergeThemeWithOwnerOverride(globalTheme, override));
        setPreviewCard({
          fullName: detail.owner.fullName,
          email: detail.owner.email,
          phone: detail.owner.phone,
          documents: detail.documents
            .filter((d) => d.isPublic)
            .map((d) => ({
              id: d.id,
              originalName: d.originalName,
              mimeType: d.mimeType,
              createdAt: d.createdAt,
            })),
        });
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'No se pudo cargar el diseño de este propietario.',
          );
        }
      } finally {
        if (!cancelled) setLoadingOwner(false);
      }
    }

    void loadOwnerTheme();
    return () => {
      cancelled = true;
    };
  }, [scopeId, globalTheme, loading]);

  const isGlobalScope = scopeId === GLOBAL_SCOPE_VALUE;
  const activeOwnerSummary = !isGlobalScope
    ? owners.find((o) => o.id === scopeId) ?? null
    : null;

  const scopeOptions = [GLOBAL_SCOPE_VALUE, ...owners.map((o) => o.id)];
  const currentScopeIdx = scopeOptions.indexOf(scopeId);

  const handleStepScope = (delta: number) => {
    if (scopeOptions.length <= 1) return;
    const nextIdx =
      (currentScopeIdx + delta + scopeOptions.length) % scopeOptions.length;
    setFeedback(null);
    setScopeId(scopeOptions[nextIdx]);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      if (isGlobalScope) {
        const { hasCustomLogo: _ignored, ...payload } = theme;
        const res = await apiClient.updateCardTheme(payload);
        setGlobalTheme(res.theme);
        setTheme(res.theme);
        setLogoUrl(res.logoUrl);
        setMigrationPending(false);
        setFeedback(
          'Diseño global guardado. Todas las fichas sin diseño propio ya reflejan estos cambios.',
        );
      } else {
        const { hasCustomLogo: _ignored, ...payload } = theme;
        const override = buildOwnerOverrideFromTheme(payload);
        await apiClient.updateOwnerCardTheme(scopeId, override);
        setOwnerHasCustom(true);
        setOwners((prev) =>
          prev.map((o) =>
            o.id === scopeId ? { ...o, hasCustomCardTheme: true } : o,
          ),
        );
        setFeedback(
          `Diseño personalizado guardado solo para ${activeOwnerSummary?.fullName || 'este propietario'}.`,
        );
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo guardar el diseño.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRevertOwnerToGlobal = async () => {
    if (isGlobalScope) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      await apiClient.updateOwnerCardTheme(scopeId, null);
      setOwnerHasCustom(false);
      setTheme(globalTheme);
      setOwners((prev) =>
        prev.map((o) =>
          o.id === scopeId ? { ...o, hasCustomCardTheme: false } : o,
        ),
      );
      setFeedback(
        `${activeOwnerSummary?.fullName || 'Este propietario'} ahora hereda el diseño global.`,
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo restablecer al diseño global.',
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
      setGlobalTheme(res.theme);
      setTheme((prev) => ({
        ...prev,
        logoVisible: true,
        hasCustomLogo: res.theme.hasCustomLogo,
      }));
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
      setGlobalTheme(res.theme);
      setTheme((prev) => ({ ...prev, hasCustomLogo: false }));
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
      ...(isGlobalScope ? DEFAULT_PUBLIC_CARD_THEME : globalTheme),
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
            Edita el diseño global o personaliza propietario por propietario (1×1) con arrastre libre de logo y franja superior.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isGlobalScope && ownerHasCustom ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleRevertOwnerToGlobal()}
              disabled={saving}
            >
              <Globe className="h-4 w-4" />
              <span>Usar diseño global</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={handleResetDefaults}
              disabled={saving}
            >
              <RotateCcw className="h-4 w-4" />
              <span>{isGlobalScope ? 'Restablecer' : 'Copiar de global'}</span>
            </Button>
          )}
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loadingOwner}
          >
            <Save className="h-4 w-4" />
            <span>
              {saving
                ? 'Guardando...'
                : isGlobalScope
                  ? 'Guardar diseño global'
                  : 'Guardar ficha individual'}
            </span>
          </Button>
        </div>
      </div>

      {/* Scope Selector: Global vs 1x1 Per Owner */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <Label>¿Qué ficha estás editando?</Label>
          <div className="flex items-center gap-2">
            <Select
              value={scopeId}
              onValueChange={(val) => {
                setFeedback(null);
                setScopeId(val);
              }}
            >
              <SelectTrigger className="w-full sm:max-w-md">
                <SelectValue placeholder="Selecciona alcance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GLOBAL_SCOPE_VALUE}>
                  Diseño global (aplica a todos por defecto)
                </SelectItem>
                {owners.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.fullName} · {o.hasCustomCardTheme ? 'Personalizada' : 'Usa global'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {owners.length > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleStepScope(-1)}
                  title="Anterior"
                  aria-label="Propietario anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleStepScope(1)}
                  title="Siguiente (editar 1 por 1)"
                  aria-label="Siguiente propietario"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="text-xs text-slate-600 sm:text-right">
          {isGlobalScope ? (
            <span>
              Editando el <strong>diseño maestro</strong> para quienes usan el global.
            </span>
          ) : ownerHasCustom ? (
            <span className="text-blue-700 font-medium">
              Ficha individual personalizada ({activeOwnerSummary?.fullName})
            </span>
          ) : (
            <span>
              Actualmente hereda el diseño global. Al guardar se volverá individual.
            </span>
          )}
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
            {loadingOwner ? (
              <div className="w-full max-w-[390px] h-[480px] rounded-[28px] bg-slate-200 animate-pulse" />
            ) : (
              <div
                className={`border border-slate-300 shadow-md overflow-hidden transition-all ${
                  previewViewport === 'mobile'
                    ? 'w-full max-w-[390px] rounded-[28px]'
                    : 'w-full rounded-xl'
                }`}
              >
                <PublicCardView
                  card={previewCard}
                  theme={theme}
                  logoUrl={logoUrl}
                  interactive
                  onThemeChange={setTheme}
                />
              </div>
            )}
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
                        { id: 'slate', label: 'Gris claro', swatch: '#E2E8F0' },
                        { id: 'white', label: 'Blanco puro', swatch: '#FFFFFF' },
                        { id: 'warm', label: 'Arena cálido', swatch: '#EFE6D5' },
                        { id: 'dark', label: 'Modo oscuro', swatch: '#020617' },
                      ] as Array<{ id: PageBackgroundMode; label: string; swatch: string }>
                    ).map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => setTheme((prev) => ({ ...prev, pageBg: bg.id }))}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium text-left flex items-center gap-2 cursor-pointer transition-colors ${
                          theme.pageBg === bg.id
                            ? 'border-blue-600 bg-blue-50/70 text-blue-700 ring-1 ring-blue-600'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <span
                          className="h-4 w-4 rounded-full border border-slate-300 shrink-0"
                          style={{ backgroundColor: bg.swatch }}
                        />
                        <span>{bg.label}</span>
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
                  <Label>
                    Imagen del logo {isGlobalScope ? '' : '(compartida globalmente)'}
                  </Label>
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
