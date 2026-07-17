/**
 * Feedback sanitization and factual claim normalization.
 * Depends on signals.ts. No I/O side effects.
 * Extracted from analyze.ts L162–438 (zero logic change).
 */

import type { FeedbackItem, VerificationStatus } from '@eai/shared';
import type { StructuredFeedbackItem, DraftRiskProfile } from '../types';
import { MAX_SUMMARY_LENGTH } from '../types';
import {
  containsFactualSignal,
  detectDraftRiskProfile,
  detectSourceProvenance,
  hasWeakAttributionLanguage,
  isEditoriallySensitiveClaimText,
  isFactualFeedback,
  isStructuralFeedback,
} from './signals';

// ── Constants ─────────────────────────────────────────────────────────────────

export const NEUTRAL_FACTUAL_MESSAGE = 'This factual claim involves a sensitive number and should be verified against the cited source before publication.';
export const NEUTRAL_FACTUAL_SUGGESTION = 'Verify this against the reference source before publication and consider adding a direct link or more precise attribution for the number.';
export const NEUTRAL_FACTUAL_REASON = 'This claim needs stronger citation support, and the final wording should remain neutral until the primary source is verified.';
export const NEUTRAL_FACTUAL_SUMMARY = 'This draft contains several sensitive factual claims that need verification against cited sources and more precise attribution before publication.';
export const SOURCE_BACKED_FACTUAL_MESSAGE = 'This claim is supported by an external source listed in the draft. Consider verifying it against primary reporting or an official disclosure before publication.';
export const SOURCE_BACKED_FACTUAL_SUGGESTION = 'If available, add a direct link to primary reporting, official disclosure, or a more precise source quote to strengthen this claim\'s provenance.';
export const SOURCE_BACKED_FACTUAL_REASON = 'This claim has visible external provenance in the draft, but primary-source verification can still strengthen editorial confidence.';
export const SOURCE_BACKED_FACTUAL_SUMMARY = 'This draft contains several sensitive factual claims supported by external sources listed in the draft. Consider primary reporting or official disclosure verification before publication.';

// ── Target inference ──────────────────────────────────────────────────────────

export const normalizeTargetLookup = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

export const targetExistsInDraft = (draftText: string, targetText?: string): boolean => {
  const target = targetText?.trim();
  if (!target) return false;
  if (target.includes('...')) return false;
  if (draftText.includes(target)) return true;
  return normalizeTargetLookup(draftText).includes(normalizeTargetLookup(target));
};

export const splitIntoSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

export const findBestFactualTarget = (paragraph: string, draftProfile: DraftRiskProfile): string => {
  const sentences = splitIntoSentences(paragraph);
  return sentences.find((sentence) => isEditoriallySensitiveClaimText(sentence, draftProfile))
    ?? sentences.find(containsFactualSignal)
    ?? paragraph;
};

export const inferTargetTextFromDraft = (item: FeedbackItem, draftText: string): string | undefined => {
  const draftProfile = detectDraftRiskProfile(draftText);
  if (targetExistsInDraft(draftText, item.targetText)) return item.targetText!.trim();

  const paragraphs = draftText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (isFactualFeedback(item) && !isStructuralFeedback(item)) {
    const factualParagraph = paragraphs.find((paragraph) =>
      isEditoriallySensitiveClaimText(paragraph, draftProfile)
    );
    if (factualParagraph) return findBestFactualTarget(factualParagraph, draftProfile);
  }

  return undefined;
};

// ── Factual auto-replace risk ─────────────────────────────────────────────────

export const hasFactualAutoReplaceRisk = (item: FeedbackItem): boolean => {
  if (!item.targetText || !item.replacementText) return false;
  if (item.operation !== 'replace') return false;

  const targetHasSignal = containsFactualSignal(item.targetText);
  const replacementHasSignal = containsFactualSignal(item.replacementText);
  const itemHasSignal = [
    item.category,
    item.message,
    item.suggestion,
    item.reason,
  ].some(containsFactualSignal);

  return targetHasSignal || replacementHasSignal || itemHasSignal;
};

// ── Sensitive factual determination ──────────────────────────────────────────

export const isSensitiveFactualFeedback = (item: FeedbackItem, draftText: string): boolean => {
  const draftProfile = detectDraftRiskProfile(draftText);
  if (!isFactualFeedback(item)) return false;
  if (!(item.status === 'fail' || item.status === 'warning')) return false;
  if (isStructuralFeedback(item)) return false;

  return [
    item.targetText,
    item.replacementText,
    item.message,
    item.suggestion,
    item.reason,
    item.category,
  ].some((value) => isEditoriallySensitiveClaimText(value, draftProfile));
};

export const inferVerificationStatus = (item: FeedbackItem, draftText: string): VerificationStatus | undefined => {
  if (!isSensitiveFactualFeedback(item, draftText)) return item.verificationStatus;
  const provenance = detectSourceProvenance(draftText);
  const weakAttribution = hasWeakAttributionLanguage(item);

  if (provenance === 'strong') {
    return weakAttribution ? 'needs_citation' : 'source_backed';
  }

  if (provenance === 'moderate') {
    return 'needs_citation';
  }

  if (item.status === 'fail' || provenance === 'weak' || provenance === 'none') {
    return 'high_risk_factual_claim';
  }

  if (item.status === 'warning') return 'needs_citation';
  return 'source_backed';
};

// ── Protected claims ──────────────────────────────────────────────────────────

export const getProtectedVerificationClaims = (feedback: FeedbackItem[] = []): FeedbackItem[] =>
  feedback.filter((item) => item.verificationStatus === 'high_risk_factual_claim' && Boolean(item.targetText?.trim()));

// ── Structured feedback conversion ───────────────────────────────────────────

export const toStructuredFeedbackItem = (item: FeedbackItem): StructuredFeedbackItem => ({
  category: item.category,
  status: item.status,
  verificationStatus: item.verificationStatus,
  message: item.message,
  suggestion: item.suggestion,
  targetText: item.targetText,
  replacementText: item.replacementText,
  reason: item.reason,
  operation: item.operation ?? 'manual',
});

// ── Feedback sanitization ─────────────────────────────────────────────────────

export const sanitizeFactualFeedbackItem = (item: FeedbackItem, draftText: string): StructuredFeedbackItem => {
  let nextItem = item;
  const inferredTargetText = inferTargetTextFromDraft(nextItem, draftText);
  const candidateSensitiveText = inferredTargetText
    ?? nextItem.targetText
    ?? nextItem.message
    ?? nextItem.suggestion
    ?? nextItem.reason;

  if (hasFactualAutoReplaceRisk(nextItem)) {
    nextItem = {
      ...nextItem,
      operation: 'manual',
      suggestion: nextItem.suggestion
        ?? 'Do not change this data automatically. Verify it against the primary source or references listed in the draft.',
      reason: nextItem.reason
        ?? 'A factual change is high-risk if it relies only on model memory and must be manually verified.',
      targetText: undefined,
      replacementText: undefined,
    };
  }

  const nextItemWithTarget = {
    ...nextItem,
    targetText: inferredTargetText ?? nextItem.targetText,
  };
  const draftProfile = detectDraftRiskProfile(draftText);
  const shouldNeutralizeWording = isSensitiveFactualFeedback(nextItemWithTarget, draftText);
  const verificationStatus = inferVerificationStatus(nextItemWithTarget, draftText);

  if (!shouldNeutralizeWording) {
    return toStructuredFeedbackItem({
      ...nextItemWithTarget,
      verificationStatus: isEditoriallySensitiveClaimText(candidateSensitiveText, draftProfile) ? verificationStatus : undefined,
    });
  }

  const neutralCopy = verificationStatus === 'source_backed'
    ? {
        message: SOURCE_BACKED_FACTUAL_MESSAGE,
        suggestion: SOURCE_BACKED_FACTUAL_SUGGESTION,
        reason: SOURCE_BACKED_FACTUAL_REASON,
      }
    : {
        message: NEUTRAL_FACTUAL_MESSAGE,
        suggestion: NEUTRAL_FACTUAL_SUGGESTION,
        reason: NEUTRAL_FACTUAL_REASON,
      };

  return toStructuredFeedbackItem({
    ...nextItemWithTarget,
    operation: 'manual',
    verificationStatus,
    message: neutralCopy.message,
    suggestion: neutralCopy.suggestion,
    reason: neutralCopy.reason,
    replacementText: undefined,
  });
};

// ── Suppressive feedback ──────────────────────────────────────────────────────

export const shouldSuppressFeedbackTarget = (item: FeedbackItem): boolean => {
  const combined = `${item.message ?? ''} ${item.suggestion ?? ''}`.toLowerCase();
  return /\b(hapus paragraf|remove paragraph|hilangkan bagian|jangan sertakan)\b/i.test(combined);
};

export const sanitizeSuppressiveFeedbackItem = (item: FeedbackItem, draftText: string): StructuredFeedbackItem => {
  if (!shouldSuppressFeedbackTarget(item)) {
    return sanitizeFactualFeedbackItem(item, draftText);
  }

  const inferredTargetText = inferTargetTextFromDraft(item, draftText);
  return toStructuredFeedbackItem({
    ...item,
    operation: 'manual',
    targetText: inferredTargetText ?? item.targetText,
    replacementText: undefined,
  });
};

// ── Summary sanitization ──────────────────────────────────────────────────────

export const truncateSummary = (summary: string, maxLength: number = MAX_SUMMARY_LENGTH): string => {
  const normalized = summary.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;

  const suffix = '...';
  const hardLimit = maxLength - suffix.length;
  const clipped = normalized.slice(0, hardLimit).replace(/\s+\S*$/, '').trim();
  return `${clipped || normalized.slice(0, hardLimit).trim()}${suffix}`;
};

export const sanitizeFactualSummary = (summary: string, feedback: FeedbackItem[], draftText: string): string => {
  const hasFactual = feedback.some((item) => isSensitiveFactualFeedback(item, draftText));

  if (!hasFactual) return truncateSummary(summary);
  const provenance = detectSourceProvenance(draftText);
  if (provenance === 'strong' || provenance === 'moderate') {
    return truncateSummary(SOURCE_BACKED_FACTUAL_SUMMARY);
  }
  return truncateSummary(NEUTRAL_FACTUAL_SUMMARY);
};
