'use client';

import React from 'react';
import { usePublication } from '@/components/PublicationProvider';
import { ArrayField } from '@/components/PublicationUI';
import { SettingSection } from '@/components/SettingsUI';
import type { AllowedEditorialTerm } from '@/types';

export default function TermsSettingsPage() {
  const { form, updateField } = usePublication();

  return (
    <>
      <div className="settings-page-intro">
        <span>Publication Settings</span>
        <h2 className="text-balance">Accepted Editorial Terms</h2>
        <p className="text-pretty">Common terms the review checks should understand in context.</p>
      </div>

      <SettingSection id="terms" title="Custom Dictionary" description="Add specific abbreviations or phrases to avoid false-positive AI flags.">
        <ArrayField
          label="Accepted terms"
          hint="Abbreviations, durations, or brand terms your team uses regularly"
          values={
            (form.allowedEditorialTerms ?? []).length > 0
              ? (form.allowedEditorialTerms ?? []).map((t) => t.value)
              : ['']
          }
          placeholder="e.g. 7 hari, 24/7, HRD"
          onChange={(values) => {
            const existingTerms = form.allowedEditorialTerms ?? [];
            const nextTerms: AllowedEditorialTerm[] = values
              .filter((v) => v.trim().length > 0)
              .map((v) => {
                const existing = existingTerms.find((t) => t.value === v);
                if (existing) return existing;
                const isDuration = /^\d+\s*(?:jam|hari|menit|detik|bulan|tahun|hours?|days?|minutes?|seconds?|months?|years?)$/i.test(v.trim());
                const isAbbrev = /^[A-Z][A-Z0-9\/\s-]{0,10}$/.test(v.trim());
                return {
                  value: v.trim(),
                  type: isDuration ? 'duration' : isAbbrev ? 'abbreviation' : 'brand_term',
                  scope: 'global',
                };
              });
            updateField('allowedEditorialTerms', nextTerms);
          }}
        />
      </SettingSection>
    </>
  );
}
