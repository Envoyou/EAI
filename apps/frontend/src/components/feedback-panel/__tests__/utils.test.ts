import { describe, expect, it } from 'vitest';
import type { FeedbackItem } from '@eai/shared';
import { canShowAutoApply, countAutoApplicableFeedback } from '../utils';

const autoFix: FeedbackItem = {
  category: 'Clarity',
  status: 'warning',
  message: 'Tighten this sentence.',
  targetText: 'A wordy sentence.',
  replacementText: 'A concise sentence.',
  operation: 'replace',
};

describe('feedback preview auto-apply contract', () => {
  it('shows apply only for a complete structured edit', () => {
    expect(canShowAutoApply(autoFix, false)).toBe(true);
    expect(countAutoApplicableFeedback([autoFix], false)).toBe(1);
  });

  it('does not treat a narrative suggestion as replacement text', () => {
    const suggestionOnly = {
      ...autoFix,
      replacementText: undefined,
      suggestion: 'Consider making this more concise.',
    };
    expect(canShowAutoApply(suggestionOnly, false)).toBe(false);
  });

  it('rejects manual, verification, accepted, and applied items', () => {
    expect(canShowAutoApply({ ...autoFix, operation: 'manual' }, false)).toBe(false);
    expect(canShowAutoApply({ ...autoFix, verificationStatus: 'needs_citation' }, false)).toBe(false);
    expect(canShowAutoApply({ ...autoFix, isAccepted: true }, false)).toBe(false);
    expect(canShowAutoApply({ ...autoFix, isApplied: true }, false)).toBe(false);
  });

  it('disables both per-card and bulk apply in manual fallback mode', () => {
    expect(canShowAutoApply(autoFix, true)).toBe(false);
    expect(countAutoApplicableFeedback([autoFix], true)).toBe(0);
  });
});
