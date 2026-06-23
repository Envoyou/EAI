'use client';

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettings } from '@/components/SettingsProvider';
import { SettingSection, SettingRow } from '@/components/SettingsUI';

export default function DefaultsSettingsPage() {
  const { settings, updateSettings, workspace } = useSettings();

  const categoryOptions = workspace?.editorial.categories ?? [];
  const articleTypeOptions = workspace?.editorial.articleTypes ?? [];

  return (
    <>
      <div className="settings-page-intro">
        <span>My Preferences</span>
        <h2 className="text-balance">Article Defaults</h2>
        <p className="text-pretty">
          Pre-fill common article details whenever you start a new draft.
        </p>
      </div>

      <SettingSection
        id="defaults"
        title="Article Defaults"
        description="Pre-fill common article details whenever you start a new draft."
      >
        <SettingRow
          title="Default category"
          description="Applied only when the category exists in the active publication."
        >
          <Select
            value={settings.defaultMetadata.category || 'none'}
            onValueChange={(value) => updateSettings({
              defaultMetadata: {
                ...settings.defaultMetadata,
                category: !value || value === 'none' ? '' : value,
              },
            })}
          >
            <SelectTrigger className="ui-control ui-select">
              <SelectValue placeholder="No default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No default</SelectItem>
              {categoryOptions.map((category) => (
                <SelectItem key={category} value={category}>{category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          title="Default article type"
          description="Select the format your team starts with most often."
        >
          <Select
            value={settings.defaultMetadata.type || 'none'}
            onValueChange={(value) => updateSettings({
              defaultMetadata: {
                ...settings.defaultMetadata,
                type: !value || value === 'none' ? '' : value,
              },
            })}
          >
            <SelectTrigger className="ui-control ui-select">
              <SelectValue placeholder="No default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No default</SelectItem>
              {articleTypeOptions.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          title="Default audience"
          description="A reusable reader description for new drafts."
        >
          <input
            type="text"
            name="default-audience"
            autoComplete="off"
            aria-label="Default audience"
            placeholder="Example: founders and product teams…"
            value={settings.defaultMetadata.targetAudience || ''}
            onChange={(event) => updateSettings({
              defaultMetadata: {
                ...settings.defaultMetadata,
                targetAudience: event.target.value,
              },
            })}
            className="ui-control ui-input"
          />
        </SettingRow>

        <SettingRow
          title="Default length"
          description="A starting length target such as 800 words."
        >
          <input
            type="text"
            name="default-length"
            autoComplete="off"
            aria-label="Default length"
            placeholder="Example: 800 words…"
            value={settings.defaultMetadata.targetLength || ''}
            onChange={(event) => updateSettings({
              defaultMetadata: {
                ...settings.defaultMetadata,
                targetLength: event.target.value,
              },
            })}
            className="ui-control ui-input"
          />
        </SettingRow>
      </SettingSection>
    </>
  );
}
