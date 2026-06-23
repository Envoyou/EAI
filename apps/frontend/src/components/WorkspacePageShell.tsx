'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  FilePenLine,
  LayoutDashboard,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import { UserButton, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

import { EAILogo } from '@/components/EAILogo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { storeThemePreference } from '@/lib/preferences';

type WorkspacePage = 'editor' | 'dashboard' | 'publication' | 'settings';

type WorkspacePageShellProps = {
  title: string;
  description?: string;
  currentPage: WorkspacePage;
  sidebar: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
};



export function WorkspacePageShell({
  title,
  description,
  currentPage,
  sidebar,
  actions,
  footer,
  children,
}: WorkspacePageShellProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isDark = resolvedTheme === 'dark';
  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    storeThemePreference(nextTheme);
    setTheme(nextTheme);
  };

  const { user, isLoaded } = useUser();


  useEffect(() => {
    if (!sidebarOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [sidebarOpen]);

  return (
    <div className="workspace-page-shell">
      <div className="workspace-page-body">
        <button
          type="button"
          className="workspace-page-sidebar-backdrop"
          data-open={sidebarOpen}
          aria-label="Close page navigation"
          onClick={() => setSidebarOpen(false)}
        />

        <aside className="workspace-page-sidebar-panel" data-open={sidebarOpen}>
          {/* TOP SECTION */}
          <div className="shrink-0 flex flex-col px-3 py-3 gap-1">
            <Tooltip disabled={sidebarOpen}>
              <TooltipTrigger render={
                <button
                  onClick={() => setSidebarOpen(current => !current)}
                  className={`flex items-center transition-colors border-none bg-transparent cursor-pointer overflow-hidden ${
                    sidebarOpen 
                      ? 'gap-2.5 px-2 py-2 mb-2 rounded-md hover:bg-[var(--surface-2)] text-left w-full' 
                      : 'justify-center w-9 h-9 mb-2 rounded-full hover:bg-[var(--surface-2)] mx-auto'
                  }`}
                  aria-label="Toggle sidebar"
                >
                  <EAILogo className="w-6 h-6 shrink-0" />
                  <div className={`flex flex-col justify-center min-w-0 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                    <span className="block text-[15px] font-bold tracking-tight text-[var(--foreground)] leading-none truncate">EAI</span>
                    <span className="block text-[9.5px] text-[var(--muted-foreground)] mt-1 font-medium tracking-wide uppercase truncate">Editorial Intelligence</span>
                  </div>
                </button>
              } />
              <TooltipContent side="right" className="text-xs">Expand sidebar</TooltipContent>
            </Tooltip>

            {/* Editor Link */}
            <Tooltip disabled={sidebarOpen}>
               <TooltipTrigger render={
                 <Link href="/" className={`flex items-center transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)] no-underline ${
                   sidebarOpen 
                     ? 'gap-3 px-2.5 py-2 rounded-md w-full' 
                     : 'justify-center w-9 h-9 rounded-full mx-auto'
                 } hover:bg-[var(--surface-2)] ${currentPage === 'editor' ? 'bg-[var(--sidebar-accent)] text-[var(--foreground)] font-medium' : ''}`}>
                   <FilePenLine className="w-[18px] h-[18px] shrink-0" />
                   <span className={`text-[13px] whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>Editor</span>
                 </Link>
               } />
               <TooltipContent side="right" className="text-xs">Editor</TooltipContent>
            </Tooltip>

            {/* Dashboard Link */}
            <Tooltip disabled={sidebarOpen}>
               <TooltipTrigger render={
                 <Link href="/dashboard" className={`flex items-center transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)] no-underline ${
                   sidebarOpen 
                     ? 'gap-3 px-2.5 py-2 rounded-md w-full' 
                     : 'justify-center w-9 h-9 rounded-full mx-auto'
                 } hover:bg-[var(--surface-2)] ${currentPage === 'dashboard' ? 'bg-[var(--sidebar-accent)] text-[var(--foreground)] font-medium' : ''}`}>
                   <LayoutDashboard className="w-[18px] h-[18px] shrink-0" />
                   <span className={`text-[13px] whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>Dashboard</span>
                 </Link>
               } />
               <TooltipContent side="right" className="text-xs">Dashboard</TooltipContent>
            </Tooltip>
          </div>

          {/* MIDDLE SECTION */}
          <div className="flex-1 overflow-y-auto px-3 py-2 border-t border-[var(--sidebar-border)]">
            <div className={`transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
               <div className="mb-4 px-2 mt-2">
                 <h1 className="text-xs font-bold tracking-tight">{title}</h1>
                 {description ? <p className="text-[10px] text-[var(--muted-foreground)] mt-1">{description}</p> : null}
               </div>
               <div
                 onClickCapture={(event) => {
                   if (
                     window.matchMedia('(max-width: 860px)').matches &&
                     (event.target as HTMLElement).closest('a')
                   ) {
                     setSidebarOpen(false);
                   }
                 }}
               >
                 {sidebar}
               </div>
            </div>
          </div>

          {/* BOTTOM SECTION */}
          <div className="shrink-0 flex flex-col px-3 py-3 gap-1 border-t border-[var(--sidebar-border)]">
            {/* Settings */}
            <Tooltip disabled={sidebarOpen}>
              <TooltipTrigger render={
                <Link href="/settings" className={`flex items-center transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)] no-underline ${
                  sidebarOpen 
                    ? 'gap-3 px-2.5 py-2 rounded-md w-full' 
                    : 'justify-center w-9 h-9 rounded-full mx-auto'
                } hover:bg-[var(--surface-2)] ${currentPage === 'settings' ? 'bg-[var(--sidebar-accent)] text-[var(--foreground)] font-medium' : ''}`}>
                  <Settings className="w-[18px] h-[18px] shrink-0" />
                  <span className={`text-[13px] whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>Settings</span>
                </Link>
              } />
              <TooltipContent side="right" className="text-xs">Settings</TooltipContent>
            </Tooltip>

            {/* Theme Toggle */}
            <Tooltip disabled={sidebarOpen}>
              <TooltipTrigger render={
                <button
                  onClick={toggleTheme}
                  className={`flex items-center transition-colors border-none bg-transparent cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)] ${
                    sidebarOpen 
                      ? 'gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--surface-2)] w-full' 
                      : 'justify-center w-9 h-9 rounded-full hover:bg-[var(--surface-2)] mx-auto'
                  }`}
                >
                  {isDark ? <Sun className="w-[18px] h-[18px] shrink-0" /> : <Moon className="w-[18px] h-[18px] shrink-0" />}
                  <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                    {isDark ? 'Light Mode' : 'Dark Mode'}
                  </span>
                </button>
              } />
              <TooltipContent side="right" className="text-xs">{isDark ? 'Light Mode' : 'Dark Mode'}</TooltipContent>
            </Tooltip>

            {/* User Profile */}
            <div 
              className={`flex items-center mt-1 min-h-[44px] transition-colors ${
                sidebarOpen ? 'gap-3 px-2.5 py-2 w-full rounded-md' : 'justify-center w-9 h-9 mx-auto rounded-full'
              } ${!user && isLoaded ? 'cursor-pointer hover:bg-[var(--surface-2)]' : ''}`}
              onClick={() => {
                if (isLoaded && !user) router.push('/login');
              }}
            >
              {isLoaded ? (
                <div className="shrink-0 flex items-center justify-center -ml-0.5">
                  {user ? (
                    <UserButton 
                      userProfileMode="navigation"
                      userProfileUrl="/settings/account"
                      appearance={{
                        elements: {
                          userButtonAvatarBox: "w-[26px] h-[26px]"
                        }
                      }} 
                    />
                  ) : (
                    <div className="w-[26px] h-[26px] rounded-full bg-[var(--surface-3)] flex items-center justify-center text-[10px] font-semibold text-[var(--foreground)]">
                      US
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-[26px] h-[26px] rounded-full bg-[var(--surface-2)] animate-pulse shrink-0 -ml-0.5" />
              )}
              
              <div className={`flex flex-col min-w-0 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                {user ? (
                  <div 
                    className="flex flex-col justify-center min-w-0 flex-1 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      const trigger = document.querySelector('.cl-userButtonTrigger') as HTMLButtonElement | null;
                      if (trigger) trigger.click();
                    }}
                  >
                    <span className="text-[13px] font-semibold text-[var(--foreground)] truncate leading-tight">
                      {user.firstName} {user.lastName}
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)] truncate mt-0.5">
                      {user.primaryEmailAddress?.emailAddress}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col justify-center min-w-0 flex-1">
                    <span className="text-[13px] font-semibold text-[var(--foreground)] truncate leading-tight">
                      Sign in
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)] truncate mt-0.5">
                      Click here to login
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="ide-titlebar workspace-page-titlebar" role="banner">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-sm font-semibold text-[var(--foreground)]">Workspace</span>
              <span className="text-[11px] text-[var(--muted-foreground)]">/</span>
              <span className="truncate text-[13px] font-medium text-[var(--muted-foreground)]">
                {title}
              </span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5">{actions}</div>
          </header>

          <div className="workspace-page-main">
            <div className="workspace-page-scroll">{children}</div>
            {footer ? <div className="workspace-page-footer">{footer}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
