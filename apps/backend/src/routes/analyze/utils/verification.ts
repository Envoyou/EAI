/**
 * Verification lock, annotation, and financial entity protection.
 * Depends on signals.ts and factual.ts.
 * Extracted from analyze.ts L170–691 (zero logic change).
 */

import type { FeedbackItem, VerificationStatus } from '@eai/shared';
import {
  isEditoriallySensitiveClaimText,
  detectDraftRiskProfile,
} from './signals';
import {
  shouldSuppressFeedbackTarget,
  getProtectedVerificationClaims,
} from './factual';

// ── Constants ─────────────────────────────────────────────────────────────────

export const VERIFICATION_NOTES_HEADING = '## Verification Notes';
export const VERIFICATION_LOCK_START = '[[VERIFICATION_LOCK_START]]';
export const VERIFICATION_LOCK_END = '[[VERIFICATION_LOCK_END]]';

// ── Inline labels ─────────────────────────────────────────────────────────────

export const getVerificationInlineLabel = (status?: VerificationStatus): string | null => {
  if (status === 'source_backed') return '[Externally sourced claim — verify primary reporting if needed.]';
  if (status === 'high_risk_factual_claim') return '[Source verification recommended]';
  if (status === 'needs_citation') return '[Citation recommended]';
  return null;
};

// ── Cleanup helpers ───────────────────────────────────────────────────────────

export const cleanupVerificationLocks = (text: string): string =>
  text
    .replaceAll(VERIFICATION_LOCK_START, '')
    .replaceAll(VERIFICATION_LOCK_END, '');

export const stripGeneratedVerificationNotes = (text: string): string =>
  cleanupVerificationLocks(text)
    .replace(new RegExp(`\\n\\n${VERIFICATION_NOTES_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*$`), '')
    .trimEnd();

// ── Snippet helpers ───────────────────────────────────────────────────────────

export const makeVerificationSnippet = (value?: string): string => {
  if (!value) return 'Sensitive claim in this section';
  const compact = value
    .replace(/^>\s*/gm, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
};

export const extractFallbackVerificationSnippetFromFinalText = (item: FeedbackItem, finalText?: string): string | undefined => {
  const paragraphs = (finalText ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const matchedParagraph = item.targetText?.trim()
    ? paragraphs.find((paragraph) => paragraph.includes(item.targetText!.trim()))
    : undefined;

  if (matchedParagraph) return matchedParagraph;

  const factualParagraph = paragraphs.find((paragraph) =>
    isEditoriallySensitiveClaimText(paragraph, detectDraftRiskProfile(finalText ?? ''))
  );
  if (factualParagraph) return factualParagraph;

  return undefined;
};

export const buildVerificationFallbackNote = (item: FeedbackItem, finalText?: string): string => {
  const label = getVerificationInlineLabel(item.verificationStatus) ?? '[Source verification recommended]';
  const snippet = extractFallbackVerificationSnippetFromFinalText(item, finalText)
    || (item.targetText?.trim() && finalText?.includes(item.targetText.trim()) ? item.targetText.trim() : undefined)
    || item.message?.trim()
    || (item.verificationStatus === 'needs_citation'
      ? 'Sensitive claim in this article would benefit from a direct citation'
      : 'Sensitive figure or claim in this article requires source verification');
  return `- ${label} ${makeVerificationSnippet(snippet)}.`;
};

// ── Disallowed refine targets ─────────────────────────────────────────────────

export const removeDisallowedRefineTargets = (text: string, feedback: FeedbackItem[] = []): string => {
  const disallowedTargets = feedback
    .filter((item) => shouldSuppressFeedbackTarget(item) && Boolean(item.targetText?.trim()))
    .map((item) => item.targetText!.trim());

  if (disallowedTargets.length === 0) return text;

  const paragraphs = text.split(/\n\s*\n/);
  const filtered = paragraphs.filter((paragraph) =>
    !disallowedTargets.some((target) => paragraph.includes(target))
  );

  return filtered.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
};

// ── Annotatable candidates ────────────────────────────────────────────────────

export const getAnnotatableVerificationCandidates = (feedback: FeedbackItem[] = []): FeedbackItem[] =>
  feedback.filter((item) =>
    Boolean(getVerificationInlineLabel(item.verificationStatus))
    && !shouldSuppressFeedbackTarget(item)
  );

// ── Financial entity locking ──────────────────────────────────────────────────

export const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const extractFinancialEntities = (text: string): string[] => {
  const patterns = [
    /\$[\d,.]+(?:\s*(?:miliar|juta|triliun|billion|million|trillion|bn|mn))?/gi,
    /\b[\d,.]+\s*(?:GW|MW|TB|PB)\b/gi,
    /\b[\d,.]+\s*Gigawatt(?:\s*\(GW\))?\b/gi,
    /\b[\d,.]+\s*%\b/gi,
  ];
  const matches = patterns.flatMap((pattern) => text.match(pattern) ?? []);
  return Array.from(new Set(matches.map((match) => match.trim()))).sort((a, b) => b.length - a.length);
};

export const autoLockFinancialEntities = (text: string): string => {
  let nextText = text;

  extractFinancialEntities(text).forEach((entity) => {
    const escapedEntity = escapeRegExp(entity);
    const lockPattern = new RegExp(`${escapeRegExp(VERIFICATION_LOCK_START)}${escapedEntity}${escapeRegExp(VERIFICATION_LOCK_END)}`);
    if (lockPattern.test(nextText)) return;

    nextText = nextText.replace(
      new RegExp(escapedEntity, 'g'),
      `${VERIFICATION_LOCK_START}$&${VERIFICATION_LOCK_END}`
    );
  });

  return nextText;
};

export const applyVerificationLocks = (text: string, feedback: FeedbackItem[] = []): string => {
  let nextText = autoLockFinancialEntities(text);
  const protectedClaims = getProtectedVerificationClaims(feedback);

  protectedClaims.forEach((item) => {
    const targetText = item.targetText?.trim();
    if (!targetText) return;
    if (nextText.includes(`${VERIFICATION_LOCK_START}${targetText}${VERIFICATION_LOCK_END}`)) return;
    nextText = nextText.replace(targetText, `${VERIFICATION_LOCK_START}${targetText}${VERIFICATION_LOCK_END}`);
  });

  return nextText;
};

// ── Verification annotation ───────────────────────────────────────────────────

export const applyVerificationAnnotations = (text: string, feedback: FeedbackItem[] = []): string => {
  const sanitizedBaseText = removeDisallowedRefineTargets(stripGeneratedVerificationNotes(text), feedback);
  const candidates = getAnnotatableVerificationCandidates(feedback);

  if (candidates.length === 0) return sanitizedBaseText;

  let nextText = sanitizedBaseText;
  const unmatchedNotes: string[] = [];

  candidates.forEach((item) => {
    const label = getVerificationInlineLabel(item.verificationStatus);
    const targetText = item.targetText?.trim();
    if (!label) return;
    if (!targetText) {
      unmatchedNotes.push(buildVerificationFallbackNote(item, nextText));
      return;
    }

    const targetIndex = nextText.indexOf(targetText);
    if (targetIndex === -1) {
      unmatchedNotes.push(buildVerificationFallbackNote(item, nextText));
      return;
    }

    const insertionPoint = targetIndex + targetText.length;
    const nearbySlice = nextText.slice(insertionPoint, insertionPoint + 80);
    if (nearbySlice.includes(label)) return;

    nextText = `${nextText.slice(0, insertionPoint)}${label}${nextText.slice(insertionPoint)}`;
  });

  nextText = removeDisallowedRefineTargets(nextText, feedback);
  if (unmatchedNotes.length === 0) return nextText;

  const dedupedNotes = Array.from(new Set(unmatchedNotes));
  return `${nextText.trimEnd()}\n\n${VERIFICATION_NOTES_HEADING}\n${dedupedNotes.join('\n')}`;
};
