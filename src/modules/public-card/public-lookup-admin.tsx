import React, { useEffect, useState } from 'react';
import { ExternalLink, QrCode } from 'lucide-react';
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
import { apiClient, type OwnerSummary } from '@/src/lib/api-client';
import { PublicCardPage } from './public-card-page';

interface PublicLookupAdminProps {
  initialToken?: string | null;
  onOpenStandalonePublic: (token: string) => void;
}

export function PublicLookupAdmin({
  initialToken,
  onOpenStandalonePublic,
}: PublicLookupAdminProps) {
  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [selectedToken, setSelectedToken] = useState<string>(initialToken || '');
  const [manualToken, setManualToken] = useState<string>(initialToken || '');

  useEffect(() => {
    if (initialToken) {
      setSelectedToken(initialToken);
      setManualToken(initialToken);
    }
  }, [initialToken]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listOwners()
      .then((res) => {
        if (cancelled) return;
        setOwners(res.owners);
        if (!initialToken && !selectedToken) {
          const firstActive = res.owners.find((o) => o.status && o.publicToken);
          if (firstActive?.publicToken) {
            setSelectedToken(firstActive.publicToken);
            setManualToken(firstActive.publicToken);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const activeOwners = owners.filter((o) => o.status && o.publicToken);

  const handleSelectOwner = (ownerId: string) => {
    const found = activeOwners.find((o) => o.id === ownerId);
    if (found?.publicToken) {
      setSelectedToken(found.publicToken);
      setManualToken(found.publicToken);
    }
  };

  const handleConsultToken = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualToken.trim();
    if (!trimmed) return;
    // Allow pasting full URL or raw token
    const match = trimmed.match(/\/ficha\/([A-Za-z0-9_-]+)/);
    setSelectedToken(match ? match[1] : trimmed);
  };

  const selectedOwner = activeOwners.find((o) => o.publicToken === selectedToken);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Consulta de ficha pública
            </h2>
            <p className="text-sm text-slate-500">
              Visualiza exactamente lo que verá cualquier visitante al escanear un código QR.
            </p>
          </div>
          {selectedToken && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenStandalonePublic(selectedToken)}
            >
              <ExternalLink className="h-4 w-4" />
              <span>Abrir vista pública directa</span>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div className="space-y-1.5">
            <Label>Seleccionar propietario activo</Label>
            <Select value={selectedOwner?.id || ''} onValueChange={handleSelectOwner}>
              <SelectTrigger>
                <SelectValue placeholder="Elige un propietario activo" />
              </SelectTrigger>
              <SelectContent>
                {activeOwners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {owner.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <form onSubmit={handleConsultToken} className="space-y-1.5">
            <Label htmlFor="lookup-token">Consultar por token o URL pública</Label>
            <div className="flex gap-2">
              <Input
                id="lookup-token"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Pega un token para verificar validez"
                className="font-mono text-xs"
              />
              <Button type="submit" variant="secondary">
                <QrCode className="h-4 w-4" />
                <span>Consultar</span>
              </Button>
            </div>
          </form>
        </div>
      </div>

      {selectedToken ? (
        <div className="rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <PublicCardPage token={selectedToken} />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Selecciona un propietario activo o ingresa un token para previsualizar su ficha pública.
        </div>
      )}
    </div>
  );
}
