'use client';

import React from 'react';
import { Languages } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettings } from '@/components/SettingsProvider';
import { SettingSection, SettingRow } from '@/components/SettingsUI';
import { AppSettings } from '@/lib/preferences';

export default function WorkflowSettingsPage() {
  const { settings, updateSettings } = useSettings();

  return (
    <>
      <div className="settings-page-intro">
        <span>My Preferences</span>
        <h2 className="text-balance">Control how your drafts are managed.</h2>
        <p className="text-pretty">
          Configure how the editor preserves your work and which language the AI uses to communicate with you.
        </p>
      </div>

      <SettingSection
        id="workflow"
        title="Workflow"
        description="Control how drafts are preserved and which language EAI produces."
      >
        <SettingRow
          title="Auto-save workspace"
          description="Keep draft text, metadata, and the latest review in this browser."
        >
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.autoSave}
              onChange={(event) => updateSettings({ autoSave: event.target.checked })}
            />
            <span aria-hidden="true" />
            <span className="sr-only">Auto-save workspace</span>
          </label>
        </SettingRow>

        <SettingRow
          title="Output language"
          description="Choose the language used for refined drafts and editorial feedback."
        >
          <Select
            value={settings.outputLanguage}
            onValueChange={(value) => updateSettings({
              outputLanguage: (value ?? 'follow_draft') as AppSettings['outputLanguage'],
            })}
          >
            <SelectTrigger className="ui-control ui-select">
              <Languages className="h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="follow_draft">Follow Draft</SelectItem>
              <SelectItem value="id">Indonesian</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingSection>
    </>
  );
}
