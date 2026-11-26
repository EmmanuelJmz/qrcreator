import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Crop,
  Globe,
  Monitor,
  RotateCcw,
  Save,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import { CircularLogoCropperDialog } from '@/src/components/circular-logo-cropper-dialog';
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
  normalizePublicCardTheme,
  type PageBackgroundMode,
  type PublicCardTheme,
} from '@/src/lib/public-card-theme';

const PREVIEW_SAMPLE_CARD: PublicCardData = {
  fullName: 'Carlos Mendoza Ruiz',
  email: null,
  phone: null,
  emergencyProfile: {
    birthDate: '1994-06-15',
    bloodType: 'O+',
    organDonor: 'yes',
    cityState: 'Guadalajara, Jal.',
    contact1: {
      name: 'Martha Ruiz',
      phone: '+52 33 1987 6543',
      relationship: 'mama',
      relationshipCustom: '',
    },
    contact2: {
      name: 'Luis Mendoza',
      phone: '+52 33 1456 7890',
      relationship: 'hermano',
      relationshipCustom: '',
    },
    locationShare: {
      enabled: true,
      targetContact: 'contact1',
    },
    allergies: {
      noneKnown: false,
      selected: ['Penicilina'],
      custom: ['Sulfamidas'],
    },
    conditions: {
      noneKnown: false,
      selected: ['Diabetes (azúcar)', 'Gastritis / Úlcera'],
      custom: [],
    },
    medications: {
      noneKnown: false,
      items: ['Metformina 850 mg'],
    },
    insurance: {
      institution: 'IMSS',
      nss: '12345678901',
      policyNumber: '',
      clinic: 'UMF 51',
    },
    rescueNotes: 'Casco modular negro. Ante emergencia llamar primero a Martha Ruiz.',
  },
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
const DRAFT_STORAGE_KEY = 'cascoqr_card_theme_drafts_v1';
type ControlTab = 'header' | 'logo' | 'texts';

interface CardThemeModuleProps {
  initialOwnerId?: string | null;
}

function readStoredDrafts(): Record<string, PublicCardTheme> {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, PublicCardTheme> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === 'object') {
        result[key] = normalizePublicCardTheme({
          ...(value as Record<string, unknown>),
          logoShape: 'circle',
        });
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeStoredDrafts(drafts: Record<string, PublicCardTheme>) {
  try {
    if (Object.keys(drafts).length === 0) {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    }
  } catch {
    // Ignore storage quota errors
  }
}

function enforceCircularTheme(t: PublicCardTheme): PublicCardTheme {
  return { ...t, logoShape: 'circle' };
}

function themesDiffer(a: PublicCardTheme, b: PublicCardTheme): boolean {
  return (
    a.brandName !== b.brandName ||
    a.subtitleText !== b.subtitleText ||
    a.showBrandName !== b.showBrandName ||
    a.showSubtitle !== b.showSubtitle ||
    a.headerColor !== b.headerColor ||
    a.headerHeight !== b.headerHeight ||
    a.logoVisible !== b.logoVisible ||
    a.logoSize !== b.logoSize ||
    a.logoX !== b.logoX ||
    a.logoY !== b.logoY ||
    a.pageBg !== b.pageBg ||
    a.showLabelPreviewButton !== b.showLabelPreviewButton ||
    a.footerNote !== b.footerNote
  );
}

export function CardThemeModule({ initialOwnerId }: CardThemeModuleProps) {
  const [globalTheme, setGlobalTheme] = useState<PublicCardTheme>(DEFAULT_PUBLIC_CARD_THEME);
  const globalThemeRef = useRef<PublicCardTheme>(DEFAULT_PUBLIC_CARD_THEME);
  const savedScopeThemeRef = useRef<PublicCardTheme>(DEFAULT_PUBLIC_CARD_THEME);
  const draftsByScopeRef = useRef<Record<string, PublicCardTheme>>(readStoredDrafts());

  const [theme, setTheme] = useState<PublicCardTheme>(() => {
    const initialScope = initialOwnerId || GLOBAL_SCOPE_VALUE;
    return draftsByScopeRef.current[initialScope] ?? DEFAULT_PUBLIC_CARD_THEME;
  });
  const [savedThemeSnapshot, setSavedThemeSnapshot] = useState<PublicCardTheme>(
    DEFAULT_PUBLIC_CARD_THEME,
  );
  const [globalLogoUrl, setGlobalLogoUrl] = useState<string | null>(null);
  const [ownerLogoUrl, setOwnerLogoUrl] = useState<string | null>(null);
  const ownerLogoUrlRef = useRef<string | null>(null);
  const [ownerHasCustomLogo, setOwnerHasCustomLogo] = useState(false);
  const [migrationPending, setMigrationPending] = useState(false);

  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [scopeId, setScopeId] = useState<string>(initialOwnerId || GLOBAL_SCOPE_VALUE);
  const [ownerHasCustom, setOwnerHasCustom] = useState(false);
  const [previewCard, setPreviewCard] = useState<PublicCardData>(PREVIEW_SAMPLE_CARD);
  const [loadingOwner, setLoadingOwner] = useState(false);

  const [previewViewport, setPreviewViewport] = useState<'mobile' | 'desktop'>('mobile');
  const [activeTab, setActiveTab] = useState<ControlTab>('header');

  const [cropSource, setCropSource] = useState<{
    url: string;
    fileName: string;
    isObjectUrl: boolean;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    globalThemeRef.current = globalTheme;
  }, [globalTheme]);

  useEffect(() => {
    if (initialOwnerId) {
      setScopeId(initialOwnerId);
    }
  }, [initialOwnerId]);

  useEffect(() => {
    return () => {
      if (cropSource?.isObjectUrl) {
        URL.revokeObjectURL(cropSource.url);
      }
    };
  }, [cropSource]);

  useEffect(() => {
    return () => {
      if (ownerLogoUrlRef.current) {
        URL.revokeObjectURL(ownerLogoUrlRef.current);
        ownerLogoUrlRef.current = null;
      }
    };
  }, []);

  const replaceOwnerLogoUrl = useCallback((nextUrl: string | null) => {
    if (ownerLogoUrlRef.current && ownerLogoUrlRef.current !== nextUrl) {
      URL.revokeObjectURL(ownerLogoUrlRef.current);
    }
    ownerLogoUrlRef.current = nextUrl;
    setOwnerLogoUrl(nextUrl);
  }, []);

  const updateDraftTheme = useCallback(
    (updater: (prev: PublicCardTheme) => PublicCardTheme) => {
      setTheme((prev) => {
        const next = enforceCircularTheme(updater(prev));
        if (themesDiffer(next, savedScopeThemeRef.current)) {
          draftsByScopeRef.current[scopeId] = next;
        } else {
          delete draftsByScopeRef.current[scopeId];
        }
        writeStoredDrafts(draftsByScopeRef.current);
        return next;
      });
    },
    [scopeId],
  );

  const clearDraftForScope = useCallback((targetScope: string) => {
    if (draftsByScopeRef.current[targetScope]) {
      delete draftsByScopeRef.current[targetScope];
      writeStoredDrafts(draftsByScopeRef.current);
    }
  }, []);

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
        const normalizedGlobal = enforceCircularTheme(themeRes.theme);
        globalThemeRef.current = normalizedGlobal;
        setGlobalTheme(normalizedGlobal);
        setGlobalLogoUrl(themeRes.logoUrl);
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
      const saved = enforceCircularTheme(globalThemeRef.current);
      savedScopeThemeRef.current = saved;
      setSavedThemeSnapshot(saved);
      const draft = draftsByScopeRef.current[GLOBAL_SCOPE_VALUE];
      setTheme(
        draft
          ? enforceCircularTheme({ ...draft, hasCustomLogo: saved.hasCustomLogo })
          : saved,
      );
      setOwnerHasCustom(false);
      setOwnerHasCustomLogo(false);
      replaceOwnerLogoUrl(null);
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
        const currentGlobal = globalThemeRef.current;
        const hasOwnLogo = Boolean(detail.owner.hasCustomLogo);
        const ownLogoBlobUrl = hasOwnLogo
          ? await apiClient.fetchOwnerCardLogoUrl(scopeId).catch(() => null)
          : null;
        if (cancelled) {
          if (ownLogoBlobUrl) URL.revokeObjectURL(ownLogoBlobUrl);
          return;
        }

        replaceOwnerLogoUrl(ownLogoBlobUrl);
        setOwnerHasCustomLogo(hasOwnLogo);

        const merged = enforceCircularTheme({
          ...mergeThemeWithOwnerOverride(currentGlobal, override),
          hasCustomLogo: hasOwnLogo || currentGlobal.hasCustomLogo,
        });
        savedScopeThemeRef.current = merged;
        setSavedThemeSnapshot(merged);
        setOwnerHasCustom(Boolean(override && override.useGlobalTheme === false));

        const draft = draftsByScopeRef.current[scopeId];
        setTheme(
          draft
            ? enforceCircularTheme({
                ...draft,
                hasCustomLogo: hasOwnLogo || currentGlobal.hasCustomLogo,
              })
            : merged,
        );
        setPreviewCard({
          fullName: detail.owner.fullName,
          email: null,
          phone: null,
          emergencyProfile: detail.owner.emergencyProfile ?? null,
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
  }, [scopeId, loading, replaceOwnerLogoUrl]);

  const isGlobalScope = scopeId === GLOBAL_SCOPE_VALUE;
  const activeOwnerSummary = !isGlobalScope
    ? owners.find((o) => o.id === scopeId) ?? null
    : null;
  const activeLogoUrl = isGlobalScope
    ? globalLogoUrl
    : ownerHasCustomLogo && ownerLogoUrl
      ? ownerLogoUrl
      : globalLogoUrl;

  const scopeOptions = [GLOBAL_SCOPE_VALUE, ...owners.map((o) => o.id)];
  const currentScopeIdx = scopeOptions.indexOf(scopeId);

  const hasUnsavedChanges = useMemo(
    () => themesDiffer(theme, savedThemeSnapshot),
    [theme, savedThemeSnapshot],
  );

  const handleStepScope = (delta: number) => {
    if (scopeOptions.length <= 1) return;
    const nextIdx =
      (currentScopeIdx + delta + scopeOptions.length) % scopeOptions.length;
    setFeedback(null);
    setScopeId(scopeOptions[nextIdx]);
  };

  const handleDiscardDraft = () => {
    clearDraftForScope(scopeId);
    setTheme(savedScopeThemeRef.current);
    setFeedback(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const circularTheme = enforceCircularTheme(theme);
      if (isGlobalScope) {
        const { hasCustomLogo: _ignored, ...payload } = circularTheme;
        const res = await apiClient.updateCardTheme(payload);
        const saved = enforceCircularTheme(res.theme);
        globalThemeRef.current = saved;
        savedScopeThemeRef.current = saved;
        setGlobalTheme(saved);
        setSavedThemeSnapshot(saved);
        setTheme(saved);
        setGlobalLogoUrl(res.logoUrl);
        setMigrationPending(false);
        clearDraftForScope(GLOBAL_SCOPE_VALUE);
        setFeedback(
          'Diseño global guardado. Todas las fichas sin diseño propio ya reflejan estos cambios.',
        );
      } else {
        const { hasCustomLogo: _ignored, ...payload } = circularTheme;
        const override = buildOwnerOverrideFromTheme(payload);
        await apiClient.updateOwnerCardTheme(scopeId, override);
        savedScopeThemeRef.current = circularTheme;
        setSavedThemeSnapshot(circularTheme);
        setTheme(circularTheme);
        setOwnerHasCustom(true);
        clearDraftForScope(scopeId);
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
      const nextGlobal = enforceCircularTheme(globalThemeRef.current);
      savedScopeThemeRef.current = nextGlobal;
      setSavedThemeSnapshot(nextGlobal);
      setOwnerHasCustom(false);
      setTheme(nextGlobal);
      clearDraftForScope(scopeId);
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

  const handleSelectLogoFile = (file: File | null) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['jpg', 'jpeg', 'png'].includes(ext)) {
      setError('El logo debe ser una imagen JPG, JPEG o PNG.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('La imagen seleccionada no puede exceder 4 MB.');
      return;
    }

    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setCropSource({
      url: objectUrl,
      fileName: file.name,
      isObjectUrl: true,
    });
  };

  const handleOpenCropExistingLogo = () => {
    if (!activeLogoUrl) return;
    setError(null);
    setCropSource({
      url: activeLogoUrl,
      fileName: isGlobalScope ? 'logo-global.png' : 'foto-logo-propietario.png',
      isObjectUrl: false,
    });
  };

  const handleUploadCroppedLogo = async (croppedFile: File) => {
    setUploadingLogo(true);
    setError(null);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('logo', croppedFile);

      if (isGlobalScope) {
        const res = await apiClient.uploadCardLogo(fd);

        // Update global/saved logo state WITHOUT wiping unsaved theme draft edits
        const nextGlobal = enforceCircularTheme({
          ...globalThemeRef.current,
          hasCustomLogo: res.theme.hasCustomLogo,
          logoVisible: true,
        });
        globalThemeRef.current = nextGlobal;
        savedScopeThemeRef.current = enforceCircularTheme({
          ...savedScopeThemeRef.current,
          hasCustomLogo: res.theme.hasCustomLogo,
        });
        setGlobalTheme(nextGlobal);
        setSavedThemeSnapshot(savedScopeThemeRef.current);
        setGlobalLogoUrl(res.logoUrl);
        setMigrationPending(false);

        for (const key of Object.keys(draftsByScopeRef.current)) {
          draftsByScopeRef.current[key] = enforceCircularTheme({
            ...draftsByScopeRef.current[key],
            hasCustomLogo: res.theme.hasCustomLogo,
          });
        }
        updateDraftTheme((prev) => ({
          ...prev,
          logoVisible: true,
          logoShape: 'circle',
          hasCustomLogo: res.theme.hasCustomLogo,
        }));

        setCropSource(null);
        setFeedback('Logo global circular recortado y aplicado para todas las fichas que heredan el global.');
      } else {
        await apiClient.uploadOwnerCardLogo(scopeId, fd);
        const nextBlobUrl = URL.createObjectURL(croppedFile);
        replaceOwnerLogoUrl(nextBlobUrl);
        setOwnerHasCustomLogo(true);

        savedScopeThemeRef.current = enforceCircularTheme({
          ...savedScopeThemeRef.current,
          hasCustomLogo: true,
        });
        setSavedThemeSnapshot(savedScopeThemeRef.current);
        setOwners((prev) =>
          prev.map((o) =>
            o.id === scopeId ? { ...o, hasCustomLogo: true } : o,
          ),
        );
        updateDraftTheme((prev) => ({
          ...prev,
          logoVisible: true,
          logoShape: 'circle',
          hasCustomLogo: true,
        }));

        setCropSource(null);
        setFeedback(
          `Imagen circular guardada solo para ${activeOwnerSummary?.fullName || 'este propietario'}. No afecta a los demás.`,
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo subir la imagen.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveCustomLogo = async () => {
    setUploadingLogo(true);
    setError(null);
    setFeedback(null);
    try {
      if (isGlobalScope) {
        const res = await apiClient.deleteCardLogo();
        const nextGlobal = enforceCircularTheme({
          ...globalThemeRef.current,
          hasCustomLogo: res.theme.hasCustomLogo,
        });
        globalThemeRef.current = nextGlobal;
        savedScopeThemeRef.current = enforceCircularTheme({
          ...savedScopeThemeRef.current,
          hasCustomLogo: false,
        });
        setGlobalTheme(nextGlobal);
        setSavedThemeSnapshot(savedScopeThemeRef.current);
        setGlobalLogoUrl(null);

        for (const key of Object.keys(draftsByScopeRef.current)) {
          draftsByScopeRef.current[key] = enforceCircularTheme({
            ...draftsByScopeRef.current[key],
            hasCustomLogo: false,
          });
        }
        updateDraftTheme((prev) => ({ ...prev, hasCustomLogo: false, logoShape: 'circle' }));
        setFeedback('Se restauró el ícono de casco predeterminado en el diseño global.');
      } else {
        await apiClient.deleteOwnerCardLogo(scopeId);
        replaceOwnerLogoUrl(null);
        setOwnerHasCustomLogo(false);
        const fallbackHasLogo = globalThemeRef.current.hasCustomLogo;
        savedScopeThemeRef.current = enforceCircularTheme({
          ...savedScopeThemeRef.current,
          hasCustomLogo: fallbackHasLogo,
        });
        setSavedThemeSnapshot(savedScopeThemeRef.current);
        setOwners((prev) =>
          prev.map((o) =>
            o.id === scopeId ? { ...o, hasCustomLogo: false } : o,
          ),
        );
        updateDraftTheme((prev) => ({
          ...prev,
          hasCustomLogo: fallbackHasLogo,
          logoShape: 'circle',
        }));
        setFeedback(
          `${activeOwnerSummary?.fullName || 'Este propietario'} ahora hereda el logo global.`,
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo quitar la imagen.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleResetDefaults = () => {
    setFeedback(null);
    updateDraftTheme((prev) => ({
      ...(isGlobalScope ? DEFAULT_PUBLIC_CARD_THEME : globalThemeRef.current),
      logoShape: 'circle',
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
          {hasUnsavedChanges && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDiscardDraft}
              disabled={saving}
              className="text-slate-600"
            >
              Descartar cambios
            </Button>
          )}
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

        <div className="text-xs text-slate-600 sm:text-right space-y-0.5">
          <div>
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
          {hasUnsavedChanges && (
            <p className="text-amber-700 font-medium">
              Cambios pendientes por guardar
            </p>
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
                  logoUrl={activeLogoUrl}
                  interactive
                  onThemeChange={updateDraftTheme}
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
                { id: 'logo', label: 'Logo circular' },
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
                            updateDraftTheme((prev) => ({ ...prev, headerColor: preset.hex }))
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
                        updateDraftTheme((prev) => ({
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
                      updateDraftTheme((prev) => ({
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
                          updateDraftTheme((prev) => ({ ...prev, headerHeight: opt.val }))
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
                        onClick={() =>
                          updateDraftTheme((prev) => ({ ...prev, pageBg: bg.id }))
                        }
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
                      updateDraftTheme((prev) => ({
                        ...prev,
                        logoVisible: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                </label>

                <div className="space-y-2 pt-1">
                  <Label>
                    {isGlobalScope
                      ? 'Logo global de tu marca'
                      : `Foto o logo individual (${activeOwnerSummary?.fullName || 'propietario'})`}
                  </Label>
                  <p className="text-xs text-slate-500">
                    {isGlobalScope
                      ? 'Se muestra en formato circular para todas las fichas que no tengan una foto o logo propio.'
                      : ownerHasCustomLogo
                        ? 'Este propietario usa su propia foto o logo circular (no afecta a los demás).'
                        : 'Actualmente hereda el logo global. Si subes una foto o logo aquí, aplicará solo para este propietario.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <label
                      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer ${
                        uploadingLogo ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>
                        {uploadingLogo
                          ? 'Subiendo...'
                          : isGlobalScope
                            ? theme.hasCustomLogo
                              ? 'Cambiar y recortar logo'
                              : 'Subir y recortar logo'
                            : ownerHasCustomLogo
                              ? 'Cambiar foto / logo'
                              : 'Subir foto / logo individual'}
                      </span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                        className="sr-only"
                        disabled={uploadingLogo}
                        onChange={(e) => {
                          handleSelectLogoFile(e.target.files?.[0] ?? null);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    {theme.hasCustomLogo && activeLogoUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingLogo}
                        onClick={handleOpenCropExistingLogo}
                      >
                        <Crop className="h-3.5 w-3.5" />
                        <span>Recortar actual</span>
                      </Button>
                    )}

                    {(isGlobalScope ? theme.hasCustomLogo : ownerHasCustomLogo) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingLogo}
                        onClick={() => void handleRemoveCustomLogo()}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>
                          {isGlobalScope ? 'Usar casco original' : 'Volver al logo global'}
                        </span>
                      </Button>
                    )}
                  </div>
                </div>

                {theme.logoVisible && (
                  <>
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="logo-size-range">Tamaño del círculo en la ficha</Label>
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
                          updateDraftTheme((prev) => ({
                            ...prev,
                            logoSize: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                      <div className="flex gap-1.5">
                        {[
                          { label: 'Chico (76px)', val: 76 },
                          { label: 'Mediano (112px)', val: 112 },
                          { label: 'Grande (152px)', val: 152 },
                        ].map((s) => (
                          <button
                            key={s.val}
                            type="button"
                            onClick={() =>
                              updateDraftTheme((prev) => ({ ...prev, logoSize: s.val }))
                            }
                            className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
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
                            updateDraftTheme((prev) => ({
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
                                updateDraftTheme((prev) => ({ ...prev, logoX: p.val }))
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
                            updateDraftTheme((prev) => ({
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
                                updateDraftTheme((prev) => ({ ...prev, logoY: p.val }))
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
                          updateDraftTheme((prev) => ({
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
                      updateDraftTheme((prev) => ({ ...prev, brandName: e.target.value }))
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
                          updateDraftTheme((prev) => ({
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
                      updateDraftTheme((prev) => ({
                        ...prev,
                        subtitleText: e.target.value,
                      }))
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
                      updateDraftTheme((prev) => ({
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
                      updateDraftTheme((prev) => ({
                        ...prev,
                        footerNote: e.target.value,
                      }))
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

      <CircularLogoCropperDialog
        open={Boolean(cropSource)}
        imageSrc={cropSource?.url ?? null}
        fileName={cropSource?.fileName}
        submitting={uploadingLogo}
        onCancel={() => !uploadingLogo && setCropSource(null)}
        onConfirm={handleUploadCroppedLogo}
      />
    </div>
  );
}
