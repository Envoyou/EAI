'use client';

import React from 'react';
import { useClerk, useOrganization } from '@clerk/nextjs';
import { SettingSection, SettingRow } from '@/components/SettingsUI';
import { Button } from '@/components/ui/button';

export default function AccountSettingsPage() {
  const { openUserProfile, openOrganizationProfile, openCreateOrganization } = useClerk();
  const { organization } = useOrganization();

  return (
    <>
      <div className="settings-page-intro mb-8">
        <span>Preferences</span>
        <h2 className="text-balance">Manage your account and organization.</h2>
        <p className="text-pretty">
          Update your profile, security settings, or manage your organization and team members.
        </p>
      </div>

      <SettingSection id="preferences" title="Preferences" description="Your personal and team accounts.">
        <SettingRow
          title="User"
          description="Manage your login credentials, security settings, or delete your account."
        >
          <Button
            type="button"
            onClick={() => openUserProfile()}
            variant="surface"
            size="sm"
            className="font-medium"
          >
            Manage
          </Button>
        </SettingRow>

        <SettingRow
          title="Organization"
          description="Manage your organization settings and members."
        >
          <Button
            type="button"
            onClick={() => {
              if (organization) {
                openOrganizationProfile();
              } else {
                openCreateOrganization();
              }
            }}
            variant="surface"
            size="sm"
            className="font-medium"
          >
            {organization ? 'Manage' : 'Create'}
          </Button>
        </SettingRow>
      </SettingSection>
    </>
  );
}
