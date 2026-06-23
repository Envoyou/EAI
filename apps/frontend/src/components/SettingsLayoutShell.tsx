'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Check,
  CircleUserRound,
  FileText,
  Loader2,
  Workflow,
  Server,
  Activity,
  CreditCard,
  ShieldAlert,
  Settings,
} from 'lucide-react';
import { useUser } from '@clerk/nextjs';

import { WorkspacePageShell } from '@/components/WorkspacePageShell';
import { useSettings } from '@/components/SettingsProvider';
import { useSettingsAction } from '@/components/SettingsActionProvider';

type SettingsLayoutShellProps = {
  children: React.ReactNode;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

const SECTIONS = [
  { id: 'general_heading', label: 'My Preferences', heading: true },
  { id: 'account', href: '/settings/account', label: 'Account', icon: CircleUserRound },
  { id: 'general', href: '/settings/general', label: 'General', icon: Settings },
  { id: 'workflow', href: '/settings/workflow', label: 'Workflow', icon: Workflow },
  { id: 'defaults', href: '/settings/defaults', label: 'Article Defaults', icon: FileText },
  
  { id: 'organization', label: 'Organization', heading: true, requireAdmin: true },
  { id: 'workspace', href: '/settings/workspace', label: 'Workspace', icon: Building2, requireAdmin: true },
  { id: 'billing', href: '/settings/billing', label: 'Billing & Plans', icon: CreditCard, requireAdmin: true },
  { id: 'publication', href: '/settings/publication/identity', label: 'Publication Standards', icon: FileText, requireAdmin: true },

  { id: 'system', label: 'EAI System', heading: true, requireSuperAdmin: true },
  { id: 'system/tenants', href: '/settings/system/tenants', label: 'Tenants', icon: Server, requireSuperAdmin: true },
  { id: 'system/telemetry', href: '/settings/system/telemetry', label: 'Telemetry', icon: Activity, requireSuperAdmin: true },
  { id: 'system/feature-flags', href: '/settings/system/feature-flags', label: 'Feature Flags', icon: ShieldAlert, requireSuperAdmin: true },
];

export function SettingsLayoutShell({ children, isAdmin, isSuperAdmin }: SettingsLayoutShellProps) {
  const pathname = usePathname();
  const { isLoaded } = useUser();
  
  const { isMounted } = useSettings();
  const { isDirty, isSaving, triggerSave } = useSettingsAction();

  if (!isMounted || !isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <WorkspacePageShell
      title="Settings"
      description="Personal preferences and workspace controls"
      currentPage="settings"
      actions={
        <button
          type="button"
          onClick={triggerSave}
          disabled={!isDirty || isSaving}
          className="ui-btn ui-btn-primary ui-btn-sm"
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          <span>Save Changes</span>
        </button>
      }
      sidebar={
        <>


          <nav aria-label="Settings sections" className="settings-page-nav flex flex-col gap-1">
            {SECTIONS.map((section) => {
              if (section.requireAdmin && !isAdmin) return null;
              if (section.requireSuperAdmin && !isSuperAdmin) return null;

              if (section.heading) {
                return (
                  <div key={section.id} className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    {section.label}
                  </div>
                );
              }

              const Icon = section.icon;
              const isActive = pathname?.startsWith(section.href!);
              return (
                <Link
                  key={section.id}
                  href={section.href!}
                  data-active={isActive}
                  aria-current={isActive ? 'page' : undefined}
                  prefetch={false}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {section.label}
                </Link>
              );
            })}
          </nav>


        </>
      }
      footer={
        <div className="settings-page-status">
          {isDirty ? (
            <span>Unsaved changes</span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[var(--success)]" />
              Settings are up to date
            </span>
          )}
        </div>
      }
    >
      <main className="settings-page-content">
        {children}
      </main>
    </WorkspacePageShell>
  );
}
