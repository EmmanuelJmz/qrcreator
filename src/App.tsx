import React, { useEffect, useState } from 'react';
import { AdminLayout, type AdminModule } from '@/src/components/admin-layout';
import { apiClient, type AdminUser, type AuthConfig } from '@/src/lib/api-client';
import { LoginPage } from '@/src/modules/auth/login-page';
import { LabelEditorModule } from '@/src/modules/label-editor/label-editor-module';
import { OwnersModule } from '@/src/modules/owners/owners-module';
import { PublicCardPage } from '@/src/modules/public-card/public-card-page';
import { PublicLookupAdmin } from '@/src/modules/public-card/public-lookup-admin';
import { TemplatesModule } from '@/src/modules/templates/templates-module';

function extractPublicTokenFromLocation(): string | null {
  const pathMatch = window.location.pathname.match(/^\/ficha\/([^/]+)$/);
  if (pathMatch && pathMatch[1]) {
    try {
      return decodeURIComponent(pathMatch[1]);
    } catch {
      return pathMatch[1];
    }
  }
  const params = new URLSearchParams(window.location.search);
  const queryToken = params.get('ficha');
  return queryToken ? queryToken.trim() : null;
}

export default function App() {
  const [standalonePublicToken, setStandalonePublicToken] = useState<string | null>(() =>
    extractPublicTokenFromLocation(),
  );
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig>({
    authConfigured: false,
    dbConfigured: false,
    storageConfigured: false,
  });
  const [checkingAuth, setCheckingAuth] = useState<boolean>(() => !standalonePublicToken);
  const [activeModule, setActiveModule] = useState<AdminModule>('owners');
  const [editorOwnerId, setEditorOwnerId] = useState<string | null>(null);
  const [lookupToken, setLookupToken] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => {
      setStandalonePublicToken(extractPublicTokenFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (standalonePublicToken) return;
    let cancelled = false;
    setCheckingAuth(true);

    async function bootstrapAuth() {
      try {
        const config = await apiClient.getAuthConfig();
        if (cancelled) return;
        setAuthConfig(config);

        if (!config.authConfigured) {
          setAdmin(null);
          return;
        }

        const res = await apiClient.getMe();
        if (!cancelled) {
          setAdmin(res.admin);
        }
      } catch {
        if (!cancelled) setAdmin(null);
      } finally {
        if (!cancelled) setCheckingAuth(false);
      }
    }

    void bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, [standalonePublicToken]);

  if (standalonePublicToken) {
    return <PublicCardPage token={standalonePublicToken} />;
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-64 h-10 rounded-lg bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (!admin) {
    return (
      <LoginPage
        authConfig={authConfig}
        onSuccess={(loggedAdmin) => setAdmin(loggedAdmin)}
      />
    );
  }

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } finally {
      setAdmin(null);
    }
  };

  const handleOpenEditorForOwner = (ownerId: string) => {
    setEditorOwnerId(ownerId);
    setActiveModule('editor');
  };

  const handleOpenPublicCardForToken = (token: string) => {
    setLookupToken(token);
    setActiveModule('public');
  };

  const handleNavigateStandalonePublic = (token: string) => {
    const targetUrl = `/ficha/${encodeURIComponent(token)}`;
    window.history.pushState({}, '', targetUrl);
    setStandalonePublicToken(token);
  };

  return (
    <AdminLayout
      activeModule={activeModule}
      onSelectModule={setActiveModule}
      admin={admin}
      onLogout={() => void handleLogout()}
    >
      {activeModule === 'owners' && (
        <OwnersModule
          onOpenEditorForOwner={handleOpenEditorForOwner}
          onOpenPublicCardForToken={handleOpenPublicCardForToken}
        />
      )}
      {activeModule === 'templates' && <TemplatesModule />}
      {activeModule === 'editor' && <LabelEditorModule initialOwnerId={editorOwnerId} />}
      {activeModule === 'public' && (
        <PublicLookupAdmin
          initialToken={lookupToken}
          onOpenStandalonePublic={handleNavigateStandalonePublic}
        />
      )}
    </AdminLayout>
  );
}
