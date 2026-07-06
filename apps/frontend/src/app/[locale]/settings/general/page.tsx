'use client';

import React from 'react';
import { Sun, Moon, Settings2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettings } from '@/components/SettingsProvider';
import { SettingSection, SettingRow } from '@/components/SettingsUI';
import { ThemeMode } from '@/lib/preferences';

export default function GeneralSettingsPage() {
  const { settings, updateSettings, updateTheme } = useSettings();

  return (
    <>
      <div className="settings-page-intro">
        <span>My Preferences</span>
        <h2 className="text-balance">Manage your personal identity and workspace look.</h2>
        <p className="text-pretty">
          These preferences apply to this browser and your personal account. Publication-wide standards remain managed
          separately so personal choices never override editorial policy.
        </p>
      </div>

      <SettingSection
        id="general"
        title="General"
        description="Your personal identity and how the workspace looks."
      >
        <SettingRow
          title="Display name"
          description="Used for local workspace labels when account details are unavailable."
        >
          <input
            type="text"
            name="display-name"
            autoComplete="name"
            aria-label="Display name"
            value={settings.profile.displayName}
            onChange={(event) => updateSettings({
              profile: { ...settings.profile, displayName: event.target.value },
            })}
            className="ui-control ui-input"
          />
        </SettingRow>

        <SettingRow
          title="Appearance"
          description="Choose a light, dark, or system-matched workspace."
        >
          <Select
            value={settings.themeMode}
            onValueChange={(val) => {
              if (val) updateTheme(val as ThemeMode);
            }}
          >
            <SelectTrigger className="ui-control ui-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">
                <div className="flex items-center gap-2">
                  <Sun className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>Light</span>
                </div>
              </SelectItem>
              <SelectItem value="dark">
                <div className="flex items-center gap-2">
                  <Moon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>Dark</span>
                </div>
              </SelectItem>
              <SelectItem value="system">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>System</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          title="Interface language"
          description="Additional interface languages can be enabled here later."
        >
          <Select value={settings.profile.language} disabled>
            <SelectTrigger className="ui-control ui-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="id">Indonesian</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingSection>
    </>
  );
}
