import { canAutoApplyFeedback, type FeedbackItem } from '@eai/shared';

export const getFeedbackIdentity = (item: FeedbackItem, index: number) =>
  [item.category, item.message, item.targetText ?? '', item.operation ?? '', index]
    .join('\u001f');

export const canShowAutoApply = (
  item: FeedbackItem,
  autoApplyDisabled: boolean
) => !autoApplyDisabled && canAutoApplyFeedback(item);

export const countAutoApplicableFeedback = (
  feedback: FeedbackItem[] = [],
  autoApplyDisabled = false
) => autoApplyDisabled
  ? 0
  : feedback.filter(canAutoApplyFeedback).length;
