'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_SECTIONS } from './admin-navigation-config';
import { isRouteActive } from '@/components/app-shell/navigation/route-matching';
import { SidebarNav } from '@/components/ui/sidebar/SidebarNav';
import { SidebarSection } from '@/components/ui/sidebar/SidebarSection';

const labels: Record<string, string> = {
  tenants: 'Tenants',
  users: 'User Directory',
  'ai-config': 'AI Engine',
  telemetry: 'Telemetry',
  'feature-flags': 'Feature Flags',
  'audit-logs': 'Audit Logs',
};

export interface AdminNavigationProps {
  sidebarOpen?: boolean;
  onSelectLink?: () => void;
}

export function AdminNavigation({ sidebarOpen = true, onSelectLink }: AdminNavigationProps) {
  const pathname = usePathname();

  return (
    <SidebarNav label="Admin console sections" className="settings-page-nav flex flex-col gap-1">
      <SidebarSection label="Operational Tools" sidebarOpen={sidebarOpen} />
      {ADMIN_SECTIONS.map((section) => {
        const Icon = section.icon;
        const isActive = isRouteActive(pathname, section.href, section.match);
        const label = labels[section.id] || section.id;

        return (
          <Link
            key={section.id}
            href={section.href}
            onClick={onSelectLink}
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
            <span className={`${sidebarOpen ? 'block' : 'hidden'} truncate`}>{label}</span>
          </Link>
        );
      })}
    </SidebarNav>
  );
}
