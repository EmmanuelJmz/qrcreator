import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Eye,
  FileImage,
  Pencil,
  Plus,
  Power,
  QrCode,
  Search,
  Users,
} from 'lucide-react';
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
import { OwnerCreateView } from './owner-create-view';
import { OwnerEditDialog } from './owner-edit-dialog';

interface OwnersModuleProps {
  onOpenEditorForOwner: (ownerId: string) => void;
  onOpenPublicCardForToken: (token: string) => void;
  onOpenTemplates: () => void;
}

export function OwnersModule({
  onOpenEditorForOwner,
  onOpenPublicCardForToken,
  onOpenTemplates,
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

  const fetchOwners = useCallback(async (q: string, status: OwnerStatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listOwners(q, status);
      setOwners(res.owners);
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

        <Button onClick={() => setMode('create')}>
          <Plus className="h-4 w-4" />
          <span>Nuevo propietario</span>
        </Button>
      </div>

      {/* Resumen operativo */}
      {stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
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
                ? `${Math.round((stats.activeOwners / stats.totalOwners) * 100)}% del padrón`
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

      {/* Search & Status Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, apellidos, correo o teléfono..."
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
                  <th className="py-3 px-4">Nombre completo</th>
                  <th className="py-3 px-4">Correo electrónico</th>
                  <th className="py-3 px-4">Teléfono</th>
                  <th className="py-3 px-4 text-right">Documentos</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Etiqueta</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {owners.map((owner) => (
                  <tr key={owner.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {owner.fullName}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {owner.email || <span className="text-slate-400">No registrado</span>}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono tabular-nums whitespace-nowrap">
                      {owner.phone || <span className="text-slate-400 font-sans">No registrado</span>}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {owner.documentCount} / 5
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
                          <span>Ver ficha QR</span>
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
                              ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                              : ''
                          }
                        >
                          <Power className="h-3.5 w-3.5" />
                          <span>{owner.status ? 'Desactivar' : 'Reactivar'}</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OwnerEditDialog
        ownerId={editingOwnerId}
        onClose={() => setEditingOwnerId(null)}
        onSaved={() => void fetchOwners(searchQuery, statusFilter)}
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
    </div>
  );
}
