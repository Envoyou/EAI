'use client';

import React from 'react';
import DocumentHistoryPanel from './DocumentHistoryPanel';

export interface HistoryItem {
  id: string;
  createdAt: string;
  role: string;
  verdict?: string;
  summary?: string;
  metadata?: {
    title?: string;
    type?: string;
    category?: string;
    exportStatus?: {
      lastExportStatus?: 'success' | 'failed';
      lastExportedAt?: string;
    };
  };
}

interface HistorySidebarProps {
  onSelect: (id: string) => void;
  onNew: () => void;
  activeId?: string | null;
  refreshTrigger?: number;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  isDemoMode?: boolean;
  activePlan?: string;
}

export default function HistorySidebar(props: HistorySidebarProps) {
  return (
    <DocumentHistoryPanel
      onSelect={props.onSelect}
      onNew={props.onNew}
      activeId={props.activeId}
      refreshTrigger={props.refreshTrigger}
      sidebarOpen={props.sidebarOpen}
      onToggle={props.onToggleSidebar}
      isDemoMode={props.isDemoMode}
    />
  );
}
