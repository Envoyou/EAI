'use client';

import { fetchWithTimeout } from '@/lib/fetch-utils';

import React from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useUser, UserButton, OrganizationSwitcher } from '@clerk/nextjs';
import { FilePenLine, LayoutDashboard, Moon, PanelLeft, Settings, Sun } from 'lucide-react';
import { toast } from 'sonner';

import { EAILogo } from '@/components/EAILogo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { storeThemePreference } from '@/lib/preferences';
import { SidebarItem } from '@/components/ui/sidebar-item';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type WorkspacePage = 'editor' | 'dashboard' | 'publication' | 'settings';

export interface AppSidebarShellProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  currentPage?: WorkspacePage;
  isDemoMode?: boolean;
  children?: React.ReactNode; // The middle section content (e.g. History list, or Dashboard nav)
  className?: string;
  style?: React.CSSProperties;
}

export function AppSidebarShell({
  sidebarOpen,
  onToggleSidebar,
  currentPage,
  isDemoMode = false,
  children,
  className = '',
  style,
}: AppSidebarShellProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const isDark = resolvedTheme === 'dark';

  const { user, isLoaded } = useUser();

  const [activePlan, setActivePlan] = React.useState<string | null>(null);

  React.useEffect(() => {
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
        console.warn('Failed to fetch workspace state in sidebar:', err);
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

  return (
    <aside
      className={`workspace-page-sidebar-panel flex flex-col h-full border-none shadow-none ${className}`}
      data-open={sidebarOpen}
      style={style}
    >
      {/* TOP SECTION */}
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
                aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                <div className="w-7 h-7 flex items-center justify-center shrink-0 relative">
                  <EAILogo className="w-7 h-7 transition-opacity duration-200 group-hover:opacity-0" />
                  <PanelLeft className="w-5 h-5 absolute inset-0 m-auto text-[var(--foreground)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
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
            Expand sidebar
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
                    organizationSwitcherTrigger: 'w-full justify-between bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)] border border-[var(--border)] rounded-full px-3 py-1.5 text-xs font-semibold shadow-none',
                  }
                }}
              />
            </div>
            {activePlan && (
              <Badge
                variant={
                  activePlan.replace('org:', '').startsWith('team')
                    ? 'success'
                    : activePlan.replace('org:', '').startsWith('starter') || activePlan.replace('org:', '').startsWith('pro')
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

        <SidebarItem
          icon={FilePenLine}
          label="Editor"
          sidebarOpen={sidebarOpen}
          href="/"
          isActive={currentPage === 'editor'}
        />

        <SidebarItem
          icon={LayoutDashboard}
          label="Dashboard"
          sidebarOpen={sidebarOpen}
          href={isDemoMode ? undefined : "/dashboard"}
          onClick={isDemoMode ? () => handleDemoLock('Dashboard') : undefined}
          isActive={currentPage === 'dashboard'}
          disabled={isDemoMode}
        />
      </div>

      {/* MIDDLE SECTION */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 border-none min-h-0">
        {children}
      </div>

      {/* BOTTOM SECTION */}
      <div className="shrink-0 flex flex-col px-3 py-3 max-sm:pb-20 gap-1">
        <SidebarItem
          icon={Settings}
          label="Settings"
          sidebarOpen={sidebarOpen}
          href={isDemoMode ? undefined : "/settings"}
          onClick={isDemoMode ? () => handleDemoLock('Settings') : undefined}
          isActive={currentPage === 'settings'}
          disabled={isDemoMode}
        />

        <SidebarItem
          icon={isDark ? Sun : Moon}
          label={isDark ? 'Light Mode' : 'Dark Mode'}
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
                  Sign In
                </span>
              )
            ) : (
              <Skeleton className="h-4 w-20 rounded" />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
