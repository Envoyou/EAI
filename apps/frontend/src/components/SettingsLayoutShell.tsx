'use client';

import React from 'react';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { Check } from 'lucide-react';
import { useUser } from '@clerk/nextjs';

import { WorkspacePageShell } from '@/components/WorkspacePageShell';
import { useSettings } from '@/components/SettingsProvider';
import { useSettingsAction } from '@/components/SettingsActionProvider';
import { Button } from '@/components/ui/button';
import { SettingsNavigation } from '@/components/app-shell/navigation/SettingsNavigation';

type SettingsLayoutShellProps = {
  children: React.ReactNode;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

export function SettingsLayoutShell({ children, isAdmin, isSuperAdmin }: SettingsLayoutShellProps) {
  const { isLoaded } = useUser();
  const { isMounted } = useSettings();
  const { isDirty, isSaving, triggerSave } = useSettingsAction();

  if (!isMounted || !isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <EAILoaderStatusIcon className="h-6 w-6 text-primary" />
      </div>
    );
  }

  return (
    <WorkspacePageShell
      title="Settings"
      description="Personal preferences and workspace controls"
      currentPage="settings"
      actions={
        <Button
          type="button"
          onClick={triggerSave}
          disabled={!isDirty || isSaving}
          variant="primary"
          size="sm"
        >
          {isSaving ? <EAILoaderStatusIcon className="h-3.5 w-3.5" /> : null}
          <span>Save Changes</span>
        </Button>
      }
      sidebar={<SettingsNavigation isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} />}
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
