import React, { useId, useState } from 'react';
import { Globe, Lock, ShieldAlert } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Switch } from '@/src/components/ui/switch';

interface PublicDocVisibilityControlProps {
  documentName: string;
  isPublic: boolean;
  disabled?: boolean;
  onConfirmChange: (nextIsPublic: boolean) => void | Promise<void>;
}

export function PublicDocVisibilityControl({
  documentName,
  isPublic,
  disabled = false,
  onConfirmChange,
}: PublicDocVisibilityControlProps) {
  const switchId = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleToggle = (checked: boolean) => {
    if (disabled || confirming) return;
    if (checked) {
      setConfirmOpen(true);
      return;
    }
    void onConfirmChange(false);
  };

  const handleAcceptPublic = async () => {
    setConfirming(true);
    try {
      await onConfirmChange(true);
      setConfirmOpen(false);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 border border-slate-200/80">
        <label
          htmlFor={switchId}
          className="flex items-center gap-2.5 min-w-0 cursor-pointer select-none"
        >
          {isPublic ? (
            <Globe className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <Lock className="h-4 w-4 text-slate-400 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-800 leading-tight">
              Mostrar documento al público
            </p>
            <p
              className={`text-[11px] leading-tight mt-0.5 ${
                isPublic ? 'text-emerald-700 font-medium' : 'text-slate-500'
              }`}
            >
              {isPublic ? 'Visible al escanear el QR' : 'Oculto (solo uso interno)'}
            </p>
          </div>
        </label>

        <Switch
          id={switchId}
          checked={isPublic}
          disabled={disabled || confirming}
          onCheckedChange={handleToggle}
          aria-label={`Mostrar documento al público: ${documentName}`}
        />
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!confirming) setConfirmOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-10 w-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <DialogTitle className="text-base">
                ¿Mostrar documento al público?
              </DialogTitle>
            </div>
            <DialogDescription className="text-slate-600 leading-relaxed pt-1">
              Estás por hacer visible el archivo{' '}
              <span className="font-semibold text-slate-900">{documentName}</span> en la
              ficha pública.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-xs text-orange-950 leading-relaxed space-y-1.5">
            <p className="font-semibold">Advertencia de visibilidad pública</p>
            <p>
              Cualquier persona que escanee el código QR del casco podrá ver y abrir esta
              imagen sin iniciar sesión. Confirma únicamente si deseas exponer esta
              información al público.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={confirming}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleAcceptPublic()}
              disabled={confirming}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {confirming ? 'Activando...' : 'Sí, mostrar al público'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
