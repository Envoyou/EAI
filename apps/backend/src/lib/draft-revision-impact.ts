export type DraftRevisionImpact =
  | 'formatting_only'
  | 'minor_copy_edit'
  | 'editorial_change'
  | 'high_risk_change';

export type RevisionValidationLevel = 'none' | 'light' | 'full';
export type RevisionValidationState = 'valid' | 'validation_recommended' | 'stale';
export type SeoReviewState = 'valid' | 'possibly_stale' | 'stale';

export type RevisionSignals = {
  numbersChanged: boolean;
  entitiesChanged: boolean;
  citationsChanged: boolean;
  sensitiveTermsChanged: boolean;
  headingsChanged: boolean;
  structureChanged: boolean;
  topicShiftDetected: boolean;
};

export type DraftRevisionAssessment = {
  impact: DraftRevisionImpact;
  validationLevel: RevisionValidationLevel;
  qualityGateState: RevisionValidationState;
  seoReviewState: SeoReviewState;
  reasons: string[];
  signals: RevisionSignals;
};

type PublicationMetadata = {
  title?: unknown;
  excerpt?: unknown;
  metaTitle?: unknown;
  metaDescription?: unknown;
  tags?: unknown;
};

const SENSITIVE_TERMS = new Set([
  'all', 'always', 'can', 'cannot', 'could', 'every', 'except', 'guaranteed', 'may',
  'must', 'never', 'no', 'none', 'not', 'only', 'should', 'will', 'without',
  'akan', 'bisa', 'bukan', 'dapat', 'dijamin', 'harus', 'jangan', 'kecuali',
  'mustahil', 'semua', 'selalu', 'setiap', 'tidak', 'tanpa',
]);

const HIGH_STAKES_TERMS = new Set([
  'diagnosis', 'dose', 'health', 'legal', 'liability', 'medical', 'medicine', 'patient',
  'security', 'tax', 'investment', 'financial', 'profit', 'return', 'risk',
  'diagnosis', 'dosis', 'hukum', 'investasi', 'keamanan', 'kesehatan', 'medis',
  'obat', 'pajak', 'pasien', 'risiko', 'untung',
]);

const SEO_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'is',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with',
  'adalah', 'akan', 'atau', 'bagaimana', 'dan', 'dari', 'di', 'dengan', 'ini', 'itu',
  'ke', 'pada', 'sebagai', 'untuk', 'yang',
]);

const words = (value: string): string[] =>
  value.normalize('NFKC').match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? [];

const normalizedWords = (value: string): string[] =>
  words(value).map((word) => word.toLocaleLowerCase());

const wordCounts = (value: string): Map<string, number> => {
  const counts = new Map<string, number>();
  normalizedWords(value).forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
  return counts;
};

const sameCounts = (left: Map<string, number>, right: Map<string, number>): boolean =>
  left.size === right.size
  && [...left].every(([word, count]) => right.get(word) === count);

const normalizeCosmeticWhitespace = (value: string): string =>
  value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const markdownStructure = (value: string): string[] =>
  value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return 'blank';
      if (/^(?:\t| {4})/.test(line)) return 'indented-code';
      const heading = /^(#{1,6})\s+/.exec(trimmed);
      if (heading?.[1]) return `heading:${heading[1].length}`;
      if (/^```/.test(trimmed)) return `fence:${trimmed}`;
      if (/^([-*_])\1{2,}$/.test(trimmed)) return 'rule';
      if (trimmed.includes('|')) return 'table';
      if (/^[-+*]\s+/.test(trimmed)) return 'unordered-list';
      if (/^\d+[.)]\s+/.test(trimmed)) return 'ordered-list';
      if (/^>\s?/.test(trimmed)) return 'quote';
      return 'prose';
    });

const headingText = (value: string): string[] =>
  value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => /^(#{1,6})\s+(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => `${match[1]} ${normalizeCosmeticWhitespace(match[2] ?? '')}`);

const entitySignals = (value: string): string[] => {
  const sentences = value
    .split(/\n+/u)
    .filter((line) => !/^\s*#{1,6}\s+/.test(line))
    .flatMap((line) => line.split(/(?<=[.!?])\s+/u));
  const entities: string[] = [];
  sentences.forEach((sentence) => {
    const tokens = words(sentence);
    tokens.forEach((token, index) => {
      const acronym = token.length > 1 && token === token.toLocaleUpperCase() && /\p{Lu}/u.test(token);
      const capitalizedInsideSentence = index > 0 && /^\p{Lu}[-\p{Ll}\p{M}\d'’]*$/u.test(token);
      if (acronym || capitalizedInsideSentence) entities.push(token.normalize('NFKC'));
    });
  });
  return entities.sort();
};

const signalGroups = (value: string) => ({
  urls: (value.match(/https?:\/\/[^\s)\]]+/giu) ?? []).sort(),
  numbers: (value.match(/(?:[$€£¥Rp]\s*)?\d[\d.,:%/-]*/giu) ?? []).sort(),
  sensitiveTerms: normalizedWords(value).filter((word) => SENSITIVE_TERMS.has(word)).sort(),
  entities: entitySignals(value),
  citations: (value.match(/\[[^\]]+\]\([^)]+\)|\[[0-9]+\]|\([A-Z][^)]*,\s*\d{4}\)/gu) ?? []).sort(),
  quotations: (value.match(/[“"][^”"\n]{3,}[”"]|^>\s?.+$/gmu) ?? []).sort(),
});

const changedVocabulary = (
  before: Map<string, number>,
  after: Map<string, number>,
): Set<string> => new Set(
  [...new Set([...before.keys(), ...after.keys()])]
    .filter((token) => before.get(token) !== after.get(token)),
);

const metadataText = (metadata: PublicationMetadata | null | undefined): string => {
  if (!metadata) return '';
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  return [metadata.title, metadata.excerpt, metadata.metaTitle, metadata.metaDescription, ...tags]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
};

const seoAnchors = (metadata: PublicationMetadata | null | undefined): Set<string> =>
  new Set(
    normalizedWords(metadataText(metadata))
      .filter((word) => word.length >= 4 && !SEO_STOPWORDS.has(word)),
  );

export const deriveRevisionSignals = ({
  previousDraft,
  nextDraft,
  publicationMetadata,
}: {
  previousDraft: string;
  nextDraft: string;
  publicationMetadata?: PublicationMetadata | null;
}): RevisionSignals => {
  const beforeSignals = signalGroups(previousDraft);
  const afterSignals = signalGroups(nextDraft);
  const anchors = seoAnchors(publicationMetadata);
  const beforeWords = wordCounts(previousDraft);
  const afterWords = wordCounts(nextDraft);
  const anchorsBefore = [...anchors].filter((word) => (beforeWords.get(word) ?? 0) > 0);
  const lostAnchors = anchorsBefore.filter((word) => (afterWords.get(word) ?? 0) === 0);
  return {
    numbersChanged: !equalGroup(beforeSignals.numbers, afterSignals.numbers),
    entitiesChanged: !equalGroup(beforeSignals.entities, afterSignals.entities),
    citationsChanged:
      !equalGroup(beforeSignals.citations, afterSignals.citations)
      || !equalGroup(beforeSignals.urls, afterSignals.urls),
    sensitiveTermsChanged:
      !equalGroup(beforeSignals.sensitiveTerms, afterSignals.sensitiveTerms),
    headingsChanged:
      headingText(previousDraft).join('\n') !== headingText(nextDraft).join('\n'),
    structureChanged:
      markdownStructure(previousDraft).join('\n') !== markdownStructure(nextDraft).join('\n'),
    topicShiftDetected:
      lostAnchors.length >= Math.max(2, Math.ceil(Math.max(anchorsBefore.length, 1) * 0.3)),
  };
};

const countOccurrences = (value: string, target: string): number => value.split(target).length - 1;

const protectedTargetChanged = (
  previousDraft: string,
  nextDraft: string,
  protectedTargets: string[],
): boolean => protectedTargets.some((target) => {
  const normalized = target.trim();
  return normalized.length >= 8
    && countOccurrences(previousDraft, normalized) !== countOccurrences(nextDraft, normalized);
});

const equalGroup = (left: string[], right: string[]): boolean => left.join('\n') === right.join('\n');

const result = (
  impact: DraftRevisionImpact,
  validationLevel: RevisionValidationLevel,
  seoReviewState: SeoReviewState,
  reasons: string[],
  signals: RevisionSignals,
): DraftRevisionAssessment => ({
  impact,
  validationLevel,
  qualityGateState:
    validationLevel === 'full'
      ? 'stale'
      : validationLevel === 'light'
        ? 'validation_recommended'
        : 'valid',
  seoReviewState,
  reasons,
  signals,
});

export const assessDraftRevision = ({
  previousDraft,
  nextDraft,
  publicationMetadata,
  protectedTargets = [],
}: {
  previousDraft: string;
  nextDraft: string;
  publicationMetadata?: PublicationMetadata | null;
  protectedTargets?: string[];
}): DraftRevisionAssessment => {
  const signals = deriveRevisionSignals({
    previousDraft,
    nextDraft,
    publicationMetadata,
  });
  if (!previousDraft.trim() || !nextDraft.trim()) {
    return result('high_risk_change', 'full', 'stale', ['missing_comparison_draft'], signals);
  }

  const beforeCounts = wordCounts(previousDraft);
  const afterCounts = wordCounts(nextDraft);
  const vocabularyChanged = changedVocabulary(beforeCounts, afterCounts);
  const anchors = seoAnchors(publicationMetadata);
  const changedSeoTerms = [...vocabularyChanged].filter((word) => anchors.has(word));
  const anchorsBefore = [...anchors].filter((word) => (beforeCounts.get(word) ?? 0) > 0);
  const lostAnchors = anchorsBefore.filter((word) => (afterCounts.get(word) ?? 0) === 0);
  const seoReviewState: SeoReviewState =
    lostAnchors.length >= Math.max(2, Math.ceil(Math.max(anchorsBefore.length, 1) * 0.3))
      ? 'stale'
      : changedSeoTerms.length > 0 || headingText(previousDraft).join('\n') !== headingText(nextDraft).join('\n')
        ? 'possibly_stale'
        : 'valid';

  const beforeSignals = signalGroups(previousDraft);
  const afterSignals = signalGroups(nextDraft);
  const highRiskReasons = (Object.keys(beforeSignals) as Array<keyof typeof beforeSignals>)
    .filter((key) => key !== 'entities')
    .filter((key) => !equalGroup(beforeSignals[key], afterSignals[key]))
    .map((key) => `${key}_changed`);
  const changedHighStakesTerm = [...vocabularyChanged].some((word) => HIGH_STAKES_TERMS.has(word));
  if (changedHighStakesTerm) highRiskReasons.push('high_stakes_language_changed');
  if (protectedTargetChanged(previousDraft, nextDraft, protectedTargets)) {
    highRiskReasons.push('reviewed_finding_region_changed');
  }
  if (normalizeCosmeticWhitespace(previousDraft) === normalizeCosmeticWhitespace(nextDraft)) {
    return result('formatting_only', 'none', 'valid', ['whitespace_only'], signals);
  }

  if (highRiskReasons.length === 0 && sameCounts(beforeCounts, afterCounts)) {
    return result('formatting_only', 'none', seoReviewState, ['content_reformatted_or_reordered'], signals);
  }

  if (!equalGroup(beforeSignals.entities, afterSignals.entities)) {
    highRiskReasons.push('entities_changed');
  }
  if (highRiskReasons.length > 0) {
    return result('high_risk_change', 'full', seoReviewState, highRiskReasons, signals);
  }

  const beforeWordCount = [...beforeCounts.values()].reduce((sum, count) => sum + count, 0);
  const afterWordCount = [...afterCounts.values()].reduce((sum, count) => sum + count, 0);
  const changedTermCount = [...vocabularyChanged].reduce(
    (sum, word) => sum + Math.abs((beforeCounts.get(word) ?? 0) - (afterCounts.get(word) ?? 0)),
    0,
  );
  const structureChanged = markdownStructure(previousDraft).join('\n') !== markdownStructure(nextDraft).join('\n');
  const headingChanged = headingText(previousDraft).join('\n') !== headingText(nextDraft).join('\n');
  const sentenceDelta = Math.abs(
    (previousDraft.match(/[.!?](?:\s|$)/gu)?.length ?? 0)
    - (nextDraft.match(/[.!?](?:\s|$)/gu)?.length ?? 0),
  );
  const wordCountDelta = Math.abs(beforeWordCount - afterWordCount);
  const largeAdditionOrRemoval = wordCountDelta > 50
    || (wordCountDelta > 15 && wordCountDelta / Math.max(beforeWordCount, 1) > 0.15);
  if (sentenceDelta > 2 || largeAdditionOrRemoval) {
    return result('high_risk_change', 'full', seoReviewState, ['claim_scope_changed'], signals);
  }

  const lowRiskCopyEdit = !structureChanged
    && !headingChanged
    && changedTermCount <= 6
    && sentenceDelta === 0
    && changedSeoTerms.length === 0;
  if (lowRiskCopyEdit) {
    return result('minor_copy_edit', 'none', 'valid', ['bounded_copy_edit'], signals);
  }

  const editorialReasons = [
    ...(structureChanged ? ['structure_changed'] : []),
    ...(headingChanged ? ['heading_changed'] : []),
    ...(changedSeoTerms.length > 0 ? ['seo_language_changed'] : []),
    ...(sentenceDelta > 0 ? ['sentence_structure_changed'] : []),
    ...(changedTermCount > 6 ? ['broader_editorial_rewrite'] : []),
  ];
  return result(
    'editorial_change',
    'light',
    seoReviewState,
    editorialReasons.length > 0 ? editorialReasons : ['editorial_language_changed'],
    signals,
  );
};
