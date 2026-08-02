'use client';

import React from 'react';
import { Link } from '@/i18n/routing';
import { usePathname } from 'next/navigation';
import { SETTINGS_SECTIONS } from './settings-navigation';
import { isRouteActive } from './route-matching';
import { SidebarNav } from '@/components/ui/sidebar/SidebarNav';
import { SidebarSection } from '@/components/ui/sidebar/SidebarSection';

export interface SettingsNavigationProps {
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}

export function SettingsNavigation({ isAdmin, isSuperAdmin }: SettingsNavigationProps) {
  const pathname = usePathname();

  return (
    <SidebarNav label="Settings sections" className="settings-page-nav flex flex-col gap-1">
      {SETTINGS_SECTIONS.map((section) => {
        if (section.requireAdmin && !isAdmin) return null;
        if (section.requireSuperAdmin && !isSuperAdmin) return null;

        if (section.heading) {
          return (
            <SidebarSection key={section.id} label={section.label} />
          );
        }

        const Icon = section.icon;
        const isActive = isRouteActive(pathname, section.href!, 'section');

        return (
          <Link
            key={section.id}
            href={section.href!}
            data-active={isActive}
            aria-current={isActive ? 'page' : undefined}
            prefetch={false}
          >
            {Icon && <Icon className="h-4 w-4" />}
            <span>{section.label}</span>
          </Link>
        );
      })}
    </SidebarNav>
  );
}
