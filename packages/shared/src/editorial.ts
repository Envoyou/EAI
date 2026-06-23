import type { FeedbackItem } from './types/index';

export interface ApplyOperationResult {
  nextText: string;
  appliedIndexes: number[];
  failedIndexes: number[];
}

export interface TargetMatch {
  start: number;
  end: number;
  text: string;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeMatchText = (value: string) =>
  value
    .replace(/\[[^\]]+\]\(https?:\/\/[^)]+\)/gi, (match) => match.replace(/^\[|\]\(.*$/g, ''))
    .replace(/\.\.\./g, ' ')
    .replace(/[^\p{L}\p{N}%$€£¥]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const getMatchTokens = (value: string) =>
  normalizeMatchText(value)
    .split(' ')
    .filter((token) => token.length >= 3 || /\d/.test(token));

const scoreCandidate = (candidate: string, target: string) => {
  const targetTokens = Array.from(new Set(getMatchTokens(target)));
  if (targetTokens.length === 0) return 0;

  const candidateTokens = new Set(getMatchTokens(candidate));
  const matchedTokens = targetTokens.filter((token) => candidateTokens.has(token)).length;
  return matchedTokens / targetTokens.length;
};

const findSentenceLikeMatches = (text: string) => {
  const matches: TargetMatch[] = [];
  const pattern = /[^\n.!?]+(?:[.!?]+|$)/gu;

  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const leadingWhitespace = raw.length - raw.trimStart().length;
    const start = (match.index ?? 0) + leadingWhitespace;
    matches.push({
      start,
      end: start + trimmed.length,
      text: trimmed,
    });
  }

  return matches;
};

export const findTargetMatch = (text: string, targetText?: string): TargetMatch | null => {
  const target = targetText?.trim();
  if (!target) return null;

  const exactIndex = text.indexOf(target);
  if (exactIndex !== -1) {
    return {
      start: exactIndex,
      end: exactIndex + target.length,
      text: target,
    };
  }

  const flexiblePattern = target
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegex)
    .join('\\s+');

  if (!flexiblePattern) return null;

  const flexibleMatch = new RegExp(flexiblePattern, 'u').exec(text);
  if (flexibleMatch && flexibleMatch.index !== undefined) {
    return {
      start: flexibleMatch.index,
      end: flexibleMatch.index + flexibleMatch[0].length,
      text: flexibleMatch[0],
    };
  }

  if (target.includes('...')) {
    const ellipsisPattern = target
      .split(/\.\.\.+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 6)
      .map(escapeRegex)
      .join('[\\s\\S]{0,320}');
    const ellipsisMatch = ellipsisPattern ? new RegExp(ellipsisPattern, 'u').exec(text) : null;
    if (ellipsisMatch && ellipsisMatch.index !== undefined) {
      return {
        start: ellipsisMatch.index,
        end: ellipsisMatch.index + ellipsisMatch[0].length,
        text: ellipsisMatch[0],
      };
    }
  }

  const candidates = findSentenceLikeMatches(text);
  const bestCandidate = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate.text, target),
    }))
    .sort((a, b) => b.score - a.score)[0];

  if (bestCandidate && bestCandidate.score >= 0.55) return bestCandidate.candidate;

  return null;
};

export const replaceFirstTargetMatch = (
  text: string,
  targetText: string | undefined,
  replacementText: string
) => {
  const match = findTargetMatch(text, targetText);
  if (!match) {
    return { success: false, nextText: text, match: null };
  }

  return {
    success: true,
    nextText: `${text.slice(0, match.start)}${replacementText}${text.slice(match.end)}`,
    match,
  };
};

export const canAutoApplyFeedback = (item: FeedbackItem) => {
  if (item.status === 'pass' || item.verificationStatus) return false;
  if (!item.operation || item.operation === 'manual') return false;
  if (!item.targetText || !item.replacementText) return false;
  return true;
};

export const applyFeedbackOperation = (
  text: string,
  item: FeedbackItem
) => {
  if (!canAutoApplyFeedback(item)) {
    return { success: false, nextText: text };
  }

  const match = findTargetMatch(text, item.targetText);
  if (!match || !item.targetText || !item.replacementText) {
    return { success: false, nextText: text };
  }

  const before = text.slice(0, match.start);
  const after = text.slice(match.end);

  switch (item.operation) {
    case 'replace':
      return {
        success: true,
        nextText: `${before}${item.replacementText}${after}`,
      };
    case 'insert_before':
      return {
        success: true,
        nextText: `${before}${item.replacementText}${match.text}${after}`,
      };
    case 'insert_after':
      return {
        success: true,
        nextText: `${before}${match.text}${item.replacementText}${after}`,
      };
    default:
      return { success: false, nextText: text };
  }
};

export const applyAllFeedbackOperations = (
  text: string,
  feedback: FeedbackItem[]
): ApplyOperationResult => {
  let nextText = text;
  const appliedIndexes: number[] = [];
  const failedIndexes: number[] = [];

  feedback.forEach((item, index) => {
    const result = applyFeedbackOperation(nextText, item);
    if (result.success) {
      nextText = result.nextText;
      appliedIndexes.push(index);
      return;
    }

    if (canAutoApplyFeedback(item)) {
      failedIndexes.push(index);
    }
  });

  return {
    nextText,
    appliedIndexes,
    failedIndexes,
  };
};
