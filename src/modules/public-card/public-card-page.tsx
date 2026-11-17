import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  Mail,
  Phone,
  QrCode,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import {
  apiClient,
  type PublicCardData,
  type PublicCardDocument,
} from '@/src/lib/api-client';
import { formatDateShort } from '@/src/lib/utils';

interface PublicCardPageProps {
  token: string;
}

function CircularCascoLogo() {
  return (
    <div className="-mt-14 sm:-mt-16 mx-auto h-28 w-28 sm:h-32 sm:w-32 rounded-full bg-white ring-4 ring-white shadow-lg border border-orange-100 flex items-center justify-center relative z-10">
      <svg
        viewBox="0 0 64 64"
        className="h-16 w-16 sm:h-20 sm:w-20"
        role="img"
        aria-label="CascoQR"
      >
        <path
          d="M32 8C18.7 8 9 17.6 9 30.8c0 5.5 1.8 10.7 5.1 14.8 1.2 1.5 3.1 2.4 5.1 2.4h26.2c2.1 0 4-.9 5.3-2.6 2.8-3.6 4.3-8.2 4.3-13.2C55 18.2 45.2 8 32 8Z"
          fill="#0F172A"
        />
        <path
          d="M20 27.5c0-4.8 5.4-8.5 13.8-8.5 6.8 0 12.6 2.8 15.2 7.2.7 1.2-.1 2.8-1.5 2.8H21.6c-.9 0-1.6-.7-1.6-1.5Z"
          fill="#EA580C"
        />
        <rect x="20" y="34" width="24" height="5" rx="2.5" fill="#F8FAFC" />
        <circle cx="47.5" cy="40.5" r="4.5" fill="#EA580C" />
      </svg>
    </div>
  );
}

export function PublicCardPage({ token }: PublicCardPageProps) {
  const [card, setCard] = useState<PublicCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<PublicCardDocument | null>(null);
  const [showLabelImage, setShowLabelImage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadCard() {
      setLoading(true);
      setUnavailable(false);
      try {
        const res = await apiClient.getPublicCard(token);
        if (!cancelled) {
          setCard(res.card);
        }
      } catch {
        if (!cancelled) {
          setCard(null);
          setUnavailable(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadCard();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="h-36 sm:h-44 bg-gradient-to-b from-orange-500 to-orange-600" />
        <CircularCascoLogo />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 space-y-4">
          <div className="h-10 w-64 mx-auto rounded-xl bg-slate-200 animate-pulse" />
          <div className="h-36 rounded-2xl bg-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (unavailable || !card) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="h-36 sm:h-44 bg-gradient-to-b from-orange-500 to-orange-600 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 flex items-center justify-between">
            <span className="font-bold tracking-tight text-lg whitespace-nowrap shrink-0">
              CascoQR
            </span>
            <span className="text-xs font-medium text-orange-50 whitespace-nowrap shrink-0">
              Ficha pública
            </span>
          </div>
        </header>

        <CircularCascoLogo />

        <main className="max-w-md mx-auto px-4 pt-6 pb-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-xl font-bold text-slate-900">Ficha no disponible</h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Este código QR no corresponde a una ficha vigente en este momento.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Orange top brand banner */}
      <header className="h-36 sm:h-44 bg-gradient-to-b from-orange-500 to-orange-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 flex items-center justify-between gap-4">
          <span className="font-bold tracking-tight text-lg whitespace-nowrap shrink-0">
            CascoQR
          </span>
          <span className="text-xs font-medium text-orange-50 whitespace-nowrap shrink-0">
            Ficha de identificación
          </span>
        </div>
      </header>

      {/* Centered circular logo bridging header and data */}
      <CircularCascoLogo />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 pb-12 space-y-8">
        {/* Identity & contact data */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <p className="text-xs font-medium text-slate-500">Propietario del casco</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight">
              {card.fullName}
            </h1>
            <div className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-emerald-700 pt-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Etiqueta activa verificada</span>
            </div>
          </div>

          {(card.phone || card.email) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-5 border-t border-slate-100">
              {card.phone && (
                <a
                  href={`tel:${card.phone}`}
                  className="min-h-[52px] flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 hover:border-orange-300 hover:bg-orange-50/40 transition-colors"
                >
                  <Phone className="h-5 w-5 text-orange-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Teléfono de contacto</p>
                    <p className="text-sm font-semibold text-slate-900 font-mono tabular-nums truncate">
                      {card.phone}
                    </p>
                  </div>
                </a>
              )}

              {card.email && (
                <a
                  href={`mailto:${card.email}`}
                  className="min-h-[52px] flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 hover:border-orange-300 hover:bg-orange-50/40 transition-colors"
                >
                  <Mail className="h-5 w-5 text-orange-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Correo electrónico</p>
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {card.email}
                    </p>
                  </div>
                </a>
              )}
            </div>
          )}

          <div className="pt-1 flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowLabelImage((v) => !v)}
              className="min-h-[44px] inline-flex items-center gap-2 text-sm font-medium text-orange-700 hover:text-orange-800 cursor-pointer whitespace-nowrap"
            >
              <QrCode className="h-4 w-4 shrink-0" />
              <span>
                {showLabelImage ? 'Ocultar etiqueta QR asociada' : 'Ver etiqueta QR asociada'}
              </span>
            </button>

            {showLabelImage && (
              <div className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-4 flex justify-center">
                <img
                  src={`/api/v1/public/${encodeURIComponent(token)}/label-image`}
                  alt={`Etiqueta QR de ${card.fullName}`}
                  referrerPolicy="no-referrer"
                  className="max-h-72 w-auto object-contain rounded"
                />
              </div>
            )}
          </div>
        </section>

        {/* Authorized Public Documents */}
        <section className="space-y-4">
          <div className="space-y-1 px-1">
            <h2 className="text-lg font-semibold text-slate-900">Documentos autorizados</h2>
            <p className="text-sm text-slate-500">
              Documentación habilitada para consulta pública.
            </p>
          </div>

          {card.documents.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              No hay documentos públicos disponibles para este propietario.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {card.documents.map((doc) => {
                const docUrl = `/api/v1/public/${encodeURIComponent(token)}/documents/${doc.id}`;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setPreviewDoc(doc)}
                    className="group text-left rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-orange-400 transition-colors cursor-pointer"
                  >
                    <div className="h-44 bg-slate-100 border-b border-slate-200 p-3 flex items-center justify-center overflow-hidden">
                      <img
                        src={docUrl}
                        alt={doc.originalName}
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full object-contain group-hover:scale-[1.02] transition-transform"
                      />
                    </div>
                    <div className="p-3.5 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <FileImage className="h-4 w-4 text-orange-600 shrink-0" />
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {doc.originalName}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500 font-mono tabular-nums pl-6">
                        {doc.createdAt
                          ? formatDateShort(doc.createdAt)
                          : doc.mimeType === 'image/png'
                            ? 'Imagen PNG'
                            : 'Imagen JPG'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Dialog open={Boolean(previewDoc)} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-3xl">
          {previewDoc && (
            <>
              <DialogHeader>
                <DialogTitle>{previewDoc.originalName}</DialogTitle>
              </DialogHeader>
              <div className="rounded-lg border border-slate-200 bg-slate-100 p-3 flex items-center justify-center max-h-[75vh] overflow-auto">
                <img
                  src={`/api/v1/public/${encodeURIComponent(token)}/documents/${previewDoc.id}`}
                  alt={previewDoc.originalName}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[68vh] object-contain"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
