'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DASHBOARD_SECTIONS, DASHBOARD_SUPERADMIN_SECTIONS } from './dashboard-navigation';
import { isRouteActive } from './route-matching';
import { SidebarNav } from '@/components/ui/sidebar/SidebarNav';
import { SidebarSection } from '@/components/ui/sidebar/SidebarSection';

export interface DashboardNavigationProps {
  isSuperAdmin?: boolean;
}

export function DashboardNavigation({ isSuperAdmin }: DashboardNavigationProps) {
  const pathname = usePathname();
  const tDashboard = useTranslations('DashboardNavigation');
  const tContentMap = useTranslations('ContentMap');

  return (
    <SidebarNav label={tDashboard('sections')} className="settings-page-nav flex flex-col gap-1">
      {DASHBOARD_SECTIONS.map((section) => {
        const Icon = section.icon;
        const isActive = isRouteActive(pathname, section.href, section.match);
        const label = section.id === 'content-map' ? tContentMap('nav') : tDashboard(section.labelKey);

        return (
          <Link
            key={section.id}
            href={section.href}
            data-active={isActive}
            aria-current={isActive ? 'page' : undefined}
            prefetch={false}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Link>
        );
      })}

      {isSuperAdmin && (
        <>
          <SidebarSection label={tDashboard('internal')} />
          {DASHBOARD_SUPERADMIN_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = isRouteActive(pathname, section.href, section.match);

            return (
              <Link
                key={section.id}
                href={section.href}
                data-active={isActive}
                aria-current={isActive ? 'page' : undefined}
                prefetch={false}
              >
                <Icon className="h-4 w-4" />
                <span>{tDashboard(section.labelKey)}</span>
              </Link>
            );
          })}
        </>
      )}
    </SidebarNav>
  );
}
