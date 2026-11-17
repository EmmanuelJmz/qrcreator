import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Eye,
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
import { apiClient, ApiError, type OwnerSummary } from '@/src/lib/api-client';
import { OwnerCreateView } from './owner-create-view';
import { OwnerEditDialog } from './owner-edit-dialog';

interface OwnersModuleProps {
  onOpenEditorForOwner: (ownerId: string) => void;
  onOpenPublicCardForToken: (token: string) => void;
}

export function OwnersModule({
  onOpenEditorForOwner,
  onOpenPublicCardForToken,
}: OwnersModuleProps) {
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<OwnerSummary | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const fetchOwners = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listOwners(q);
      setOwners(res.owners);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar los propietarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'list') return;
    const handle = window.setTimeout(() => {
      void fetchOwners(searchQuery);
    }, 180);
    return () => window.clearTimeout(handle);
  }, [searchQuery, mode, fetchOwners]);

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
      await fetchOwners(searchQuery);
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
          void fetchOwners(searchQuery);
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

      {/* Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative max-w-md">
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
            {searchQuery.trim()
              ? 'No se encontraron coincidencias'
              : 'Aún no hay propietarios registrados'}
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            {searchQuery.trim()
              ? 'Intenta con otro nombre, correo electrónico o número telefónico.'
              : 'Registra el primer propietario y configura su etiqueta QR en el mismo flujo.'}
          </p>
          {!searchQuery.trim() && (
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
        onSaved={() => void fetchOwners(searchQuery)}
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
