import { describe, expect, it, vi } from 'vitest';
import { applyAllFeedbackOperations, type FeedbackItem } from '@eai/shared';
import { deriveCandidateDraftAvailability } from '../candidate-draft-state';
import {
  applyProjectedReviewCapability,
  buildReviewDecisionQueue,
  countAutoApplicableReviewDecisions,
} from '../review-capability';

const preparedPatch: FeedbackItem = {
  category: 'Clarity',
  status: 'warning',
  message: 'Use the prepared wording.',
  targetText: 'Old wording.',
  replacementText: 'New wording.',
  operation: 'replace',
  targetField: 'body',
};

describe('canonical review capability workflow', () => {
  it('keeps candidate availability independent from publication readiness', () => {
    expect(deriveCandidateDraftAvailability('Candidate body', 'needs_review')).toEqual({
      hasCandidateDraft: true,
      isPublicationReady: false,
    });
    expect(deriveCandidateDraftAvailability('Candidate body', 'ready')).toEqual({
      hasCandidateDraft: true,
      isPublicationReady: true,
    });
  });

  it('counts only auto-applicable capabilities for the bulk action', () => {
    const decisions = buildReviewDecisionQueue([
      preparedPatch,
      {
        category: 'Structure',
        status: 'warning',
        message: 'The conclusion needs an editorial decision.',
        operation: 'manual',
      },
    ]);

    expect(decisions).toHaveLength(2);
    expect(countAutoApplicableReviewDecisions(decisions)).toBe(1);
  });

  it('executes a prepared body capability with its exact patch', async () => {
    const [decision] = buildReviewDecisionQueue([preparedPatch]);
    const onApplyFix = vi.fn().mockResolvedValue(true);

    const applied = await applyProjectedReviewCapability({
      capability: decision!.capability,
      index: decision!.index,
      onApplyFix,
    });

    expect(applied).toBe(true);
    expect(onApplyFix).toHaveBeenCalledWith(
      'Old wording.',
      'New wording.',
      'replace',
      0
    );
  });

  it('projects an exact missing paragraph boundary as a mechanical fix', () => {
    const [decision] = buildReviewDecisionQueue([{
      category: 'Structure',
      status: 'warning',
      message: 'Missing paragraph break after the closing bold principle.',
      suggestion: 'Insert the missing paragraph break.',
      targetText: '**AI proposes, the editor decides.**Refinement operates differently.',
      replacementText: '**AI proposes, the editor decides.**\n\nRefinement operates differently.',
      operation: 'replace',
    }]);

    expect(decision!.capability).toMatchObject({
      kind: 'mechanical_fix',
      autoApplicable: true,
    });
  });

  it('changes the draft when the bulk action applies executable capabilities', () => {
    const sourceSensitivePatch: FeedbackItem = {
      category: 'Source Fidelity',
      status: 'warning',
      verificationStatus: 'needs_citation',
      message: 'This source-sensitive patch needs an editor decision.',
      targetText: 'Unsupported claim.',
      replacementText: 'Rewritten unsupported claim.',
      operation: 'replace',
    };
    const result = applyAllFeedbackOperations(
      'Old wording. Unsupported claim.',
      [preparedPatch, sourceSensitivePatch]
    );

    expect(result.nextText).toBe('New wording. Unsupported claim.');
    expect(result.appliedIndexes).toEqual([0]);
  });

  it('never exposes generic apply or keep for high-risk source findings', async () => {
    const [decision] = buildReviewDecisionQueue([{
      category: 'Source Fidelity',
      status: 'fail',
      verificationStatus: 'high_risk_factual_claim',
      message: 'The claim is unsupported.',
      targetText: 'Unsupported claim.',
      operation: 'manual',
    }]);
    const onApplyFix = vi.fn().mockResolvedValue(true);

    expect(decision!.capability).toMatchObject({
      kind: 'source_decision',
      autoApplicable: false,
      allowAddSource: true,
      allowKeep: false,
      allowEdit: true,
    });
    expect(await applyProjectedReviewCapability({
      capability: decision!.capability,
      index: 0,
      onApplyFix,
    })).toBe(false);
    expect(onApplyFix).not.toHaveBeenCalled();
  });

  it('keeps source fidelity out of generic rewrite even if a patch is supplied', () => {
    const [decision] = buildReviewDecisionQueue([{
      category: 'Source Fidelity',
      status: 'warning',
      verificationStatus: 'needs_citation',
      message: 'The introduced identity attribute is unsupported.',
      targetText: 'An unsupported identity attribute.',
      replacementText: 'A rewritten identity attribute.',
      operation: 'replace',
    }]);

    expect(decision!.capability).toMatchObject({
      kind: 'source_decision',
      autoApplicable: false,
      allowKeep: false,
    });
  });

  it('collapses duplicate findings into one editorial decision', () => {
    const decisions = buildReviewDecisionQueue([
      {
        category: 'Structure',
        status: 'warning',
        message: 'Review this sentence.',
        targetText: 'The same affected sentence.',
        operation: 'manual',
      },
      {
        category: 'Structure',
        status: 'warning',
        message: 'This sentence needs editorial review.',
        targetText: 'The same affected sentence.',
        operation: 'manual',
      },
    ]);

    expect(decisions).toHaveLength(1);
  });
});
