import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AdminLayout, type AdminModule } from '@/src/components/admin-layout';
import { apiClient, type AdminUser, type AuthConfig } from '@/src/lib/api-client';
import { LoginPage } from '@/src/modules/auth/login-page';
import { LabelEditorModule } from '@/src/modules/label-editor/label-editor-module';
import { OwnersModule } from '@/src/modules/owners/owners-module';
import { PublicCardPage } from '@/src/modules/public-card/public-card-page';
import { PublicLookupAdmin } from '@/src/modules/public-card/public-lookup-admin';
import { TemplatesModule } from '@/src/modules/templates/templates-module';

const MODULE_LABELS: Record<AdminModule, string> = {
  owners: 'Propietarios',
  templates: 'Plantillas',
  editor: 'Editor de etiquetas QR',
  public: 'Ficha pública',
};

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
  const [navStack, setNavStack] = useState<AdminModule[]>(['owners']);
  const navStackRef = useRef<AdminModule[]>(['owners']);
  const pushedDepthRef = useRef(0);
  const ignoreNextPopRef = useRef(false);
  const [editorOwnerId, setEditorOwnerId] = useState<string | null>(null);
  const [lookupToken, setLookupToken] = useState<string | null>(null);

  const activeModule = navStack[navStack.length - 1] ?? 'owners';

  useEffect(() => {
    navStackRef.current = navStack;
  }, [navStack]);

  useEffect(() => {
    if (!standalonePublicToken && !window.history.state?.cascoqrAdmin) {
      window.history.replaceState(
        { cascoqrAdmin: true, stack: ['owners'], depth: 0 },
        '',
      );
    }
  }, [standalonePublicToken]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      setStandalonePublicToken(extractPublicTokenFromLocation());

      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        return;
      }

      const state = event.state as
        | { cascoqrAdmin?: boolean; stack?: AdminModule[]; depth?: number }
        | null;
      if (state?.cascoqrAdmin && Array.isArray(state.stack) && state.stack.length > 0) {
        pushedDepthRef.current = typeof state.depth === 'number' ? state.depth : 0;
        setNavStack(state.stack);
      } else if (!extractPublicTokenFromLocation() && navStackRef.current.length > 1) {
        pushedDepthRef.current = Math.max(0, pushedDepthRef.current - 1);
        setNavStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
      }
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

  const navigateToModule = useCallback((nextModule: AdminModule) => {
    const currentStack = navStackRef.current;
    const current = currentStack[currentStack.length - 1] ?? 'owners';
    if (nextModule === current) return;

    const nextStack = [...currentStack.slice(-19), nextModule];
    pushedDepthRef.current += 1;
    setNavStack(nextStack);
    window.history.pushState(
      { cascoqrAdmin: true, stack: nextStack, depth: pushedDepthRef.current },
      '',
    );
  }, []);

  const handleGoBack = useCallback(() => {
    const currentStack = navStackRef.current;
    if (currentStack.length > 1) {
      setNavStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
      if (pushedDepthRef.current > 0) {
        pushedDepthRef.current -= 1;
        ignoreNextPopRef.current = true;
        window.history.back();
        window.setTimeout(() => {
          ignoreNextPopRef.current = false;
        }, 120);
      }
      return;
    }

    if (activeModule !== 'owners') {
      setNavStack(['owners']);
    }
  }, [activeModule]);

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
      setNavStack(['owners']);
      setAdmin(null);
    }
  };

  const handleOpenEditorForOwner = (ownerId: string) => {
    setEditorOwnerId(ownerId);
    navigateToModule('editor');
  };

  const handleOpenPublicCardForToken = (token: string) => {
    setLookupToken(token);
    navigateToModule('public');
  };

  const handleNavigateStandalonePublic = (token: string) => {
    const targetUrl = `/ficha/${encodeURIComponent(token)}`;
    window.history.pushState({}, '', targetUrl);
    setStandalonePublicToken(token);
  };

  const canGoBack = navStack.length > 1 || activeModule !== 'owners';
  const previousModule =
    navStack.length > 1 ? navStack[navStack.length - 2] : activeModule !== 'owners' ? 'owners' : undefined;

  return (
    <AdminLayout
      activeModule={activeModule}
      onSelectModule={navigateToModule}
      canGoBack={canGoBack}
      previousModuleLabel={previousModule ? MODULE_LABELS[previousModule] : undefined}
      onGoBack={handleGoBack}
      admin={admin}
      onLogout={() => void handleLogout()}
    >
      {activeModule === 'owners' && (
        <OwnersModule
          onOpenEditorForOwner={handleOpenEditorForOwner}
          onOpenPublicCardForToken={handleOpenPublicCardForToken}
          onOpenTemplates={() => navigateToModule('templates')}
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
