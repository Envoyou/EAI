import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const finalDraftSource = readFileSync(new URL('../FinalDraftPanel.tsx', import.meta.url), 'utf8');
const inlineFinalDraftEditorSource = readFileSync(
  new URL('../final-draft/InlineFinalDraftEditor.tsx', import.meta.url),
  'utf8',
);
const onboardingSource = readFileSync(new URL('../OnboardingWizard.tsx', import.meta.url), 'utf8');
const feedbackItemSource = readFileSync(
  new URL('../feedback-panel/components/FeedbackItemCard.tsx', import.meta.url),
  'utf8',
);
const activationStep = onboardingSource.slice(
  onboardingSource.indexOf("{step === 'activation'"),
  onboardingSource.indexOf("{step === 'discovery'"),
);

describe('remaining legacy feature form-control contract', () => {
  it('uses canonical controls for revision and publication fields in Final Draft', () => {
    expect(finalDraftSource).not.toMatch(/<textarea\b/);
    expect(finalDraftSource.match(/<Textarea\b/g)).toHaveLength(3);
    expect(finalDraftSource.match(/<Input\b/g)).toHaveLength(2);
    expect(finalDraftSource.match(/variant="surface"/g)).toHaveLength(5);
    expect(finalDraftSource).toContain('<InlineFinalDraftEditor');
    expect(inlineFinalDraftEditorSource).toContain('<EditorContent editor={editor} />');
    expect(finalDraftSource).not.toMatch(/ui-control|ui-input|ui-textarea|ui-select/);
  });

  it('uses canonical surface inputs for the Onboarding activation fields', () => {
    expect(activationStep.match(/<Input\b/g)).toHaveLength(3);
    expect(activationStep.match(/variant="surface"/g)).toHaveLength(7);
    expect(onboardingSource).not.toMatch(/ui-control|ui-input|ui-textarea|ui-select/);
  });

  it('uses canonical source and manual publication inputs without changing Enter submission', () => {
    expect(feedbackItemSource).not.toMatch(/<input\b/);
    expect(feedbackItemSource.match(/<Input\b/g)).toHaveLength(2);
    expect(feedbackItemSource.match(/variant="surface"/g)).toHaveLength(1);
    expect(feedbackItemSource).toContain("e.key === 'Enter' && !isSubmittingSource");
    expect(feedbackItemSource).toContain("aria-label={t('manualPublicationValue')}");
    expect(feedbackItemSource).not.toMatch(/ui-control|ui-input|ui-textarea|ui-select/);
  });
});
