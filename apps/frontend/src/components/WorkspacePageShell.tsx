'use client';

import React from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { WorkspacePage } from '@/components/AppSidebarShell';

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
  return (
    <AppShell
      title={title}
      description={description}
      currentPage={currentPage}
      contextSidebar={sidebar}
      actions={actions}
      footer={footer}
    >
      {children}
    </AppShell>
  );
}
