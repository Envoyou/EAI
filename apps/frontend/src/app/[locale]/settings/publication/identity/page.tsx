'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePublication } from '@/components/PublicationProvider';
import {
  PREDEFINED_CATEGORIES,
  PREDEFINED_ARTICLE_TYPES,
} from '@/lib/editorial-profile';
import {
  FieldLabel,
  ArrayField,
  SelectedValuesPanel,
  AddValueControl,
  cleanUniqueList,
} from '@/components/PublicationUI';
import { SettingSection } from '@/components/SettingsUI';

const PREDEFINED_CATEGORY_VALUES = PREDEFINED_CATEGORIES.flatMap((pillar) => pillar.items);
const PREDEFINED_ARTICLE_TYPE_VALUES = PREDEFINED_ARTICLE_TYPES.map((type) => type.name);
const EDITORIAL_TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'Jakarta (WIB)' },
  { value: 'Asia/Makassar', label: 'Makassar (WITA)' },
  { value: 'Asia/Jayapura', label: 'Jayapura (WIT)' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'Australia/Sydney', label: 'Sydney' },
] as const;

export default function IdentitySettingsPage() {
  const { form, updateField } = usePublication();

  return (
    <>
      <div className="settings-page-intro">
        <span>Publication Settings</span>
        <h2 className="text-balance">Publication Identity</h2>
        <p className="text-pretty">Brand, audience, voice, topics, and article formats.</p>
      </div>

      <SettingSection id="identity" title="Editorial Brand" description="Define the core identity of this workspace.">
        <div>
          <FieldLabel hint={`${form.brandName?.length || 0} / 80`}>Editorial brand name</FieldLabel>
          <Input
            value={form.brandName || ''}
            onChange={(event) => updateField('brandName', event.target.value)}
            className="h-10 bg-muted/10 border-transparent hover:bg-muted/20 focus:bg-background focus:border-border transition-colors shadow-none mt-2"
          />
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            Used by prompts, SEO, tone, and article identity. This can differ from the Clerk workspace name.
          </p>
        </div>
        
        <div className="mt-6">
          <FieldLabel hint={`A short promise that guides every article · ${(form.positioning || '').length} / 1000`}>Editorial positioning</FieldLabel>
          <Textarea
            value={form.positioning || ''}
            onChange={(event) => updateField('positioning', event.target.value)}
            className="min-h-24 resize-y bg-muted/10 border-transparent hover:bg-muted/20 focus:bg-background focus:border-border transition-colors shadow-none leading-6 mt-2"
          />
        </div>
        
        <div className="mt-6">
          <FieldLabel hint={`${(form.audience || '').length} / 1000`}>Primary audience</FieldLabel>
          <Textarea
            value={form.audience || ''}
            onChange={(event) => updateField('audience', event.target.value)}
            className="min-h-20 resize-y bg-muted/10 border-transparent hover:bg-muted/20 focus:bg-background focus:border-border transition-colors shadow-none leading-6 mt-2"
          />
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
          <ArrayField
            label="Brand voice"
            hint="Tone qualities EAI should preserve in every article"
            values={(form.tone || []).length > 0 ? form.tone || [] : ['']}
            placeholder="Strategic"
            onChange={(values) => updateField('tone', values)}
          />
          <div>
            <FieldLabel hint="Used for time-sensitive editorial context">Editorial timezone</FieldLabel>
            <Select
              value={form.timezone || 'Asia/Jakarta'}
              onValueChange={(value) => updateField('timezone', value || 'Asia/Jakarta')}
            >
              <SelectTrigger className="mt-2 h-10 w-full bg-muted/10 border-transparent hover:bg-muted/20 focus:bg-background focus:border-border shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {EDITORIAL_TIMEZONES.map((timezone) => (
                  <SelectItem key={timezone.value} value={timezone.value}>
                    {timezone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
              Helps EAI judge dates and time-sensitive claims without forcing date wording into articles.
            </p>
          </div>
        </div>
      </SettingSection>

      <SettingSection id="categories" title="Topics & Formats" description="Categories and article types covered by this publication.">
        <div className="space-y-8">
          <div>
            <FieldLabel hint="Choose which topics are covered by this publication">Article categories</FieldLabel>
            <SelectedValuesPanel
              title="Selected categories"
              values={form.categories || []}
              presetValues={PREDEFINED_CATEGORY_VALUES}
              emptyLabel="No categories selected yet."
              onRemove={(value) => updateField(
                'categories',
                (form.categories || []).filter((item) => item !== value)
              )}
            />
            <AddValueControl
              placeholder="Add custom category"
              onAdd={(value) => updateField(
                'categories',
                cleanUniqueList([...(form.categories || []), value])
              )}
            />
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 max-h-[350px] overflow-y-auto pr-2 bg-muted/10 rounded-md p-4 mt-2">
              {PREDEFINED_CATEGORIES.map((pillarObj) => (
                <div key={pillarObj.pillar} className="space-y-2">
                  <h3 className="text-xs font-bold text-primary font-mono uppercase tracking-wider">
                    {pillarObj.pillar}
                  </h3>
                  <div className="space-y-1.5 pl-1">
                    {pillarObj.items.map((cat) => {
                      const checked = (form.categories || []).includes(cat);
                      return (
                        <label key={cat} className="flex items-start gap-2.5 cursor-pointer text-xs group py-0.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? (form.categories || []).filter((item) => item !== cat)
                                : [...(form.categories || []), cat];
                              updateField('categories', next);
                            }}
                            className="mt-0.5 rounded border-transparent bg-background/50 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer shadow-sm"
                          />
                          <span className={`leading-tight ${checked ? 'text-foreground font-medium' : 'text-muted-foreground group-hover:text-foreground'}`}>
                            {cat}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel hint="Choose the article formats your team commonly publishes">Article formats</FieldLabel>
            <SelectedValuesPanel
              title="Selected article formats"
              values={form.articleTypes || []}
              presetValues={PREDEFINED_ARTICLE_TYPE_VALUES}
              emptyLabel="No article formats selected yet."
              onRemove={(value) => updateField(
                'articleTypes',
                (form.articleTypes || []).filter((item) => item !== value)
              )}
            />
            <AddValueControl
              placeholder="Add custom article format"
              onAdd={(value) => updateField(
                'articleTypes',
                cleanUniqueList([...(form.articleTypes || []), value])
              )}
            />
            <div className="grid gap-4 md:grid-cols-2 max-h-[320px] overflow-y-auto pr-2 bg-muted/10 rounded-md p-4 mt-2">
              {PREDEFINED_ARTICLE_TYPES.map((typeObj) => {
                const checked = (form.articleTypes || []).includes(typeObj.name);
                return (
                  <label
                    key={typeObj.name}
                    className={`flex items-start gap-3 rounded-md p-3.5 text-left cursor-pointer transition select-none group ${
                      checked
                        ? 'bg-primary/5 text-foreground shadow-sm ring-1 ring-primary/20'
                        : 'hover:bg-muted/30 text-foreground ring-1 ring-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const current = form.articleTypes || [];
                        const next = current.includes(typeObj.name)
                          ? current.filter((item) => item !== typeObj.name)
                          : [...current, typeObj.name];
                        updateField('articleTypes', next);
                      }}
                      className="mt-0.5 rounded border-transparent bg-background/50 text-primary focus:ring-primary h-4 w-4 cursor-pointer shadow-sm"
                    />
                    <div className="min-w-0">
                      <div className={`text-xs font-bold ${checked ? 'text-primary' : 'text-foreground'}`}>
                        {typeObj.name}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground group-hover:text-foreground/90">
                        {typeObj.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </SettingSection>
    </>
  );
}
