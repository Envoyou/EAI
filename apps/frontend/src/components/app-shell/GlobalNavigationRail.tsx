'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useUser, UserButton, OrganizationSwitcher } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { fetchWithTimeout } from '@/lib/fetch-utils';
import { storeThemePreference } from '@/lib/preferences';
import { EAILogo } from '@/components/EAILogo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SidebarSurface } from '@/components/ui/sidebar/SidebarSurface';
import { SidebarNav } from '@/components/ui/sidebar/SidebarNav';
import { SidebarSection } from '@/components/ui/sidebar/SidebarSection';
import { SidebarItem } from '@/components/ui/sidebar/SidebarItem';
import { MAIN_NAVIGATION } from './navigation/main-navigation';
import { isRouteActive } from './navigation/route-matching';
import {
  SidebarNavigationIcon,
  SettingsNavigationIcon,
  LightModeNavigationIcon,
  DarkModeNavigationIcon,
} from '@/components/ui/icons/navigation';

export interface GlobalNavigationRailProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  currentPage?: string;
  isDemoMode?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function GlobalNavigationRail({
  sidebarOpen,
  onToggleSidebar,
  currentPage,
  isDemoMode = false,
  className = '',
  style,
}: GlobalNavigationRailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const tNav = useTranslations('AppNavigation');

  const isHydrated = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const isDark = isHydrated && resolvedTheme === 'dark';

  const { user, isLoaded } = useUser();
  const [activePlan, setActivePlan] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !user || isDemoMode) return;

    let active = true;
    const fetchState = async () => {
      try {
        const res = await fetchWithTimeout('/api/workspace/state');
        if (res.ok) {
          const data = await res.json();
          if (active && data?.plan?.activePlan) {
            setActivePlan(data.plan.activePlan);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch workspace state in rail:', err);
      }
    };
    void fetchState();

    return () => {
      active = false;
    };
  }, [isLoaded, user, isDemoMode]);

  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    storeThemePreference(nextTheme);
    setTheme(nextTheme);
  };

  const handleDemoLock = (label: string) => {
    toast.error(`${label} is locked in Demo Mode`, {
      action: {
        label: 'Sign Up',
        onClick: () => router.push('/signup'),
      },
    });
  };

  const closeAfterMobileNavigation = () => {
    if (
      sidebarOpen &&
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 860px)').matches
    ) {
      onToggleSidebar();
    }
  };

  return (
    <SidebarSurface open={sidebarOpen} className={className} style={style}>
      {/* TOP BRAND HEADER */}
      <div className="shrink-0 flex flex-col px-3 py-3 gap-1">
        <Tooltip disabled={sidebarOpen}>
          <TooltipTrigger
            render={
              <Button
                type="button"
                onClick={onToggleSidebar}
                variant="ghost"
                className={`group flex items-center transition-all duration-300 border-none bg-transparent cursor-pointer overflow-hidden ${
                  sidebarOpen
                    ? 'justify-start !px-2.5 !py-2 mb-2 rounded-full hover:bg-[var(--surface-2)] text-left w-full'
                    : 'justify-center w-9 h-9 mb-2 rounded-full hover:bg-[var(--surface-2)] mx-auto'
                }`}
                aria-label={sidebarOpen ? tNav('collapseSidebar') : tNav('expandSidebar')}
              >
                <div className="size-8 flex items-center justify-center shrink-0 relative">
                  <EAILogo className="size-7 transition-opacity duration-200 group-hover:opacity-0" />
                  <SidebarNavigationIcon className="size-5 absolute inset-0 m-auto text-[var(--foreground)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                </div>
                <div
                  className={`flex flex-col justify-center min-w-0 overflow-hidden transition-all duration-300 ${
                    sidebarOpen ? 'opacity-100 max-w-[200px] ml-2.5' : 'opacity-0 max-w-0 ml-0'
                  }`}
                >
                  <span className="block text-[15px] font-bold tracking-tight text-[var(--foreground)] leading-none truncate">
                    Envoyou AI
                  </span>
                  <span className="block text-[9.5px] text-[var(--muted-foreground)] mt-1 font-medium tracking-wide uppercase truncate">
                    Editorial Intelligence
                  </span>
                </div>
              </Button>
            }
          />
          <TooltipContent side="right" className="text-xs">
            {tNav('expandSidebar')}
          </TooltipContent>
        </Tooltip>

        {isLoaded && user && sidebarOpen && !isDemoMode && (
          <div className="px-2 mb-2 mt-1 flex items-center gap-2 animate-in fade-in duration-200">
            <div className="flex-1 min-w-0">
              <OrganizationSwitcher
                hidePersonal={false}
                afterCreateOrganizationUrl="/workspace"
                afterLeaveOrganizationUrl="/workspace"
                afterSelectOrganizationUrl="/workspace"
                afterSelectPersonalUrl="/workspace"
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    organizationSwitcherTrigger:
                      'w-full justify-between bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)] border border-[var(--border)] rounded-full px-3 py-1.5 text-xs font-semibold shadow-none',
                  },
                }}
              />
            </div>
            {activePlan && (
              <Badge
                variant={
                  activePlan.replace('org:', '').startsWith('team')
                    ? 'success'
                    : activePlan.replace('org:', '').startsWith('starter') ||
                      activePlan.replace('org:', '').startsWith('pro')
                    ? 'primary'
                    : 'muted'
                }
                size="xs"
                className="shrink-0 uppercase tracking-wider font-extrabold"
              >
                {activePlan.replace('org:', '').replace('_yearly', '')}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* MAIN NAVIGATION LIST */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-1 min-h-0">
        <SidebarNav label={tNav('mainNavigation')}>
          <SidebarSection label={tNav('create')} sidebarOpen={sidebarOpen} />
          {MAIN_NAVIGATION.slice(0, 4).map((item) => {
            const isActive = currentPage === item.id || isRouteActive(pathname, item.href, item.match);
            return (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={tNav(item.labelKey)}
                sidebarOpen={sidebarOpen}
                href={isDemoMode && item.id !== 'editor' ? undefined : item.href}
                onClick={
                  isDemoMode && item.id !== 'editor'
                    ? () => handleDemoLock(tNav(item.labelKey))
                    : closeAfterMobileNavigation
                }
                isActive={isActive}
                disabled={isDemoMode && item.id !== 'editor'}
              />
            );
          })}

          <SidebarSection label={tNav('manage')} sidebarOpen={sidebarOpen} />
          {MAIN_NAVIGATION.slice(4).map((item) => {
            const isActive = currentPage === item.id || isRouteActive(pathname, item.href, item.match);
            return (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={tNav(item.labelKey)}
                sidebarOpen={sidebarOpen}
                href={isDemoMode ? undefined : item.href}
                onClick={
                  isDemoMode
                    ? () => handleDemoLock(tNav(item.labelKey))
                    : closeAfterMobileNavigation
                }
                isActive={isActive}
                disabled={isDemoMode}
              />
            );
          })}
        </SidebarNav>
      </div>

      {/* BOTTOM UTILITIES & USER PROFILE */}
      <div className="shrink-0 flex flex-col px-3 py-3 max-sm:pb-20 gap-1">
        <SidebarItem
          icon={SettingsNavigationIcon}
          label={tNav('settings')}
          sidebarOpen={sidebarOpen}
          href={isDemoMode ? undefined : '/settings'}
          onClick={
            isDemoMode
              ? () => handleDemoLock(tNav('settings'))
              : closeAfterMobileNavigation
          }
          isActive={currentPage === 'settings' || isRouteActive(pathname, '/settings', 'section')}
          disabled={isDemoMode}
        />

        <SidebarItem
          icon={isDark ? LightModeNavigationIcon : DarkModeNavigationIcon}
          label={isDark ? tNav('lightMode') : tNav('darkMode')}
          sidebarOpen={sidebarOpen}
          onClick={toggleTheme}
        />

        {/* User Profile */}
        <div
          className={`flex items-center mt-1 min-h-[44px] transition-all duration-300 overflow-hidden ${
            sidebarOpen
              ? '!px-2.5 !py-2 w-full rounded-full'
              : 'justify-center w-9 h-9 mx-auto rounded-full'
          } ${!user && isLoaded ? 'cursor-pointer hover:bg-[var(--surface-2)]' : ''}`}
          onClick={() => {
            if (isLoaded && !user) router.push('/login');
          }}
        >
          <div className="w-7 h-7 flex items-center justify-center shrink-0">
            {isLoaded ? (
              user ? (
                <UserButton
                  appearance={{
                    elements: {
                      userButtonAvatarBox: 'w-7 h-7',
                    },
                  }}
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[var(--surface-3)] flex items-center justify-center">
                  <span className="text-[10px] font-medium">?</span>
                </div>
              )
            ) : (
              <Skeleton className="w-7 h-7 rounded-full" />
            )}
          </div>

          <div
            className={`flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${
              sidebarOpen ? 'opacity-100 max-w-[200px] ml-2.5' : 'opacity-0 max-w-0 ml-0'
            }`}
          >
            {isLoaded ? (
              user ? (
                <>
                  <span className="text-[13px] font-medium text-[var(--foreground)] truncate">
                    {user.fullName || user.username || 'User'}
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)] truncate">
                    {user.primaryEmailAddress?.emailAddress}
                  </span>
                </>
              ) : (
                <span className="text-[13px] font-medium text-[var(--muted-foreground)] truncate">
                  {tNav('signIn')}
                </span>
              )
            ) : (
              <Skeleton className="h-4 w-20 rounded" />
            )}
          </div>
        </div>
      </div>
    </SidebarSurface>
  );
}
