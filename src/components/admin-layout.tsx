import React from 'react';
import {
  Eye,
  FileImage,
  LogOut,
  Menu,
  QrCode,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import type { AdminUser } from '@/src/lib/api-client';

export type AdminModule = 'owners' | 'templates' | 'editor' | 'public';

interface AdminLayoutProps {
  activeModule: AdminModule;
  onSelectModule: (module: AdminModule) => void;
  admin: AdminUser;
  onLogout: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: AdminModule;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'owners', label: 'Propietarios', icon: Users },
  { id: 'templates', label: 'Plantillas', icon: FileImage },
  { id: 'editor', label: 'Editor de etiquetas QR', icon: QrCode },
  { id: 'public', label: 'Ficha pública', icon: Eye },
];

export function AdminLayout({
  activeModule,
  onSelectModule,
  admin,
  onLogout,
  children,
}: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const activeTitle =
    NAV_ITEMS.find((item) => item.id === activeModule)?.label || 'CascoQR';

  const handleNavClick = (mod: AdminModule) => {
    onSelectModule(mod);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="h-16 px-6 flex items-center gap-2.5 border-b border-slate-200">
          <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            CascoQR
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="px-2">
            <p className="text-xs text-slate-500">Administrador</p>
            <p className="text-sm font-medium text-slate-900 truncate">{admin.username}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="w-full justify-start"
          >
            <LogOut className="h-4 w-4 text-slate-500" />
            <span>Cerrar sesión</span>
          </Button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <span className="text-lg font-bold text-slate-900">CascoQR</span>
              </div>
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setMobileMenuOpen(false)}
                className="h-10 w-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200">
              <Button variant="outline" size="sm" onClick={onLogout} className="w-full">
                <LogOut className="h-4 w-4" />
                <span>Cerrar sesión</span>
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 px-4 sm:px-8 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Abrir navegación"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden h-10 w-10 flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold text-slate-900 truncate">
              {activeTitle}
            </h1>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500">
            <span>Panel administrativo</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-slate-700">{admin.username}</span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1360px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
