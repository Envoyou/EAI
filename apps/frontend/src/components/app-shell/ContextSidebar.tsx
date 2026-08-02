'use client';

import React from 'react';

export interface ContextSidebarProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Presentational container for section-specific contextual sidebars (e.g. Dashboard navigation,
 * Settings navigation, or Document History). Explicitly receives its content from layout owners.
 */
export function ContextSidebar({
  children,
  className = '',
  style,
}: ContextSidebarProps) {
  if (!children) return null;

  return (
    <aside
      className={`workspace-page-sidebar-panel flex flex-col h-full shrink-0 select-none border-r border-[var(--sidebar-border)] ${className}`}
      data-open="true"
      style={{
        background: 'var(--sidebar)',
        ...style,
      }}
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 min-h-0">
        {children}
      </div>
    </aside>
  );
}
