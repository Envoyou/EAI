import type {
  FeedbackItem,
  FindingTarget,
  ReviewCapability,
  ReviewPatchOperation,
} from './types/index';

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
  const capability = projectReviewCapability(item);
  return Boolean(
    capability?.autoApplicable
    && capability.targetField === 'body'
  );
};

const MECHANICAL_FINDING_PATTERN =
  /cms formatting|whitespace|punctuation|concatenated|spacing|formatting|format|paragraph (?:break|boundary)|spasi|tanda baca|kalimat tersambung|pemisah paragraf|batas paragraf/iu;

const SOURCE_DECISION_PATTERN =
  /source|citation|factual|verification|internal link|claim|evidence|attribution|unsupported|accuracy|provenance|sumber|sitasi|verifikasi|fakta|klaim|bukti|atribusi|akurasi|provenans/iu;

const isPatchOperation = (
  operation: FeedbackItem['operation']
): operation is ReviewPatchOperation =>
  operation === 'replace'
  || operation === 'insert_before'
  || operation === 'insert_after';

const isPublicationTarget = (
  targetField: FeedbackItem['targetField']
): targetField is Exclude<FindingTarget, 'body'> =>
  Boolean(targetField?.startsWith('publication.'));

/**
 * Canonical projection from a raw quality finding to the actions Review may
 * render. UI consumers must not infer actions directly from FeedbackItem.
 */
export const projectReviewCapability = (
  item: FeedbackItem
): ReviewCapability | null => {
  if (
    item.status === 'pass'
    || item.isApplied
    || item.isAccepted
    || item.isVerified
  ) return null;

  const target = item.targetText?.trim();
  const replacement = item.replacementText?.trim();
  const combined = [item.category, item.message, item.reason, item.ruleId]
    .filter(Boolean)
    .join(' ');
  const sourceSensitive = Boolean(item.verificationStatus)
    || SOURCE_DECISION_PATTERN.test(combined);

  if (sourceSensitive) {
    return {
      kind: 'source_decision',
      autoApplicable: false,
      allowAddSource: true,
      allowKeep:
        item.status === 'warning'
        && item.verificationStatus === 'needs_citation'
        && Boolean(target)
        && !replacement,
      allowEdit: true,
      target: target || item.message,
    };
  }

  if (isPublicationTarget(item.targetField) && target && replacement) {
    return {
      kind: 'prepared_proposal',
      autoApplicable: true,
      target,
      replacement,
      operation: 'replace',
      targetField: item.targetField,
    };
  }

  if (
    (!item.targetField || item.targetField === 'body')
    && target
    && replacement
    && isPatchOperation(item.operation)
  ) {
    const mechanical = MECHANICAL_FINDING_PATTERN.test(combined);
    return {
      kind: mechanical ? 'mechanical_fix' : 'prepared_proposal',
      autoApplicable: true,
      target,
      replacement,
      operation: item.operation,
      targetField: 'body',
    };
  }

  return {
    kind: 'manual_editorial_decision',
    autoApplicable: false,
    allowKeep: item.status === 'warning' && !replacement,
    allowEdit: true,
    target: target || item.message,
  };
};

const normalizeFindingKeyPart = (value: string | undefined) =>
  (value ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase();

const getReviewFindingKey = (item: FeedbackItem) => {
  const target = normalizeFindingKeyPart(item.targetText);
  if (item.ruleId) {
    return `rule:${item.ruleId}:${target || normalizeFindingKeyPart(item.message)}`;
  }

  const combined = `${item.category} ${item.message} ${item.suggestion ?? ''}`;
  if (/missing whitespace|punctuation space|concatenated sentences|kehilangan spasi|kalimat tersambung/iu.test(combined)) {
    return `mechanical:missing_sentence_whitespace:${target || 'unscoped'}`;
  }

  if (target) return `target:${normalizeFindingKeyPart(item.category)}:${target}`;
  return `message:${normalizeFindingKeyPart(item.category)}:${normalizeFindingKeyPart(item.message)}`;
};

const getFindingInformationScore = (item: FeedbackItem) =>
  (item.status === 'fail' ? 20 : item.status === 'warning' ? 10 : 0)
  + (item.targetText?.trim() ? 4 : 0)
  + (item.replacementText?.trim() ? 2 : 0)
  + (item.ruleId ? 1 : 0);

/** Collapses repeated representations of the same review decision. */
export const deduplicateReviewFindings = <T extends FeedbackItem>(
  feedback: T[]
): T[] => {
  const order: string[] = [];
  const findings = new Map<string, T>();

  feedback.forEach((item) => {
    const key = getReviewFindingKey(item);
    const existing = findings.get(key);
    if (!existing) {
      order.push(key);
      findings.set(key, item);
      return;
    }
    if (getFindingInformationScore(item) > getFindingInformationScore(existing)) {
      findings.set(key, item);
    }
  });

  return order
    .map((key) => findings.get(key))
    .filter((item): item is T => Boolean(item));
};

const LOW_INFORMATION_SLUG_WORDS = [
  'of',
  'the',
  'a',
  'an',
  'for',
  'to',
  'in',
  'and',
  'with',
  'on',
];

/** Builds a bounded, deterministic slug proposal without rewriting article content. */
export const buildShortSlugSuggestion = (
  value: string,
  maxWords = 6
): string => {
  const words = value
    .trim()
    .split(/[-\s]+/)
    .map(word => word.toLowerCase().replace(/[^a-z0-9]+/g, ''))
    .filter(Boolean);

  const impactOfIndex = words.indexOf('impact');
  const ofIndex = words.indexOf('of');
  const onIndex = words.indexOf('on');
  if (
    impactOfIndex === 0
    && ofIndex === 1
    && onIndex > ofIndex + 1
  ) {
    const subject = words.slice(ofIndex + 1, onIndex);
    words.splice(0, onIndex, ...subject, 'impact', 'on');
  }

  for (const connector of LOW_INFORMATION_SLUG_WORDS) {
    while (words.length > maxWords) {
      const index = words.indexOf(connector);
      if (index < 0) break;
      words.splice(index, 1);
    }
  }

  return words.slice(0, maxWords).join('-');
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
