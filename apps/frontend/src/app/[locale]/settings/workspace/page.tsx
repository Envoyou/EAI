'use client';

import React, { useEffect } from 'react';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { Link, useRouter } from '@/i18n/routing';
import { SlidersHorizontal, CreditCard } from 'lucide-react';
import { useSettings } from '@/components/SettingsProvider';
import { SettingSection, SettingRow } from '@/components/SettingsUI';
import { PRICING_ENABLED } from '@eai/shared';
import { Button } from '@/components/ui/button';

export default function WorkspaceSettingsPage() {
  const { workspace, loadingWorkspace } = useSettings();
  const router = useRouter();

  useEffect(() => {
    if (!loadingWorkspace && workspace && !workspace.isAdmin) {
      router.replace('/settings/general');
    }
  }, [workspace, loadingWorkspace, router]);

  if (loadingWorkspace || !workspace || !workspace.isAdmin) {
    return (
      <div className="flex h-40 items-center justify-center">
        <EAILoaderStatusIcon className="h-6 w-6 text-[var(--muted-foreground)]" />
      </div>
    );
  }

  return (
    <>
      <div className="settings-page-intro">
        <span>Organization</span>
        <h2 className="text-balance">Manage your team and organization.</h2>
        <p className="text-pretty">
          Switch between organizations, manage team members, or update billing.
        </p>
      </div>

      <SettingSection
        id="workspace"
        title="Workspace"
        description="Organization access, publication standards, and plan information."
      >


        <SettingRow
          title="Publication settings"
          description="Brand identity, writing standards, categories, SEO rules, and CMS configuration."
        >
          <Button render={<Link href="/settings/publication/identity" />} variant="surface" size="sm" className="no-underline">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Open Publication Settings
          </Button>
        </SettingRow>

        <SettingRow
          title="Plan and credits"
          description="Review the current plan and available editorial credits."
        >
          {loadingWorkspace ? (
            <EAILoaderStatusIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
          ) : (
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums">
                {workspace?.plan.creditsRemaining ?? 0} credits
              </div>
              <div className="text-[11px] capitalize text-[var(--muted-foreground)]">
                {(workspace?.plan.activePlan ?? 'free').replace('org:', '')} plan
              </div>
            </div>
          )}
          {PRICING_ENABLED && (
            <Button render={<Link href="/settings/billing" />} variant="muted" size="sm" className="no-underline">
              <CreditCard className="h-3.5 w-3.5" />
              Manage Plan
            </Button>
          )}
        </SettingRow>
      </SettingSection>
    </>
  );
}
