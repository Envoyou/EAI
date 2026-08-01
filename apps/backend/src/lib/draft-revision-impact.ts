export type DraftRevisionImpact = 'formatting_only' | 'minor_copy_edit' | 'substantive';

type PublicationMetadata = {
  title?: unknown;
  excerpt?: unknown;
  metaTitle?: unknown;
  metaDescription?: unknown;
  tags?: unknown;
};

const SENSITIVE_TERMS = new Set([
  'all', 'always', 'can', 'cannot', 'could', 'every', 'except', 'may', 'must', 'never',
  'no', 'none', 'not', 'only', 'should', 'without',
  'akan', 'bisa', 'bukan', 'dapat', 'harus', 'jangan', 'kecuali', 'mustahil', 'semua',
  'selalu', 'setiap', 'tidak', 'tanpa',
]);

const words = (value: string): string[] =>
  value.normalize('NFKC').match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? [];

const normalizedWords = (value: string): string[] =>
  words(value).map((word) => word.toLocaleLowerCase());

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
      if (heading?.[1]) return `heading:${heading[1].length}:${normalizeCosmeticWhitespace(trimmed)}`;
      if (/^```/.test(trimmed)) return `fence:${trimmed}`;
      if (/^([-*_])\1{2,}$/.test(trimmed)) return 'rule';
      if (trimmed.includes('|')) return 'table';
      if (/^[-+*]\s+/.test(trimmed)) return 'unordered-list';
      if (/^\d+[.)]\s+/.test(trimmed)) return 'ordered-list';
      if (/^>\s?/.test(trimmed)) return 'quote';
      return 'prose';
    });

const protectedSignals = (value: string): string[] => {
  const urls = value.match(/https?:\/\/[^\s)\]]+/giu) ?? [];
  const numbers = value.match(/(?:[$€£¥Rp]\s*)?\d[\d.,:%/-]*/giu) ?? [];
  const sensitive = words(value).filter((word) => SENSITIVE_TERMS.has(word.toLocaleLowerCase()));
  const namedTerms = words(value).filter((word) => /^\p{Lu}[-\p{L}\p{N}'’]*$/u.test(word));
  return [...urls, ...numbers, ...sensitive, ...namedTerms].map((signal) => signal.normalize('NFKC')).sort();
};

const boundedLevenshtein = (left: string[], right: string[], maximum: number): number => {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
  let previous = new Map<number, number>();
  for (let index = 0; index <= Math.min(right.length, maximum); index += 1) {
    previous.set(index, index);
  }

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = new Map<number, number>();
    const start = Math.max(0, leftIndex - maximum);
    const end = Math.min(right.length, leftIndex + maximum);
    if (start === 0) current.set(0, leftIndex);
    for (let rightIndex = Math.max(1, start); rightIndex <= end; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const distance = Math.min(
        (current.get(rightIndex - 1) ?? maximum + 1) + 1,
        (previous.get(rightIndex) ?? maximum + 1) + 1,
        (previous.get(rightIndex - 1) ?? maximum + 1) + substitutionCost,
      );
      if (distance <= maximum) current.set(rightIndex, distance);
    }
    if (current.size === 0) return maximum + 1;
    previous = current;
  }

  return previous.get(right.length) ?? maximum + 1;
};

const metadataText = (metadata: PublicationMetadata | null | undefined): string => {
  if (!metadata) return '';
  const tags = Array.isArray(metadata.tags) ? metadata.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  return [metadata.title, metadata.excerpt, metadata.metaTitle, metadata.metaDescription, ...tags]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
};

const changedVocabulary = (before: string[], after: string[]): Set<string> => {
  const beforeCounts = new Map<string, number>();
  const afterCounts = new Map<string, number>();
  before.forEach((token) => beforeCounts.set(token, (beforeCounts.get(token) ?? 0) + 1));
  after.forEach((token) => afterCounts.set(token, (afterCounts.get(token) ?? 0) + 1));
  return new Set(
    [...new Set([...beforeCounts.keys(), ...afterCounts.keys()])]
      .filter((token) => beforeCounts.get(token) !== afterCounts.get(token)),
  );
};

export const classifyDraftRevisionImpact = ({
  previousDraft,
  nextDraft,
  publicationMetadata,
}: {
  previousDraft: string;
  nextDraft: string;
  publicationMetadata?: PublicationMetadata | null;
}): DraftRevisionImpact => {
  if (!previousDraft.trim() || !nextDraft.trim()) return 'substantive';
  if (markdownStructure(previousDraft).join('\n') !== markdownStructure(nextDraft).join('\n')) {
    return 'substantive';
  }
  if (protectedSignals(previousDraft).join('\n') !== protectedSignals(nextDraft).join('\n')) {
    return 'substantive';
  }
  if (normalizeCosmeticWhitespace(previousDraft) === normalizeCosmeticWhitespace(nextDraft)) {
    return 'formatting_only';
  }

  const previousWords = normalizedWords(previousDraft);
  const nextWords = normalizedWords(nextDraft);
  const baselineWordCount = Math.max(previousWords.length, nextWords.length);
  if (baselineWordCount < 100) return 'substantive';

  const editDistance = boundedLevenshtein(previousWords, nextWords, 2);
  if (editDistance > 2 || editDistance / baselineWordCount > 0.01) return 'substantive';

  const metadataVocabulary = new Set(normalizedWords(metadataText(publicationMetadata)));
  const touchesMetadataVocabulary = [...changedVocabulary(previousWords, nextWords)]
    .some((token) => metadataVocabulary.has(token));
  return touchesMetadataVocabulary ? 'substantive' : 'minor_copy_edit';
};
