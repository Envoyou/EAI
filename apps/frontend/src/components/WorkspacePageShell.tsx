'use client';

import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { AppSidebarShell, WorkspacePage } from '@/components/AppSidebarShell';



type WorkspacePageShellProps = {
  title: string;
  description?: string;
  currentPage: WorkspacePage;
  sidebar: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
};



export function WorkspacePageShell({
  title,
  description,
  currentPage,
  sidebar,
  actions,
  footer,
  children,
}: WorkspacePageShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
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

  return (
    <div className="workspace-page-shell">
      <div className="workspace-page-body">
        <button
          type="button"
          className="workspace-page-sidebar-backdrop"
          data-open={sidebarOpen}
          aria-label="Close page navigation"
          onClick={() => setSidebarOpen(false)}
        />

        <AppSidebarShell
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((current) => !current)}
          currentPage={currentPage}
        >
          {/* MIDDLE SECTION CONTENT SPECIFIC TO THIS PAGE */}
          <div className={`transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
             <div className="mb-4 px-2 mt-2">
               <h1 className="text-xs font-bold tracking-tight">{title}</h1>
               {description ? <p className="text-[10px] text-[var(--muted-foreground)] mt-1">{description}</p> : null}
             </div>
             <div
               onClickCapture={(event) => {
                 if (
                   window.matchMedia('(max-width: 860px)').matches &&
                   (event.target as HTMLElement).closest('a')
                 ) {
                   setSidebarOpen(false);
                 }
               }}
             >
               {sidebar}
             </div>
          </div>
        </AppSidebarShell>


        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="ide-titlebar workspace-page-titlebar" role="banner">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                className="ui-btn ui-btn-muted ui-btn-icon h-7 w-7 workspace-page-sidebar-toggle shrink-0"
                aria-label="Toggle page navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-[var(--foreground)]">Workspace</span>
              <span className="text-[11px] text-[var(--muted-foreground)]">/</span>
              <span className="truncate text-[13px] font-medium text-[var(--muted-foreground)]">
                {title}
              </span>
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
