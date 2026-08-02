'use client';

import React from 'react';

export interface SidebarSectionProps {
  label: string;
  sidebarOpen?: boolean;
  className?: string;
}

export function SidebarSection({
  label,
  sidebarOpen = true,
  className = '',
}: SidebarSectionProps) {
  if (!sidebarOpen) return null;

  return (
    <p
      className={`px-3 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)] select-none ${className}`}
    >
      {label}
    </p>
  );
}
