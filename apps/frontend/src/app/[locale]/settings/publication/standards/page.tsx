'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { usePublication } from '@/components/PublicationProvider';
import { ArrayField, FieldLabel } from '@/components/PublicationUI';
import { SettingSection } from '@/components/SettingsUI';

export default function StandardsSettingsPage() {
  const { form, updateField } = usePublication();

  return (
    <>
      <div className="settings-page-intro">
        <span>Publication Settings</span>
        <h2 className="text-balance">Writing Standards</h2>
        <p className="text-pretty">Preferred structure, phrases to avoid, and special instructions.</p>
      </div>

      <SettingSection id="standards" title="Editorial Standards" description="Set rules that AI must follow during drafting and refinement.">
        <div className="space-y-6">
          <div>
            <FieldLabel>Source checking level</FieldLabel>
            <div className="mt-2 grid grid-cols-2 rounded-md bg-muted/20 p-1">
              {(['standard', 'strict'] as const).map((policy) => (
                <button
                  key={policy}
                  type="button"
                  onClick={() => updateField('sourcePolicy', policy)}
                  className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold capitalize transition ${
                    form.sourcePolicy === policy
                      ? 'bg-card text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {form.sourcePolicy === policy ? <Check className="h-3.5 w-3.5" /> : null}
                  {policy}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
              Strict treats source fidelity and unsupported sensitive claims as a stronger publication gate.
            </p>
          </div>

          <div className="grid gap-7 md:grid-cols-2 mt-6">
            <ArrayField
              label="Preferred article structure"
              hint="Evaluated from top to bottom"
              values={form.articleStructure || []}
              placeholder="Strategic Closing"
              onChange={(values) => updateField('articleStructure', values)}
            />
            <ArrayField
              label="Additional phrases or patterns to avoid"
              hint="Added on top of EAI's baseline safety rules"
              values={
                (form.additionalProhibitedPatterns || []).length > 0
                  ? form.additionalProhibitedPatterns || []
                  : ['']
              }
              placeholder="Prohibited phrase or pattern"
              onChange={(values) => updateField('additionalProhibitedPatterns', values)}
            />
          </div>

          <div className="mt-6">
            <FieldLabel hint={`Max 2,000 characters · ${(form.customInstructions || '').length} / 2000`}>Additional editor notes</FieldLabel>
            <Textarea
              value={form.customInstructions || ''}
              onChange={(event) => updateField('customInstructions', event.target.value)}
              placeholder="Example: Separate reported facts from editorial interpretation."
              className="min-h-32 resize-y bg-muted/10 border-transparent hover:bg-muted/20 focus:bg-background focus:border-border transition-colors shadow-none leading-6 mt-2"
            />
          </div>
        </div>
      </SettingSection>
    </>
  );
}
