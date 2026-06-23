'use client';

import React from 'react';
import { Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { usePublication } from '@/components/PublicationProvider';
import { ArrayField, FieldLabel } from '@/components/PublicationUI';
import { SettingSection } from '@/components/SettingsUI';

export default function SeoSettingsPage() {
  const { form, updateField } = usePublication();

  const updateSeoRule = (key: string, value: number) => {
    updateField('seoRules', {
      ...form.seoRules!,
      [key]: value,
    });
  };

  if (!form.seoRules) return null;

  return (
    <>
      <div className="settings-page-intro">
        <span>Publication Settings</span>
        <h2 className="text-balance">SEO & Links</h2>
        <p className="text-pretty">Title limits, tag count, and trusted internal-link domains.</p>
      </div>

      <SettingSection id="seo" title="Optimization Rules" description="Controls for how AI generates SEO metadata and connects internal pages.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['titleMaxLength', 'Article title', 10, 120],
            ['metaTitleMaxLength', 'Meta title', 10, 80],
            ['metaDescriptionMaxLength', 'Description', 50, 160],
            ['tagCountMin', 'Min tags', 3, 5],
            ['tagCountMax', 'Max tags', 3, 5],
          ].map(([key, label, min, max]) => (
            <div key={key as string}>
              <FieldLabel>{label as string}</FieldLabel>
              <Input
                type="number"
                min={min as number}
                max={max as number}
                value={form.seoRules![key as keyof typeof form.seoRules]}
                onChange={(event) => updateSeoRule(key as string, Number(event.target.value))}
                className="h-10 bg-muted/10 border-transparent hover:bg-muted/20 focus:bg-background focus:border-border transition-colors shadow-none font-mono mt-2"
              />
            </div>
          ))}
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 mt-8">
          <ArrayField
            label="Trusted internal-link domains"
            values={(form.internalLinkDomains || []).length > 0 ? form.internalLinkDomains! : ['']}
            placeholder="blog.example.com"
            onChange={(values) => updateField('internalLinkDomains', values)}
          />
          <div>
            <FieldLabel hint={`Used when EAI suggests internal links · ${(form.internalLinkBaseUrl || '').length} / 300`}>Internal link base URL</FieldLabel>
            <div className="relative mt-2">
              <Link2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                type="url"
                value={form.internalLinkBaseUrl || ''}
                onChange={(event) => updateField('internalLinkBaseUrl', event.target.value)}
                placeholder="https://blog.example.com/posts"
                className="h-10 bg-muted/10 border-transparent hover:bg-muted/20 focus:bg-background focus:border-border transition-colors shadow-none pl-10"
              />
            </div>
          </div>
        </div>
      </SettingSection>
    </>
  );
}
