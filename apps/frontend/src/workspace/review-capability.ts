import {
  deduplicateReviewFindings,
  projectReviewCapability,
  type FeedbackItem,
  type FindingTarget,
  type ReviewCapability,
} from '@eai/shared';

export interface ReviewDecision {
  item: FeedbackItem;
  index: number;
  capability: ReviewCapability;
}

export const buildReviewDecisionQueue = (
  feedback: FeedbackItem[] = []
): ReviewDecision[] => deduplicateReviewFindings(feedback).flatMap((item) => {
  const index = feedback.indexOf(item);
  const capability = projectReviewCapability(item);
  return capability ? [{ item, index, capability }] : [];
});

export const countAutoApplicableReviewDecisions = (
  decisions: ReviewDecision[]
): number => decisions.filter(({ capability }) => capability.autoApplicable).length;

export const applyProjectedReviewCapability = async ({
  capability,
  index,
  onApplyFix,
  onApplyPublicationFix,
}: {
  capability: ReviewCapability;
  index: number;
  onApplyFix?: (
    targetText: string,
    replacementText: string,
    operation: 'replace' | 'insert_before' | 'insert_after',
    index: number
  ) => Promise<boolean>;
  onApplyPublicationFix?: (
    targetField: FindingTarget,
    targetText: string,
    replacementText: string,
    index: number
  ) => Promise<boolean>;
}): Promise<boolean> => {
  if (!capability.autoApplicable) return false;

  if (capability.targetField !== 'body') {
    if (!onApplyPublicationFix) return false;
    return onApplyPublicationFix(
      capability.targetField,
      capability.target,
      capability.replacement,
      index
    );
  }

  if (!onApplyFix) return false;
  return onApplyFix(
    capability.target,
    capability.replacement,
    capability.operation,
    index
  );
};
