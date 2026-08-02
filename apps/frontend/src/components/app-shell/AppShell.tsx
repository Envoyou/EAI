'use client';

import React, { useEffect, useState } from 'react';
import { OpenNavigationIcon } from '@/components/ui/icons/navigation';
import { GlobalNavigationRail } from './GlobalNavigationRail';
import { ContextSidebar } from './ContextSidebar';
import { SidebarDrawer } from '@/components/ui/sidebar/SidebarDrawer';
import { Button } from '@/components/ui/button';

export interface AppShellProps {
  title?: string;
  description?: string;
  currentPage?: string;
  isDemoMode?: boolean;
  contextSidebar?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  title,
  description,
  currentPage,
  isDemoMode = false,
  contextSidebar,
  actions,
  footer,
  children,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarOpen(false);
    }
  }, []);

  return (
    <div className="workspace-page-shell">
      <div className="workspace-page-body">
        {/* Mobile / Tablet Drawer Wraps Global Rail + Context Sidebar */}
        <SidebarDrawer
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          ariaLabel="Application navigation"
        >
          <GlobalNavigationRail
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((current) => !current)}
            currentPage={currentPage}
            isDemoMode={isDemoMode}
          />
          {contextSidebar ? (
            <ContextSidebar>
              {title && sidebarOpen && (
                <div className="mb-3 px-2 mt-1">
                  <h1 className="text-xs font-bold tracking-tight text-[var(--foreground)]">{title}</h1>
                  {description ? (
                    <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{description}</p>
                  ) : null}
                </div>
              )}
              {contextSidebar}
            </ContextSidebar>
          ) : null}
        </SidebarDrawer>

        {/* Main Application Area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="ide-titlebar workspace-page-titlebar" role="banner">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                variant="muted"
                size="icon-xs"
                className="workspace-page-sidebar-toggle shrink-0"
                aria-label="Toggle navigation"
              >
                <OpenNavigationIcon className="h-4 w-4" />
              </Button>
              <span className="hidden sm:inline text-sm font-semibold text-[var(--foreground)]">Workspace</span>
              {title && (
                <>
                  <span className="hidden sm:inline text-[11px] text-[var(--muted-foreground)]">/</span>
                  <span className="truncate text-xs sm:text-[13px] font-medium text-[var(--muted-foreground)] max-w-[120px] sm:max-w-none">
                    {title}
                  </span>
                </>
              )}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5">{actions}</div>
          </header>

          <div className="workspace-page-main">
            <div className="workspace-page-scroll">{children}</div>
            {footer ? <div className="workspace-page-footer">{footer}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
