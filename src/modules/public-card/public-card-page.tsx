import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { PublicCardView } from '@/src/components/public-card-renderer';
import { apiClient, type PublicCardData } from '@/src/lib/api-client';
import {
  DEFAULT_PUBLIC_CARD_THEME,
  normalizePublicCardTheme,
  type PublicCardTheme,
} from '@/src/lib/public-card-theme';

interface PublicCardPageProps {
  token: string;
}

export function PublicCardPage({ token }: PublicCardPageProps) {
  const [card, setCard] = useState<PublicCardData | null>(null);
  const [theme, setTheme] = useState<PublicCardTheme>(DEFAULT_PUBLIC_CARD_THEME);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadCard() {
      setLoading(true);
      setUnavailable(false);
      try {
        const res = await apiClient.getPublicCard(token);
        if (!cancelled) {
          setCard(res.card);
          setTheme(
            res.theme
              ? normalizePublicCardTheme(res.theme)
              : DEFAULT_PUBLIC_CARD_THEME,
          );
          setLogoUrl(res.logoUrl ?? null);
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
        <div className="h-36 sm:h-44 bg-slate-200 animate-pulse" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 space-y-4">
          <div className="h-10 w-64 mx-auto rounded-xl bg-slate-200 animate-pulse" />
          <div className="h-36 rounded-2xl bg-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (unavailable || !card) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="h-36 sm:h-44 bg-gradient-to-b from-slate-800 to-slate-900 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 flex items-center justify-between">
            <span className="font-bold tracking-tight text-lg whitespace-nowrap shrink-0">
              CascoQR
            </span>
            <span className="text-xs font-medium text-slate-200 whitespace-nowrap shrink-0">
              Ficha pública
            </span>
          </div>
        </header>

        <main className="max-w-md mx-auto px-4 pt-10 pb-12">
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

  return <PublicCardView card={card} theme={theme} logoUrl={logoUrl} token={token} />;
}
