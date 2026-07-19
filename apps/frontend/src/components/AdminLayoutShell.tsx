'use client';

import React, { useEffect, useState } from 'react';
import { Link } from '@/i18n/routing';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useUser, UserButton } from '@clerk/nextjs';
import {
  Menu,
  Server,
  Activity,
  ShieldAlert,
  Users,
  Moon,
  Sun,
  ArrowLeft,
  Loader2,
  Cpu,
  Scroll,
} from 'lucide-react';
import { EAILogo } from '@/components/EAILogo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { storeThemePreference } from '@/lib/preferences';

type AdminLayoutShellProps = {
  children: React.ReactNode;
};

const ADMIN_SECTIONS = [
  { id: 'tenants', href: '/admin/tenants', label: 'Tenants', icon: Server },
  { id: 'users', href: '/admin/users', label: 'User Directory', icon: Users },
  { id: 'ai-config', href: '/admin/ai-config', label: 'AI Engine', icon: Cpu },
  { id: 'telemetry', href: '/admin/telemetry', label: 'Telemetry', icon: Activity },
  { id: 'feature-flags', href: '/admin/feature-flags', label: 'Feature Flags', icon: ShieldAlert },
  { id: 'audit-logs', href: '/admin/audit-logs', label: 'Audit Logs', icon: Scroll },
];

export function AdminLayoutShell({ children }: AdminLayoutShellProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const { user, isLoaded } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [sidebarOpen]);

  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    storeThemePreference(nextTheme);
    setTheme(nextTheme);
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Get active section label for breadcrumbs
  const activeSection = ADMIN_SECTIONS.find((s) => pathname?.startsWith(s.href))?.label || 'Console';

  return (
    <div className="workspace-page-shell">
      <div className="workspace-page-body">
        {/* Backdrop for mobile */}
        <button
          type="button"
          className="workspace-page-sidebar-backdrop"
          data-open={sidebarOpen}
          aria-label="Close admin navigation"
          onClick={() => setSidebarOpen(false)}
        />

        {/* Sidebar */}
        <aside
          className="workspace-page-sidebar-panel flex flex-col h-full"
          data-open={sidebarOpen}
          style={{
            background: sidebarOpen ? 'var(--sidebar)' : 'var(--background)',
          }}
        >
          {/* Top Brand Header */}
          <div className="shrink-0 flex flex-col px-3 py-3 gap-1">
            <Tooltip disabled={sidebarOpen}>
              <TooltipTrigger
                render={
                  <button
                    onClick={() => setSidebarOpen((current) => !current)}
                    className={`flex items-center transition-all duration-300 border-none bg-transparent cursor-pointer overflow-hidden ${
                      sidebarOpen
                        ? 'px-2 py-2 mb-2 rounded-full hover:bg-[var(--surface-2)] text-left w-full'
                        : 'justify-center w-9 h-9 mb-2 rounded-full hover:bg-[var(--surface-2)] mx-auto'
                    }`}
                    aria-label="Toggle admin sidebar"
                  >
                    <EAILogo className="w-9 h-9 shrink-0" />
                    <div
                      className={`flex flex-col justify-center min-w-0 overflow-hidden transition-all duration-300 ${
                        sidebarOpen ? 'opacity-100 max-w-[200px] ml-2.5' : 'opacity-0 max-w-0 ml-0'
                      }`}
                    >
                      <span className="block text-[14px] font-bold tracking-tight text-[var(--foreground)] leading-none truncate">
                        EAI Admin Console
                      </span>
                      <span className="block text-[9px] text-[var(--warning)] mt-1 font-bold tracking-wide uppercase truncate">
                        Internal Control
                      </span>
                    </div>
                  </button>
                }
              />
              <TooltipContent side="right" className="text-xs">
                Expand sidebar
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 border-t border-b border-[var(--sidebar-border)] min-h-0">
            <nav aria-label="Admin console sections" className="settings-page-nav flex flex-col gap-1">
              <div className={`mt-2 mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ${sidebarOpen ? 'block' : 'hidden'}`}>
                Operational Tools
              </div>
              
              {ADMIN_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = pathname?.startsWith(section.href);
                
                return (
                  <Tooltip key={section.id} disabled={sidebarOpen}>
                    <TooltipTrigger
                      render={
                        <Link
                          href={section.href}
                          data-active={isActive}
                          aria-current={isActive ? 'page' : undefined}
                          prefetch={false}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                            isActive
                              ? 'bg-[var(--surface-3)] text-[var(--foreground)]'
                              : 'text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]'
                          } ${!sidebarOpen ? 'justify-center px-0' : ''}`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className={`${sidebarOpen ? 'block' : 'hidden'} truncate`}>{section.label}</span>
                        </Link>
                      }
                    />
                    <TooltipContent side="right" className="text-xs">
                      {section.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          </div>

          {/* Bottom Settings / Action Panel */}
          <div className="shrink-0 flex flex-col px-3 py-3 max-sm:pb-20 gap-1">
            {/* Theme Toggle */}
            <Tooltip disabled={sidebarOpen}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl text-xs font-semibold text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] transition-colors border-none bg-transparent cursor-pointer ${
                      !sidebarOpen ? 'justify-center px-0' : ''
                    }`}
                  >
                    {isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                    <span className={`${sidebarOpen ? 'block' : 'hidden'} truncate`}>
                      {isDark ? 'Light Mode' : 'Dark Mode'}
                    </span>
                  </button>
                }
              />
              <TooltipContent side="right" className="text-xs">
                {isDark ? 'Light Mode' : 'Dark Mode'}
              </TooltipContent>
            </Tooltip>

            {/* Back to App */}
            <Tooltip disabled={sidebarOpen}>
              <TooltipTrigger
                render={
                  <Link
                    href="/"
                    prefetch={false}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] transition-colors ${
                      !sidebarOpen ? 'justify-center px-0' : ''
                    }`}
                  >
                    <ArrowLeft className="h-4 w-4 shrink-0 text-[var(--warning)]" />
                    <span className={`${sidebarOpen ? 'block' : 'hidden'} truncate text-[var(--foreground)]`}>
                      Back to App
                    </span>
                  </Link>
                }
              />
              <TooltipContent side="right" className="text-xs">
                Back to App
              </TooltipContent>
            </Tooltip>

            {/* User Profile */}
            <div
              className={`flex items-center mt-2 min-h-[44px] border-t border-[var(--sidebar-border)] pt-2 transition-all duration-300 overflow-hidden ${
                sidebarOpen
                  ? 'px-2.5 w-full rounded-full'
                  : 'justify-center w-9 h-9 mx-auto rounded-full'
              }`}
            >
              {user ? (
                <div className={sidebarOpen ? '' : 'flex items-center justify-center w-full h-full'}>
                  <UserButton
                    appearance={{
                      elements: {
                        userButtonAvatarBox: 'w-7 h-7',
                      },
                    }}
                  />
                </div>
              ) : (
                <Skeleton className="w-7 h-7 rounded-full shrink-0" />
              )}

              <div
                className={`flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${
                  sidebarOpen ? 'opacity-100 max-w-[200px] ml-3' : 'opacity-0 max-w-0 ml-0'
                }`}
              >
                {user ? (
                  <>
                    <span className="text-[11px] font-bold text-[var(--foreground)] truncate leading-none">
                      {user.fullName || user.username || 'Admin'}
                    </span>
                    <span className="text-[9px] text-[var(--muted-foreground)] truncate mt-1">
                      {user.primaryEmailAddress?.emailAddress}
                    </span>
                  </>
                ) : (
                  <Skeleton className="h-4 w-20 rounded" />
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="ide-titlebar workspace-page-titlebar" role="banner">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                variant="muted"
                size="icon-xs"
                className="workspace-page-sidebar-toggle shrink-0"
                aria-label="Toggle page navigation"
              >
                <Menu className="h-4 w-4" />
              </Button>
              <span className="hidden sm:inline text-sm font-bold text-[var(--warning)]">EAI Admin Console</span>
              <span className="hidden sm:inline text-[11px] text-[var(--muted-foreground)]">/</span>
              <span className="truncate text-xs sm:text-[13px] font-semibold text-[var(--foreground)]">
                {activeSection}
              </span>
            </div>
          </header>

          <div className="workspace-page-main">
            <div className="workspace-page-scroll p-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
