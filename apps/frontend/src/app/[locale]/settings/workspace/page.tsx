'use client';

import React from 'react';
import { Link } from '@/i18n/routing';
import { SlidersHorizontal, Loader2, CreditCard } from 'lucide-react';
import { useSettings } from '@/components/SettingsProvider';
import { SettingSection, SettingRow } from '@/components/SettingsUI';
import { PRICING_ENABLED } from '@eai/shared';

export default function WorkspaceSettingsPage() {
  const { workspace, loadingWorkspace } = useSettings();

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
          <Link href="/settings/publication/identity" className="ui-btn ui-btn-surface ui-btn-sm no-underline">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Open Publication Settings
          </Link>
        </SettingRow>

        <SettingRow
          title="Plan and credits"
          description="Review the current plan and available editorial credits."
        >
          {loadingWorkspace ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
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
            <Link href="/settings/billing" className="ui-btn ui-btn-muted ui-btn-sm no-underline">
              <CreditCard className="h-3.5 w-3.5" />
              Manage Plan
            </Link>
          )}
        </SettingRow>
      </SettingSection>
    </>
  );
}
