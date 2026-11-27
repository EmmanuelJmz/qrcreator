import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileImage,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Power,
  Printer,
  QrCode,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { PrintSheetDialog } from '@/src/components/print-sheet-dialog';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import {
  apiClient,
  ApiError,
  type OwnerDashboardStats,
  type OwnerStatusFilter,
  type OwnerSummary,
} from '@/src/lib/api-client';
import { formatDateShort } from '@/src/lib/utils';
import { OwnerCreateView } from './owner-create-view';
import { OwnerEditDialog } from './owner-edit-dialog';

interface OwnersModuleProps {
  onOpenEditorForOwner: (ownerId: string) => void;
  onOpenPublicCardForToken: (token: string) => void;
  onOpenCardThemeForOwner: (ownerId: string) => void;
  onOpenTemplates: () => void;
  onOpenTour?: () => void;
}

export function OwnersModule({
  onOpenEditorForOwner,
  onOpenPublicCardForToken,
  onOpenCardThemeForOwner,
  onOpenTemplates,
  onOpenTour,
}: OwnersModuleProps) {
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [stats, setStats] = useState<OwnerDashboardStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OwnerStatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<OwnerSummary | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OwnerSummary | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingOwner, setDeletingOwner] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showPrintSheetDialog, setShowPrintSheetDialog] = useState(false);
  const [downloadingOwnerId, setDownloadingOwnerId] = useState<string | null>(null);
  const [copiedOwnerId, setCopiedOwnerId] = useState<string | null>(null);

  const fetchOwners = useCallback(async (q: string, status: OwnerStatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listOwners(q, status);
      setOwners(res.owners);
      const eligibleIdSet = new Set(
        res.owners
          .filter((o) => o.status && o.hasLabel && Boolean(o.publicToken))
          .map((o) => o.id),
      );
      setSelectedIds((prev) => prev.filter((id) => eligibleIdSet.has(id)));
      if (res.stats) {
        setStats(res.stats);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar los propietarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'list') return;
    const handle = window.setTimeout(() => {
      void fetchOwners(searchQuery, statusFilter);
    }, 180);
    return () => window.clearTimeout(handle);
  }, [searchQuery, statusFilter, mode, fetchOwners]);

  const handleConfirmToggleStatus = async () => {
    if (!statusTarget) return;
    setTogglingStatus(true);
    setError(null);
    setFeedback(null);
    const nextStatus = !statusTarget.status;
    try {
      await apiClient.setOwnerStatus(statusTarget.id, nextStatus);
      setFeedback(
        nextStatus
          ? `Propietario "${statusTarget.fullName}" reactivado con un token QR nuevo.`
          : `Propietario "${statusTarget.fullName}" desactivado y token QR anterior revocado.`,
      );
      setStatusTarget(null);
      await fetchOwners(searchQuery, statusFilter);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleConfirmDeleteOwner = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!deleteTarget) return;
    if (deleteConfirmText.trim().toLowerCase() !== 'confirmar') return;

    setDeletingOwner(true);
    setError(null);
    setFeedback(null);
    const target = deleteTarget;
    try {
      await apiClient.deleteOwner(target.id);
      setSelectedIds((prev) => prev.filter((id) => id !== target.id));
      try {
        const rawDrafts = window.sessionStorage.getItem('cascoqr_card_theme_drafts_v1');
        if (rawDrafts) {
          const parsed = JSON.parse(rawDrafts) as Record<string, unknown>;
          if (parsed && typeof parsed === 'object' && target.id in parsed) {
            delete parsed[target.id];
            window.sessionStorage.setItem('cascoqr_card_theme_drafts_v1', JSON.stringify(parsed));
          }
        }
      } catch {
        // Ignore sessionStorage errors
      }
      setDeleteTarget(null);
      setDeleteConfirmText('');
      setFeedback(
        `Propietario "${target.fullName}" y toda su información (documentos, QR y ficha) fueron eliminados permanentemente.`,
      );
      await fetchOwners(searchQuery, statusFilter);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo eliminar el propietario permanentemente.',
      );
    } finally {
      setDeletingOwner(false);
    }
  };

  const handleQuickDownloadPng = async (owner: OwnerSummary) => {
    setDownloadingOwnerId(owner.id);
    setError(null);
    try {
      const blob = await apiClient.renderLabelPng(owner.id);
      const blobUrl = URL.createObjectURL(blob);
      const slug =
        owner.fullName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'propietario';
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `etiqueta-${slug}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo descargar la etiqueta PNG.',
      );
    } finally {
      setDownloadingOwnerId(null);
    }
  };

  const handleCopyPublicUrl = async (owner: OwnerSummary) => {
    const url =
      owner.publicUrl ||
      (owner.publicToken ? `${window.location.origin}/ficha/${owner.publicToken}` : null);
    if (!url) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedOwnerId(owner.id);
      window.setTimeout(() => {
        setCopiedOwnerId((curr) => (curr === owner.id ? null : curr));
      }, 2000);
    } catch {
      setError('No se pudo copiar el enlace al portapapeles.');
    }
  };

  const eligibleOwners = owners.filter(
    (o) => o.status && o.hasLabel && Boolean(o.publicToken),
  );
  const allEligibleSelected =
    eligibleOwners.length > 0 &&
    eligibleOwners.every((o) => selectedIds.includes(o.id));

  const toggleSelectAllEligible = () => {
    if (allEligibleSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligibleOwners.map((o) => o.id));
    }
  };

  const toggleSelectOwner = (ownerId: string) => {
    setSelectedIds((prev) =>
      prev.includes(ownerId)
        ? prev.filter((id) => id !== ownerId)
        : [...prev, ownerId],
    );
  };

  if (mode === 'create') {
    return (
      <OwnerCreateView
        onCancel={() => setMode('list')}
        onCreated={() => {
          setMode('list');
          setFeedback('Propietario y etiqueta QR registrados correctamente.');
          void fetchOwners(searchQuery, statusFilter);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Propietarios registrados
          </h2>
          <p className="text-sm text-slate-500">
            Gestiona propietarios, documentación, estado de vigencia y acceso a etiquetas QR.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            data-tour="print-btn"
            disabled={eligibleOwners.length === 0}
            onClick={() => setShowPrintSheetDialog(true)}
            title={
              eligibleOwners.length === 0
                ? 'Necesitas al menos un propietario activo con etiqueta configurada'
                : 'Elige 1 o varios stickers listos para mini impresora o en hoja Carta / Tabloide'
            }
          >
            <Printer className="h-4 w-4" />
            <span>
              {selectedIds.length > 0
                ? `Imprimir (${selectedIds.length})`
                : 'Imprimir etiquetas'}
            </span>
          </Button>

          <Button data-tour="new-owner-btn" onClick={() => setMode('create')}>
            <Plus className="h-4 w-4" />
            <span>Nuevo propietario</span>
          </Button>
        </div>
      </div>

      {/* Resumen operativo */}
      {stats ? (
        <div data-tour="stats-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            aria-pressed={statusFilter === 'all'}
            className={`text-left rounded-xl border p-4 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              statusFilter === 'all'
                ? 'border-blue-600 bg-white ring-2 ring-blue-600/15'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
              <span>Propietarios totales</span>
              <Users className="h-4 w-4 text-slate-400 shrink-0" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
              {stats.totalOwners}
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              {stats.totalLabels} {stats.totalLabels === 1 ? 'etiqueta QR' : 'etiquetas QR'}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setStatusFilter((curr) => (curr === 'active' ? 'all' : 'active'))
            }
            aria-pressed={statusFilter === 'active'}
            className={`text-left rounded-xl border p-4 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              statusFilter === 'active'
                ? 'border-emerald-600 bg-white ring-2 ring-emerald-600/15'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
              <span>Activos con QR</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
              {stats.activeOwners}
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              {stats.totalOwners > 0
                ? `${Math.round((stats.activeOwners / stats.totalOwners) * 100)}% del total · ${stats.totalScans ?? 0} ${(stats.totalScans ?? 0) === 1 ? 'escaneo' : 'escaneos'}`
                : 'Sin registros aún'}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setStatusFilter((curr) => (curr === 'inactive' ? 'all' : 'inactive'))
            }
            aria-pressed={statusFilter === 'inactive'}
            className={`text-left rounded-xl border p-4 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              statusFilter === 'inactive'
                ? 'border-red-600 bg-white ring-2 ring-red-600/15'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
              <span>Inactivos</span>
              <Ban className="h-4 w-4 text-red-500 shrink-0" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
              {stats.inactiveOwners}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Tokens QR revocados
            </p>
          </button>

          <button
            type="button"
            onClick={onOpenTemplates}
            className="text-left rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
              <span>Plantillas</span>
              <FileImage className="h-4 w-4 text-slate-400 shrink-0" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
              {stats.totalTemplates}
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              {stats.totalDocuments} {stats.totalDocuments === 1 ? 'documento cargado' : 'documentos cargados'}
            </p>
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-[104px] rounded-xl border border-slate-200 bg-white animate-pulse"
            />
          ))}
        </div>
      ) : null}

      {onOpenTour && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-slate-600">
            <BookOpen className="h-4 w-4 text-blue-600 shrink-0" />
            <span>
              ¿Necesitas repasar cómo usar propietarios, plantillas, editor, impresión o diseño?
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-tour="replay-tour-btn"
            onClick={onOpenTour}
            className="self-start sm:self-auto whitespace-nowrap shrink-0"
          >
            <BookOpen className="h-4 w-4 text-blue-600" />
            <span>Repetir guía de uso</span>
          </Button>
        </div>
      )}

      {/* Search & Status Filter Bar */}
      <div
        data-tour="search-bar"
        className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre o apellidos..."
            className="pl-9"
            aria-label="Buscar propietarios"
          />
        </div>

        <div
          role="group"
          aria-label="Filtrar por estado"
          className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 self-start sm:self-auto"
        >
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'active', label: 'Activos' },
              { id: 'inactive', label: 'Inactivos' },
            ] as const
          ).map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
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

      {selectedIds.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-800">
            <span className="font-mono font-semibold tabular-nums text-blue-700">
              {selectedIds.length}
            </span>
            <span>
              {selectedIds.length === 1
                ? 'etiqueta seleccionada'
                : 'etiquetas seleccionadas'}{' '}
              para imprimir
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds([])}
            >
              Limpiar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setShowPrintSheetDialog(true)}
            >
              <Printer className="h-4 w-4" />
              <span>Imprimir selección</span>
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-14 bg-white animate-pulse px-4" />
          ))}
        </div>
      ) : owners.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center space-y-3">
          <Users className="h-10 w-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-semibold text-slate-900">
            {searchQuery.trim() || statusFilter !== 'all'
              ? 'No se encontraron coincidencias'
              : 'Aún no hay propietarios registrados'}
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            {searchQuery.trim() || statusFilter !== 'all'
              ? 'Ajusta la búsqueda o cambia el filtro de estado para ver otros registros.'
              : 'Registra el primer propietario y configura su etiqueta QR en el mismo flujo.'}
          </p>
          {searchQuery.trim() || statusFilter !== 'all' ? (
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
            >
              <span>Limpiar filtros</span>
            </Button>
          ) : (
            <Button onClick={() => setMode('create')}>
              <Plus className="h-4 w-4" />
              <span>Registrar primer propietario</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={allEligibleSelected}
                      disabled={eligibleOwners.length === 0}
                      onChange={toggleSelectAllEligible}
                      aria-label="Seleccionar todas las etiquetas activas"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 disabled:opacity-40 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Nombre completo</th>
                  <th className="py-3 px-4">Ficha médica</th>
                  <th className="py-3 px-4 text-right">Documentos</th>
                  <th className="py-3 px-4 text-right">Escaneos</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Etiqueta</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {owners.map((owner) => {
                  const isEligible =
                    owner.status && owner.hasLabel && Boolean(owner.publicToken);
                  const isSelected = selectedIds.includes(owner.id);
                  const isDownloading = downloadingOwnerId === owner.id;
                  const isCopied = copiedOwnerId === owner.id;

                  return (
                    <tr
                      key={owner.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-50/40 hover:bg-blue-50/60' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isEligible}
                          onChange={() => toggleSelectOwner(owner.id)}
                          aria-label={`Seleccionar etiqueta de ${owner.fullName}`}
                          title={
                            isEligible
                              ? 'Incluir en hoja de impresión'
                              : 'Requiere propietario activo y etiqueta configurada'
                          }
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {owner.fullName}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {owner.hasEmergencyProfile ? (
                          <span className="text-emerald-700 font-medium">Completa</span>
                        ) : (
                          <span className="text-slate-400">Sin datos</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {owner.documentCount} / 5
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="font-mono tabular-nums text-slate-800 font-medium">
                          {owner.scanCount ?? 0}
                        </div>
                        {owner.lastScannedAt && (
                          <div className="text-[11px] text-slate-400">
                            {formatDateShort(owner.lastScannedAt)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {owner.status ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span>Activo</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
                            <Ban className="h-4 w-4 text-red-600 shrink-0" />
                            <span>Inactivo</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {owner.hasLabel ? (
                          <span>{owner.templateName || 'Asignada'}</span>
                        ) : (
                          <span className="text-slate-400">Sin asignar</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!owner.status || !owner.publicToken}
                            onClick={() =>
                              owner.publicToken && onOpenPublicCardForToken(owner.publicToken)
                            }
                            title={
                              owner.status
                                ? 'Ver ficha pública'
                                : 'Propietario inactivo'
                            }
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Ver ficha</span>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!owner.status || !owner.publicToken}
                            onClick={() => void handleCopyPublicUrl(owner)}
                            title={
                              owner.status && owner.publicToken
                                ? 'Copiar enlace de la ficha QR'
                                : 'Propietario inactivo'
                            }
                          >
                            {isCopied ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                                <span className="text-emerald-700">Copiado</span>
                              </>
                            ) : (
                              <>
                                <Link2 className="h-3.5 w-3.5" />
                                <span>Copiar</span>
                              </>
                            )}
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!isEligible || isDownloading}
                            onClick={() => void handleQuickDownloadPng(owner)}
                            title={
                              isEligible
                                ? 'Descargar etiqueta lista en PNG'
                                : 'Requiere propietario activo y etiqueta configurada'
                            }
                          >
                            {isDownloading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            <span>PNG</span>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingOwnerId(owner.id)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Editar</span>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenEditorForOwner(owner.id)}
                            title="Editar etiqueta QR"
                          >
                            <QrCode className="h-3.5 w-3.5" />
                            <span>Etiqueta</span>
                          </Button>

                          <Button
                            variant={owner.status ? 'outline' : 'default'}
                            size="sm"
                            onClick={() => setStatusTarget(owner)}
                            className={
                              owner.status
                                ? 'text-amber-700 hover:text-amber-800 hover:bg-amber-50'
                                : ''
                            }
                          >
                            <Power className="h-3.5 w-3.5" />
                            <span>{owner.status ? 'Desactivar' : 'Reactivar'}</span>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDeleteConfirmText('');
                              setDeleteTarget(owner);
                            }}
                            title="Eliminar propietario y toda su información permanentemente"
                            className="text-red-600 border-red-200 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Eliminar</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OwnerEditDialog
        ownerId={editingOwnerId}
        onClose={() => setEditingOwnerId(null)}
        onSaved={() => void fetchOwners(searchQuery, statusFilter)}
        onOpenFullCardTheme={onOpenCardThemeForOwner}
      />

      <PrintSheetDialog
        open={showPrintSheetDialog}
        availableOwners={eligibleOwners}
        initialSelectedIds={selectedIds}
        onClose={() => setShowPrintSheetDialog(false)}
        onGenerated={(msg) => {
          setFeedback(msg);
          setSelectedIds([]);
        }}
      />

      {/* Confirm Deactivate / Reactivate Dialog */}
      <Dialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => !open && setStatusTarget(null)}
      >
        <DialogContent className="max-w-md">
          {statusTarget && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {statusTarget.status
                    ? 'Desactivar propietario'
                    : 'Reactivar propietario'}
                </DialogTitle>
                <DialogDescription>
                  {statusTarget.status
                    ? `Al desactivar a ${statusTarget.fullName}, su ficha pública dejará de estar disponible y su token QR actual quedará revocado de forma permanente.`
                    : `Al reactivar a ${statusTarget.fullName}, se generará un token QR completamente nuevo. El código QR anterior seguirá siendo inválido.`}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStatusTarget(null)}
                  disabled={togglingStatus}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant={statusTarget.status ? 'destructive' : 'default'}
                  onClick={() => void handleConfirmToggleStatus()}
                  disabled={togglingStatus}
                >
                  {togglingStatus
                    ? 'Procesando...'
                    : statusTarget.status
                      ? 'Confirmar desactivación'
                      : 'Confirmar reactivación'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Permanent Delete Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deletingOwner) {
            setDeleteTarget(null);
            setDeleteConfirmText('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          {deleteTarget && (
            <form onSubmit={(e) => void handleConfirmDeleteOwner(e)} className="space-y-4">
              <DialogHeader>
                <div className="flex items-center gap-2.5 text-red-700">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <DialogTitle>Eliminar propietario permanentemente</DialogTitle>
                </div>
                <DialogDescription>
                  Estás a punto de eliminar por completo a{' '}
                  <strong className="text-slate-900">{deleteTarget.fullName}</strong> de la base de datos.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-900 space-y-1.5">
                <p className="font-semibold">Esta acción borrará de forma irreversible:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Su registro personal, ficha médica, contactos de emergencia y NSS.</li>
                  <li>
                    Su etiqueta QR y enlace público (el código QR impreso dejará de funcionar).
                  </li>
                  <li>
                    Sus documentos adjuntos ({deleteTarget.documentCount}) tanto de la base de datos como del almacenamiento.
                  </li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="delete-owner-confirm-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  Para habilitar la eliminación, escribe{' '}
                  <span className="font-mono font-bold text-slate-900">Confirmar</span> abajo:
                </label>
                <Input
                  id="delete-owner-confirm-input"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Confirmar"
                  autoComplete="off"
                  disabled={deletingOwner}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDeleteTarget(null);
                    setDeleteConfirmText('');
                  }}
                  disabled={deletingOwner}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={
                    deletingOwner ||
                    deleteConfirmText.trim().toLowerCase() !== 'confirmar'
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  <span>
                    {deletingOwner ? 'Eliminando...' : 'Eliminar definitivamente'}
                  </span>
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
