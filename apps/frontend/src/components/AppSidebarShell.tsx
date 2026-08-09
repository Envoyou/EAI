'use client';

import React from 'react';
import { GlobalNavigationRail } from '@/components/app-shell/GlobalNavigationRail';
import { ContextSidebar } from '@/components/app-shell/ContextSidebar';

export type WorkspacePage = 'workspace' | 'articles' | 'editor' | 'review' | 'dashboard' | 'publication' | 'settings';

export interface AppSidebarShellProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  currentPage?: WorkspacePage;
  isDemoMode?: boolean;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * AppSidebarShell (Legacy Adapter)
 * Delegates rendering to GlobalNavigationRail and ContextSidebar.
 */
export function AppSidebarShell({
  sidebarOpen,
  onToggleSidebar,
  currentPage,
  isDemoMode = false,
  children,
  className = '',
  style,
}: AppSidebarShellProps) {
  return (
    <div className={`flex h-full min-w-0 shrink-0 ${className}`} style={style}>
      <GlobalNavigationRail
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar}
        currentPage={currentPage}
        isDemoMode={isDemoMode}
      />
      {children ? <ContextSidebar>{children}</ContextSidebar> : null}
    </div>
  );
}
