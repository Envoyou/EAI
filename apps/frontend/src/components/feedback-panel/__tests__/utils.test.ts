import { describe, expect, it } from 'vitest';
import type { FeedbackItem } from '@eai/shared';
import {
  canAcceptEditorialDecision,
  canRequestEAIRevision,
  canShowAutoApply,
  countAutoApplicableFeedback,
  getFeedbackIdentity,
} from '../utils';

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

  it('rejects manual, accepted, and applied items while allowing a prepared verification patch', () => {
    expect(canShowAutoApply({ ...autoFix, operation: 'manual' }, false)).toBe(false);
    expect(canShowAutoApply({ ...autoFix, verificationStatus: 'needs_citation' }, false)).toBe(true);
    expect(canShowAutoApply({
      ...autoFix,
      verificationStatus: 'needs_citation',
      replacementText: undefined,
    }, false)).toBe(false);
    expect(canShowAutoApply({ ...autoFix, isAccepted: true }, false)).toBe(false);
    expect(canShowAutoApply({ ...autoFix, isApplied: true }, false)).toBe(false);
  });

  it('disables both per-card and bulk apply in manual fallback mode', () => {
    expect(canShowAutoApply(autoFix, true)).toBe(false);
    expect(countAutoApplicableFeedback([autoFix], true)).toBe(0);
  });

  it('keeps structural feedback actionable without target or replacement text', () => {
    const structuralFinding: FeedbackItem = {
      category: 'Structure',
      status: 'warning',
      message: 'The conclusion repeats an earlier section.',
      operation: 'manual',
    };

    expect(canRequestEAIRevision(structuralFinding)).toBe(true);
    expect(canAcceptEditorialDecision(structuralFinding)).toBe(true);
  });

  it('does not allow factual or blocking findings to be accepted as editorial decisions', () => {
    const sourceFinding: FeedbackItem = {
      category: 'Source Fidelity',
      status: 'warning',
      message: 'This factual claim needs source verification.',
      verificationStatus: 'needs_citation',
      operation: 'manual',
    };
    const blockingFinding: FeedbackItem = {
      category: 'Structure',
      status: 'fail',
      message: 'The article contains duplicated sections.',
      operation: 'manual',
    };
    const unsupportedClaim: FeedbackItem = {
      category: 'Accuracy',
      status: 'warning',
      message: 'The market-size claim lacks attribution.',
      operation: 'manual',
    };

    expect(canRequestEAIRevision(sourceFinding)).toBe(false);
    expect(canAcceptEditorialDecision(sourceFinding)).toBe(false);
    expect(canRequestEAIRevision(blockingFinding)).toBe(true);
    expect(canAcceptEditorialDecision(blockingFinding)).toBe(false);
    expect(canAcceptEditorialDecision(unsupportedClaim)).toBe(false);
  });

  it('hides resolution actions after a finding is handled', () => {
    const appliedFinding = { ...autoFix, isApplied: true };

    expect(canRequestEAIRevision(appliedFinding)).toBe(false);
    expect(canAcceptEditorialDecision(appliedFinding)).toBe(false);
  });

  it('uses the persistent backend identity across list reordering', () => {
    const identified = { ...autoFix, feedbackId: 'feedback_server_123' };

    expect(getFeedbackIdentity(identified, 0)).toBe('feedback_server_123');
    expect(getFeedbackIdentity(identified, 4)).toBe('feedback_server_123');
  });
});
