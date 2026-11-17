import React, { useState } from 'react';
import { AlertTriangle, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { apiClient, ApiError, type AdminUser, type AuthConfig } from '@/src/lib/api-client';

interface LoginPageProps {
  authConfig: AuthConfig;
  onSuccess: (admin: AdminUser) => void;
}

export function LoginPage({ authConfig, onSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hasPendingConfig =
    !authConfig.authConfigured || !authConfig.dbConfigured || !authConfig.storageConfigured;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiClient.login(username.trim(), password);
      onSuccess(res.admin);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo iniciar sesión. Verifica tus credenciales.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">CascoQR</h1>
            <p className="text-sm text-slate-500">Acceso administrativo</p>
          </div>
        </div>

        {hasPendingConfig && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-1.5"
          >
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>Variables de entorno pendientes</span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              Configura en el servidor las credenciales correspondientes antes de ingresar:
            </p>
            <ul className="font-mono text-[11px] text-amber-900 space-y-0.5 pl-1">
              {!authConfig.dbConfigured && <li>· DATABASE_URL (cascoqr_admin_app)</li>}
              {!authConfig.authConfigured && (
                <li>· ADMIN_USERNAME y ADMIN_PASSWORD / ADMIN_PASSWORD_HASH</li>
              )}
              {!authConfig.storageConfigured && (
                <li>· R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY (Cloudflare R2)</li>
              )}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-username">Usuario</Label>
            <Input
              id="admin-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              disabled={!authConfig.authConfigured || loading}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Contraseña</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={!authConfig.authConfigured || loading}
              required
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={!authConfig.authConfigured || loading}
          >
            <Lock className="h-4 w-4" />
            <span>{loading ? 'Verificando...' : 'Ingresar al panel'}</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
