import { canAutoApplyFeedback, type FeedbackItem } from '@eai/shared';

const isResolvedFeedback = (item: FeedbackItem) =>
  item.status === 'pass'
  || Boolean(item.isApplied)
  || Boolean(item.isAccepted)
  || Boolean(item.isVerified);

const SENSITIVE_EDITORIAL_DECISION_PATTERN =
  /source|citation|factual|fact[- ]?check|verification|internal link|claim|evidence|attribution|unsupported|accuracy|provenance|tautan internal|sumber|sitasi|verifikasi|fakta|klaim|bukti|atribusi|akurasi|provenans/i;

export const getFeedbackIdentity = (item: FeedbackItem, index: number) =>
  item.feedbackId
  ?? [item.category, item.message, item.targetText ?? '', item.operation ?? '', index]
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

export const canAcceptEditorialDecision = (item: FeedbackItem) =>
  item.status === 'warning'
  && !isResolvedFeedback(item)
  && !item.verificationStatus
  && item.category !== 'Editorial Addition'
  && !SENSITIVE_EDITORIAL_DECISION_PATTERN.test(
    `${item.category} ${item.message} ${item.reason ?? ''}`
  );

export const canRequestEAIRevision = (item: FeedbackItem) =>
  (item.status === 'warning' || item.status === 'fail')
  && !isResolvedFeedback(item)
  && (!item.targetField || item.targetField === 'body')
  && !item.verificationStatus
  && item.category !== 'Source Fidelity'
  && item.category !== 'Internal Linking';
