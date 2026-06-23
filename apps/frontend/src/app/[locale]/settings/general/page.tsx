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
          <div className="ui-segmented">
            {[
              { value: 'light' as ThemeMode, label: 'Light', icon: Sun },
              { value: 'dark' as ThemeMode, label: 'Dark', icon: Moon },
              { value: 'system' as ThemeMode, label: 'System', icon: Settings2 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => updateTheme(item.value)}
                  data-active={settings.themeMode === item.value}
                  className="ui-segmented-item !px-3 !py-2 !text-xs"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
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
