import React from 'react';

export interface SidebarSurfaceProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'app' | 'admin';
  open?: boolean;
  className?: string;
}

export function SidebarSurface({
  variant = 'app',
  open = true,
  className = '',
  children,
  style,
  ...props
}: SidebarSurfaceProps) {
  const isApp = variant === 'app';
  const baseClasses = isApp
    ? 'workspace-page-sidebar-panel flex flex-col h-full shrink-0 select-none'
    : 'workspace-page-sidebar-panel flex flex-col h-full shrink-0 select-none admin-sidebar-surface';

  const dynamicStyle: React.CSSProperties = {
    background: open
      ? 'var(--sidebar)'
      : 'var(--background)',
    ...style,
  };

  return (
    <aside
      className={`${baseClasses} ${className}`}
      data-open={open}
      style={dynamicStyle}
      {...props}
    >
      {children}
    </aside>
  );
}
