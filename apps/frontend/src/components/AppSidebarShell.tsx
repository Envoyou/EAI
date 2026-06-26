'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useUser, UserButton } from '@clerk/nextjs';
import { FilePenLine, LayoutDashboard, Moon, Settings, Sun } from 'lucide-react';
import { toast } from 'sonner';

import { EAILogo } from '@/components/EAILogo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { storeThemePreference } from '@/lib/preferences';
import { SidebarItem } from '@/components/ui/sidebar-item';

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
      className={`workspace-page-sidebar-panel flex flex-col h-full ${className}`}
      data-open={sidebarOpen}
      style={{
        background: sidebarOpen ? 'var(--sidebar)' : 'var(--background)',
        ...style,
      }}
    >
      {/* TOP SECTION */}
      <div className="shrink-0 flex flex-col px-3 py-3 gap-1">
        <Tooltip disabled={sidebarOpen}>
          <TooltipTrigger
            render={
              <button
                onClick={onToggleSidebar}
                className={`flex items-center transition-colors border-none bg-transparent cursor-pointer overflow-hidden ${
                  sidebarOpen
                    ? 'gap-2.5 px-2 py-2 mb-2 rounded-full hover:bg-[var(--surface-2)] text-left w-full'
                    : 'justify-center w-9 h-9 mb-2 rounded-full hover:bg-[var(--surface-2)] mx-auto'
                }`}
                aria-label="Toggle sidebar"
              >
                <EAILogo className="w-6 h-6 shrink-0" />
                <div
                  className={`flex flex-col justify-center min-w-0 transition-opacity duration-200 ${
                    sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'
                  }`}
                >
                  <span className="block text-[15px] font-bold tracking-tight text-[var(--foreground)] leading-none truncate">
                    EAI
                  </span>
                  <span className="block text-[9.5px] text-[var(--muted-foreground)] mt-1 font-medium tracking-wide uppercase truncate">
                    Editorial Intelligence
                  </span>
                </div>
              </button>
            }
          />
          <TooltipContent side="right" className="text-xs">
            Expand sidebar
          </TooltipContent>
        </Tooltip>

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
      <div className="flex-1 overflow-y-auto px-3 py-2 border-t border-b border-[var(--sidebar-border)] min-h-0">
        {children}
      </div>

      {/* BOTTOM SECTION */}
      <div className="shrink-0 flex flex-col px-3 py-3 gap-1">
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
          className={`flex items-center mt-1 min-h-[44px] transition-colors ${
            sidebarOpen
              ? 'gap-3 px-2.5 py-2 w-full rounded-full'
              : 'justify-center w-9 h-9 mx-auto rounded-full'
          } ${!user && isLoaded ? 'cursor-pointer hover:bg-[var(--surface-2)]' : ''}`}
          onClick={() => {
            if (isLoaded && !user) router.push('/login');
          }}
        >
          {isLoaded ? (
            user ? (
              <div className={sidebarOpen ? '' : 'flex items-center justify-center w-full h-full'}>
                <UserButton
                  appearance={{
                    elements: {
                      userButtonAvatarBox: 'w-7 h-7',
                    },
                  }}
                />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-[var(--surface-3)] flex items-center justify-center shrink-0">
                <span className="text-[10px] font-medium">?</span>
              </div>
            )
          ) : (
            <div className="w-7 h-7 rounded-full bg-[var(--surface-3)] animate-pulse shrink-0" />
          )}

          <div
            className={`flex flex-col min-w-0 transition-opacity duration-200 ${
              sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'
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
              <div className="h-4 w-20 bg-[var(--surface-3)] animate-pulse rounded" />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
