'use client';

import React from 'react';

export interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  label: string;
  className?: string;
  children: React.ReactNode;
}

export function SidebarNav({
  label,
  className = 'flex flex-col gap-1',
  children,
  ...props
}: SidebarNavProps) {
  return (
    <nav aria-label={label} className={className} {...props}>
      {children}
    </nav>
  );
}
