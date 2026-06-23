import type { FinalQualityGateOutput } from '@/lib/schema';
import type { AllowedEditorialTerm } from '@/types';

type QualityFeedbackItem = FinalQualityGateOutput['feedback'][number];

const ASCII_TABLE_FENCE_PATTERN = /```[^\n]*\n([\s\S]*?)```/g;
const ASCII_BORDER_PATTERN = /^\s*\+(?:[-=]+\+){1,}\s*$/;
const VERIFICATION_ANNOTATION_PATTERN = /\[(?:Source verification recommended|Citation recommended|Externally sourced claim)[^\]]*\]/i;
const URL_PATTERN = /\bhttps?:\/\/[^\s)\]}]+/gi;
const NUMBER_WITH_CONTEXT_PATTERN =
  /(?:\b24\s*\/\s*7\b|\b\d{1,2}\s*:\s*\d{1,2}\b|\b\d{2,}\s*\/\s*\d{2,}\b|(?:[$€£¥]|Rp|IDR|USD|EUR|GBP)\s?\d[\d.,]*|\b\d[\d.,]*(?:\s*-\s*|\s*)(?:%|persen|percent|juta|miliar|triliun|million|billion|trillion|ribu|thousand|tahun|years?|bulan|months?|hari|days?|jam|hours?|menit|minutes?|detik|seconds?|pengguna|users?|penduduk|residents?|warga|orang|people|unit|kali|times?|gw|mw|tb|pb|km|kg)(?=\s|[*_`]|[.,;:!?)\-–—]|$)|\b(?:puluhan|ratusan|ribuan|jutaan|miliaran|triliunan|dozens|hundreds|thousands|millions|billions|trillions)\s+(?:rupiah|dolar|dollars?|pengguna|users?|penduduk|residents?|warga|orang|people|unit)\b|\b\d{2,}(?:[.,]\d+)?\b)/gi;
const ACRONYM_PATTERN = /\b[A-Z][A-Z0-9-]{2,}\b/g;
const INTERNAL_CAPS_PATTERN = /\b[A-Z][a-z]+[A-Z][A-Za-z0-9]*\b|\b[a-z]+[A-Z][A-Za-z0-9]*\b/g;
const ROLE_LABELED_ENTITY_PATTERN =
  /\*\*([A-Z][\p{L}.-]+(?:\s+[A-Z][\p{L}.-]+){0,3})\s*\((?:CEO|CTO|CFO|COO|Chief|Founder|Co-Founder|President|Professor|Prof\.|Dr\.|PhD|Scientist|Researcher|Investor|Analyst)[^)\n]{0,60}\)\s*:\*\*/gu;
const ATTRIBUTED_ENTITY_PATTERN =
  /\b(?:menurut|kata|ujar|menyatakan|menilai|memperkirakan|according to|said|stated|reported by)\s+([A-Z][\p{L}.-]+(?:\s+[A-Z][\p{L}.-]+){0,3})/gu;
const NUMERIC_RANGE_PATTERN =
  /\b(\d[\d.,]*)\s*(?:-|–|—|hingga|sampai|to)\s*(\d[\d.,]*)\s*(%|persen|percent|juta|miliar|triliun|million|billion|trillion|ribu|thousand|tahun|years?|bulan|months?|hari|days?|jam|hours?)\b/gi;
const ACRONYM_EXPANSION_PATTERN =
  /\b((?:[A-Z][\p{L}-]+|[A-Z]{2,})(?:[ \t]+(?:[A-Z][\p{L}-]+|[A-Z]{2,})){1,7})[ \t]*\(([A-Z][A-Z0-9-]{1,9})\)/gu;
const UNSUPPORTED_MOTIVE_PATTERN =
  /\b(?:didorong oleh|demi|karena kebutuhan untuk|kebutuhan untuk|untuk)\s+(?:menjaga|memvalidasi|menaikkan|mendongkrak|melindungi|mempertahankan)\s+(?:valuasi|harga saham|reputasi|kepentingan|pendanaan|aliran pendanaan)|\b(?:instrumen|strategi)\s+(?:pemasaran|penggalangan dana|valuasi)\b|\b(?:memiliki|punya)\s+(?:kepentingan|insentif)\s+(?:langsung\s+)?(?:pada|dalam|untuk)\s+(?:valuasi|harga saham|investasi|pendanaan|rekrutmen)/gi;
const GENERIC_PROPER_NAMES = new Set([
  'AGI',
  'AI',
  'Bahasa Indonesia',
  'CEO',
  'CFO',
  'COO',
  'CTO',
  'CTR',
  'Draft Final',
  'Envoyou',
  'GDP',
  'Gen X',
  'Gen Y',
  'Gen Z',
  'HR',
  'HRD',
  'IT',
  'LLM',
  'Markdown GFM',
  'PDB',
  'UI',
  'UX',
]);

export interface SourceFidelityOptions {
  trustedInternalUrls?: string[];
  trustedInternalDomains?: string[];
  trustedEntities?: string[];
  allowedEditorialTerms?: AllowedEditorialTerm[];
  language?: 'id' | 'en';
}

const getCurrentEditorialYear = () => {
  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  }).format(new Date());
  return year;
};

const getCurrentEditorialHalf = (lang: 'id' | 'en' = 'id') => {
  const month = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    month: 'numeric',
  }).format(new Date()));
  if (lang === 'en') {
    return month <= 6 ? 'first half' : 'second half';
  }
  return month <= 6 ? 'paruh pertama' : 'paruh kedua';
};

export const detectTemporalPhaseMismatch = (text: string) => {
  const currentYear = getCurrentEditorialYear();
  
  // Check Indonesian
  const currentHalfId = getCurrentEditorialHalf('id');
  const mismatchedHalfId = currentHalfId === 'paruh pertama' ? 'paruh kedua' : 'paruh pertama';
  const patternId = new RegExp(
    `\\b${mismatchedHalfId}\\s+(?:tahun\\s+)?${currentYear}\\b`,
    'gi'
  );
  
  // Check English
  const currentHalfEn = getCurrentEditorialHalf('en');
  const mismatchedHalfEn = currentHalfEn === 'first half' ? 'second half' : 'first half';
  const patternEn = new RegExp(
    `\\b${mismatchedHalfEn}\\s+(?:of\\s+)?${currentYear}\\b`,
    'gi'
  );

  const matchesId = Array.from(text.matchAll(patternId), (match) => match[0]);
  const matchesEn = Array.from(text.matchAll(patternEn), (match) => match[0]);

  return [...matchesId, ...matchesEn];
};

const isPermittedTemporalOrientation = (
  text: string,
  matchIndex: number,
  year: string
) => {
  const context = text
    .slice(Math.max(0, matchIndex - 90), matchIndex + year.length + 30)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const escapedYear = year.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return [
    new RegExp(`(?:kini|saat ini|sekarang|memasuki)\\s+(?:kita\\s+)?(?:sedang\\s+)?(?:berada(?:\\s+di)?|memasuki)?\\s*(?:awal|pertengahan|akhir|paruh pertama|paruh kedua)?\\s*(?:tahun\\s+)?${escapedYear}`),
    new RegExp(`(?:hingga|sejauh)\\s+(?:saat ini|kini|paruh pertama|paruh kedua|awal|pertengahan|akhir)?\\s*(?:tahun\\s+)?${escapedYear}(?:\\s+ini)?`),
    new RegExp(`(?:awal|pertengahan|akhir|paruh pertama|paruh kedua)\\s+(?:tahun\\s+)?${escapedYear}\\s+ini`),
  ].some((pattern) => pattern.test(context));
};

const parseAsciiRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const escapeMarkdownCell = (value: string) =>
  value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

const convertAsciiTableBlock = (block: string) => {
  const lines = block.split('\n').map((line) => line.trimEnd());
  if (!lines.some((line) => ASCII_BORDER_PATTERN.test(line))) return null;

  const physicalRows = lines
    .filter((line) => /^\s*\|.*\|\s*$/.test(line))
    .map(parseAsciiRow);
  if (physicalRows.length < 2) return null;

  const columnCount = Math.max(...physicalRows.map((row) => row.length));
  const firstFullRowIndex = physicalRows.findIndex((row) => row.length === columnCount);
  const tabularRows = firstFullRowIndex > 0
    ? physicalRows.slice(firstFullRowIndex)
    : physicalRows;
  const rows: string[][] = [];

  tabularRows.forEach((physicalRow, index) => {
    const normalizedRow = Array.from(
      { length: columnCount },
      (_, columnIndex) => escapeMarkdownCell(physicalRow[columnIndex] ?? '')
    );
    const firstCell = normalizedRow[0];

    if (index === 0 || firstCell || rows.length === 0) {
      rows.push(normalizedRow);
      return;
    }

    const previousRow = rows[rows.length - 1];
    normalizedRow.forEach((cell, columnIndex) => {
      if (!cell) return;
      previousRow[columnIndex] = [previousRow[columnIndex], cell].filter(Boolean).join(' ');
    });
  });

  const [header, ...body] = rows;
  if (!header || body.length === 0) return null;
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
};

export const convertAsciiTablesToMarkdown = (text: string) =>
  text.replace(ASCII_TABLE_FENCE_PATTERN, (fullMatch, block: string) =>
    convertAsciiTableBlock(block) ?? fullMatch
  );

export const stripVerificationMarkers = (text: string) =>
  text
    .replace(/\[(?:Source verification recommended|Citation recommended|Externally sourced claim)[^\]]*\]\.?/gi, '')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const cleanupEscapedMarkdownArtifacts = (text: string) =>
  text
    .replace(/\\(["'])/g, '$1')
    .replace(/\\([*_`[\](){}])/g, '$1')
    .replace(/\b(\d+)\s+bawah\s+terakhir\b/gi, '$1 bulan terakhir');

export const hasAsciiTable = (text: string) =>
  /```[^\n]*\n[\s\S]*?^\s*\+(?:[-=]+\+){1,}\s*$[\s\S]*?```/m.test(text);

export const hasMalformedMarkdownTable = (text: string) => {
  const lines = text.split('\n');

  for (let index = 0; index < lines.length - 1; index++) {
    const header = lines[index];
    const separator = lines[index + 1];
    if (!header.includes('|') || !/^\s*\|?(?:\s*:?-{3,}:?\s*\|){1,}\s*:?-{3,}:?\s*\|?\s*$/.test(separator)) {
      continue;
    }

    const expectedColumns = parseAsciiRow(header).length;
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex++) {
      const row = lines[rowIndex];
      if (!row.trim() || !row.includes('|')) break;

      const cells = parseAsciiRow(row);
      if (cells.length !== expectedColumns) return true;
      if (!cells[0] || /^\([^)\n]{1,40}\)$/.test(cells[0])) return true;
    }
  }

  return false;
};

const normalizeFlag = (flag: string) =>
  flag
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const findSentenceContaining = (text: string, searchStr: string): string | undefined => {
  if (!searchStr?.trim()) return undefined;
  const sentences = text.split(/(?<=[.!?])(?:\s+|\n+)/);
  return sentences.find(sentence => sentence.toLowerCase().includes(searchStr.toLowerCase()))?.trim();
};

const BENIGN_FLAG_PATTERN =
  /^(?:markdown table detected|temporal context \d{4}|none|n\/a|all clear|no (?:factual )?(?:risks?|issues?|critical flags?)(?: (?:were )?found)?\b.*|tidak ada (?:risiko|masalah|pelanggaran|flag|temuan)\b.*)$/i;

const FRAMEWORK_EXPRESSION_PATTERN = /^(?:24\s?jam|72\s?jam|48\s?jam|30\s?hari|7\s?hari|21\s?hari|10\s?detik|5\s?menit|24-hour|30-day|7-day|21-day|10-second|5-minute|aturan|rule|challenge)$/i;
const FRAMEWORK_CONTEXT_PATTERN = /\b(?:jeda|tunda|aturan|rule|rules|metode|method|challenge|tantangan|formula|kebiasaan|habit|sistem|langkah|biasakan|wajib|menunggu|delay)\b/i;

const isFrameworkOrMethodNumber = (numberStr: string, text: string): boolean => {
  if (FRAMEWORK_EXPRESSION_PATTERN.test(numberStr)) return true;
  const index = text.toLowerCase().indexOf(numberStr.toLowerCase());
  if (index === -1) return false;
  const contextWindow = text.slice(Math.max(0, index - 50), Math.min(text.length, index + numberStr.length + 50));
  return FRAMEWORK_CONTEXT_PATTERN.test(contextWindow);
};

const FACTUAL_CLAIM_TRIGGER_PATTERN =
  /\b(?:meningkat|menurun|terbukti|hasil|studi|penelitian|riset|survei|data|statistik|menunjukkan|membuktikan|laporan|tercatat|dilaporkan|mencapai|sebanyak|sejumlah|increased|decreased|proven|study|research|survey|reported|recorded|reached)\b/i;

const isAllowlistedTermInFactualContext = (term: string, text: string): boolean => {
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1) return false;
  const contextWindow = text.slice(
    Math.max(0, index - 80),
    Math.min(text.length, index + term.length + 80)
  );
  return FACTUAL_CLAIM_TRIGGER_PATTERN.test(contextWindow);
};

const buildAllowlistSet = (
  terms: AllowedEditorialTerm[],
  normalizer: (value: string) => string = normalizeComparableText
): Set<string> => {
  return new Set(terms.map((term) => normalizer(term.value)));
};

const filterByAllowlist = (
  novelValues: string[],
  allowlistSet: Set<string>,
  fullText: string,
  normalizer: (value: string) => string = normalizeComparableText
): string[] => {
  if (allowlistSet.size === 0) return novelValues;
  return novelValues.filter((value) => {
    const normalized = normalizer(value);
    if (!allowlistSet.has(normalized)) return true;
    // If it's on the allowlist but used in a factual-claim context, still flag it
    return isAllowlistedTermInFactualContext(value, fullText);
  });
};

const normalizeComparableText = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[*_`#()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeNumericSignal = (value: string) => {
  const normalized = normalizeComparableText(value)
    .replace(/\b24\s*\/\s*7\b/g, '24 jam')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*-\s*/g, '-')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\b(persen|percent)\b/g, '%')
    .replace(/\s*%\s*/g, '%')
    .replace(/\b(rp|idr)\b/g, 'idr')
    .replace(/\b(usd|\$)\b/g, 'usd')
    .replace(/\b(eur|€)\b/g, 'eur')
    .replace(/\b(gbp|£)\b/g, 'gbp')
    .replace(/\b(years?|tahun)\b/g, 'tahun')
    .replace(/\b(months?|bulan)\b/g, 'bulan')
    .replace(/\b(days?|hari)\b/g, 'hari')
    .replace(/\b(hours?|jam)\b/g, 'jam')
    .replace(/\b(minutes?|menit)\b/g, 'menit')
    .replace(/\b(seconds?|detik)\b/g, 'detik')
    .replace(/\b(million|juta)\b/g, 'juta')
    .replace(/\b(billion|miliar)\b/g, 'miliar')
    .replace(/\b(trillion|triliun)\b/g, 'triliun')
    .replace(/\b(thousand|ribu)\b/g, 'ribu')
    .replace(/\b(penduduk|residents?|warga|pengguna|users?|orang|people)\b/g, 'orang')
    .replace(/\b(jutaan|millions)\s+\p{L}+\b/gu, 'jutaan')
    .replace(/\b(miliaran|billions)\s+\p{L}+\b/gu, 'miliaran')
    .replace(/\b(triliunan|trillions)\s+\p{L}+\b/gu, 'triliunan')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized;
};

const isStandardAspectRatio = (value: string, text: string) => {
  if (!/^\d{1,2}\s*:\s*\d{1,2}$/.test(value)) return false;
  const index = text.indexOf(value);
  if (index === -1) return false;
  const context = text.slice(
    Math.max(0, index - 60),
    Math.min(text.length, index + value.length + 60)
  );
  return /\b(?:aspect ratio|rasio aspek|vertical|vertikal|horizontal|landscape|portrait)\b/i.test(context);
};

const collectMatches = (text: string, pattern: RegExp) =>
  Array.from(text.matchAll(pattern), (match) => match[0].trim());

const collectCapturedMatches = (text: string, pattern: RegExp) =>
  Array.from(text.matchAll(pattern), (match) => match[1]?.trim()).filter(Boolean);

const collectNumericSignals = (
  text: string,
  options: { permitCurrentTemporalOrientation?: boolean } = {}
) => {
  const currentYear = getCurrentEditorialYear();
  const signals = Array.from(text.matchAll(NUMBER_WITH_CONTEXT_PATTERN))
    .filter((match) =>
      !options.permitCurrentTemporalOrientation
      || match[0] !== currentYear
      || !isPermittedTemporalOrientation(text, match.index, currentYear)
    )
    .map((match) => match[0].trim().replace(/[.,;:!?]+$/, ''));
  for (const match of text.matchAll(NUMERIC_RANGE_PATTERN)) {
    const [, start, end, unit] = match;
    signals.push(`${start} ${unit}`, `${end} ${unit}`);
  }
  return signals;
};

const collectEntityCandidates = (text: string) => [
  ...collectMatches(text, ACRONYM_PATTERN),
  ...collectMatches(text, INTERNAL_CAPS_PATTERN),
  ...collectCapturedMatches(text, ROLE_LABELED_ENTITY_PATTERN),
  ...collectCapturedMatches(text, ATTRIBUTED_ENTITY_PATTERN),
];

const uniqueNovelValues = (
  finalValues: string[],
  sourceValues: string[],
  ignoredValues: Set<string> = new Set(),
  normalizer: (value: string) => string = normalizeComparableText
) => {
  const sourceSet = new Set(sourceValues.map(normalizer));
  const ignoredSet = new Set(Array.from(ignoredValues, normalizer));

  return Array.from(new Set(finalValues))
    .filter((value) => {
      const normalized = normalizer(value);
      return normalized && !sourceSet.has(normalized) && !ignoredSet.has(normalized);
    });
};

const isAcronymExplainedBySource = (acronym: string, sourceText: string) => {
  if (!/^[A-Z][A-Z0-9-]{2,}$/.test(acronym)) return false;
  const letters = acronym.replace(/[^A-Z]/g, '');
  if (letters.length < 2) return false;

  const words = (sourceText.match(/\b[\p{L}][\p{L}'’-]*\b/gu) ?? [])
    .flatMap((word) => word.split(/[-–—]/).filter(Boolean));
  for (let index = 0; index <= words.length - letters.length; index++) {
    const initials = words
      .slice(index, index + letters.length)
      .map((word) => word[0]?.toUpperCase())
      .join('');
    if (initials === letters) return true;
  }
  return false;
};

export interface SourceFidelitySignals {
  novelNumbers: string[];
  novelUrls: string[];
  novelEntities: string[];
}

export interface AcronymExpansionDrift {
  acronym: string;
  sourceExpansion: string;
  finalExpansion: string;
}

const collectAcronymExpansions = (text: string) => {
  const expansions = new Map<string, string>();
  for (const match of text.matchAll(ACRONYM_EXPANSION_PATTERN)) {
    const [, expansion, acronym] = match;
    const words = expansion.trim().split(/[ \t]+/);
    const acronymLetters = acronym.replace(/[^A-Z]/g, '');
    const matchingSuffix = words.findIndex((_, index) =>
      words
        .slice(index)
        .map((word) => word[0]?.toUpperCase())
        .join('') === acronymLetters
    );
    if (matchingSuffix >= 0) {
      expansions.set(acronym, words.slice(matchingSuffix).join(' '));
    }
  }
  return expansions;
};

export const detectAcronymExpansionDrift = (
  originalDraft: string,
  finalDraft: string
): AcronymExpansionDrift[] => {
  const sourceExpansions = collectAcronymExpansions(originalDraft);
  const finalExpansions = collectAcronymExpansions(finalDraft);

  return Array.from(finalExpansions.entries()).flatMap(([acronym, finalExpansion]) => {
    const sourceExpansion = sourceExpansions.get(acronym);
    if (!sourceExpansion) return [];
    if (normalizeComparableText(sourceExpansion) === normalizeComparableText(finalExpansion)) return [];
    return [{ acronym, sourceExpansion, finalExpansion }];
  });
};

export const detectUnsupportedMotiveClaims = (
  originalDraft: string,
  finalDraft: string
) => {
  const sourceClaims = new Set(
    collectMatches(originalDraft, UNSUPPORTED_MOTIVE_PATTERN).map(normalizeComparableText)
  );
  return collectMatches(finalDraft, UNSUPPORTED_MOTIVE_PATTERN)
    .filter((claim) => !sourceClaims.has(normalizeComparableText(claim)));
};

const collectUnsupportedMotiveContexts = (
  originalDraft: string,
  finalDraft: string
) => {
  const unsupportedClaims = new Set(
    detectUnsupportedMotiveClaims(originalDraft, finalDraft).map(normalizeComparableText)
  );
  if (unsupportedClaims.size === 0) return [];

  return finalDraft
    .split(/(?<=[.!?])(?:\s+|\n+)|\n{2,}/u)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter((segment) => {
      const normalizedSegment = normalizeComparableText(segment);
      return Array.from(unsupportedClaims).some((claim) => normalizedSegment.includes(claim));
    })
    .filter((segment, index, segments) =>
      segments.findIndex((candidate) =>
        normalizeComparableText(candidate) === normalizeComparableText(segment)
      ) === index
    );
};

export const detectSourceFidelitySignals = (
  originalDraft: string,
  finalDraft: string,
  options: SourceFidelityOptions = {}
): SourceFidelitySignals => {
  const sourceUrls = collectMatches(originalDraft, URL_PATTERN).map((url) => url.replace(/[.,;:!?]+$/, ''));
  const finalUrls = collectMatches(finalDraft, URL_PATTERN).map((url) => url.replace(/[.,;:!?]+$/, ''));

  const originalWithoutUrls = originalDraft.replace(URL_PATTERN, '');
  const finalWithoutUrls = finalDraft.replace(URL_PATTERN, '');

  const sourceNumbers = collectNumericSignals(originalWithoutUrls);
  const finalNumbers = collectNumericSignals(finalWithoutUrls, {
    permitCurrentTemporalOrientation: true,
  });
  const sourceEntities = collectEntityCandidates(originalWithoutUrls);
  const finalEntities = collectEntityCandidates(finalWithoutUrls);
  const trustedInternalUrls = new Set(
    (options.trustedInternalUrls ?? []).map((url) => url.replace(/[.,;:!?]+$/, ''))
  );
  const trustedEntities = new Set([
    ...GENERIC_PROPER_NAMES,
    ...(options.trustedEntities ?? []),
  ]);

  const allowedTerms = options.allowedEditorialTerms ?? [];
  const numericAllowlistSet = buildAllowlistSet(
    allowedTerms.filter((t) => t.type === 'duration' || t.type === 'framework'),
    normalizeNumericSignal
  );
  const entityAllowlistSet = buildAllowlistSet(
    allowedTerms.filter((t) => t.type === 'abbreviation' || t.type === 'brand_term'),
    normalizeComparableText
  );

  const rawNovelNumbers = uniqueNovelValues(
    finalNumbers,
    sourceNumbers,
    new Set(),
    normalizeNumericSignal
  ).filter((value) => !isStandardAspectRatio(value, finalDraft));
  const rawNovelEntities = uniqueNovelValues(finalEntities, sourceEntities, trustedEntities)
    .filter((entity) => !isAcronymExplainedBySource(entity, originalDraft));

  return {
    novelNumbers: filterByAllowlist(rawNovelNumbers, numericAllowlistSet, finalDraft, normalizeNumericSignal),
    novelUrls: uniqueNovelValues(finalUrls, sourceUrls, trustedInternalUrls),
    novelEntities: filterByAllowlist(rawNovelEntities, entityAllowlistSet, finalDraft, normalizeComparableText),
  };
};

const formatSignalList = (signals: string[], limit = 3) =>
  signals.slice(0, limit).map((signal) => `"${signal}"`).join(', ');

const normalizeFeedbackText = (value?: string) =>
  (value ?? '')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, '$1')
    .replace(VERIFICATION_ANNOTATION_PATTERN, '')
    .replace(URL_PATTERN, '')
    .replace(/[*_`#>\[\]()]/g, ' ')
    .replace(/[^\p{L}\p{N}%$€£¥]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const getFeedbackTargetKey = (item: QualityFeedbackItem) => {
  const normalizedTarget = normalizeFeedbackText(item.targetText);
  if (normalizedTarget.length >= 24) return `target:${normalizedTarget}`;

  const normalizedMessage = normalizeFeedbackText(item.message);
  return `message:${item.category.toLowerCase()}:${normalizedMessage}`;
};

const getFeedbackPriority = (item: QualityFeedbackItem) => {
  const statusScore = item.status === 'fail' ? 30 : item.status === 'warning' ? 20 : 10;
  const verificationScore =
    item.verificationStatus === 'high_risk_factual_claim' ? 8 :
    item.verificationStatus === 'needs_citation' ? 5 :
    item.verificationStatus === 'source_backed' ? 3 : 0;
  const sourceVerificationPenalty = item.category.toLowerCase() === 'source verification' ? -4 : 0;
  const targetScore = item.targetText?.trim() ? 2 : 0;
  return statusScore + verificationScore + sourceVerificationPenalty + targetScore;
};

const shouldMergeTargetDuplicate = (first: QualityFeedbackItem, second: QualityFeedbackItem) => {
  const firstIsVerification = Boolean(first.verificationStatus) || first.category.toLowerCase() === 'source verification';
  const secondIsVerification = Boolean(second.verificationStatus) || second.category.toLowerCase() === 'source verification';
  const includesGenericVerification =
    first.category.toLowerCase() === 'source verification'
    || second.category.toLowerCase() === 'source verification';
  return firstIsVerification
    && secondIsVerification
    && includesGenericVerification;
};

const uniqueFeedback = (feedback: QualityFeedbackItem[]) => {
  const byExactMessage = new Set<string>();
  const byTarget = new Map<string, QualityFeedbackItem>();
  const orderedKeys: string[] = [];

  feedback.forEach((item) => {
    const exactMessageKey = `${item.category}:${normalizeFeedbackText(item.message)}`;
    if (byExactMessage.has(exactMessageKey)) return;
    byExactMessage.add(exactMessageKey);

    const targetKey = getFeedbackTargetKey(item);
    const existing = byTarget.get(targetKey);
    if (!existing) {
      byTarget.set(targetKey, item);
      orderedKeys.push(targetKey);
      return;
    }

    if (shouldMergeTargetDuplicate(existing, item)) {
      if (getFeedbackPriority(item) > getFeedbackPriority(existing)) {
        byTarget.set(targetKey, item);
      }
      return;
    }

    const detailKey = `${targetKey}:detail:${item.category.toLowerCase()}:${normalizeFeedbackText(item.message)}`;
    const existingDetail = byTarget.get(detailKey);
    if (!existingDetail) {
      byTarget.set(detailKey, item);
      orderedKeys.push(detailKey);
    } else if (getFeedbackPriority(item) > getFeedbackPriority(existingDetail)) {
      byTarget.set(detailKey, item);
    }
  });

  return orderedKeys
    .map((key) => byTarget.get(key))
    .filter((item): item is QualityFeedbackItem => Boolean(item));
};

export const applyDeterministicQualityChecks = (
  result: FinalQualityGateOutput,
  finalDraft: string,
  originalDraft: string = '',
  options: SourceFidelityOptions = {}
): FinalQualityGateOutput => {
  const isEn = options.language === 'en';
  let feedback = result.feedback.filter((item) => item.status !== 'pass');
  let readiness = result.readiness;
  const trustedInternalUrls = (options.trustedInternalUrls ?? [])
    .map((url) => url.replace(/[.,;:!?]+$/, ''));
  const trustedInternalDomains = new Set(
    (options.trustedInternalDomains ?? [])
      .map((domain) => domain.trim().toLowerCase().replace(/^www\./, ''))
      .filter(Boolean)
  );
  if (trustedInternalUrls.length > 0) {
    feedback = feedback.filter((item) => {
      const combined = [
        item.category,
        item.message,
        item.suggestion,
        item.reason,
        item.targetText,
      ].filter(Boolean).join(' ');
      const mentionsTrustedUrl = trustedInternalUrls.some((url) => combined.includes(url));
      const onlyInternalLinkConcern = /internal link|tautan internal/i.test(combined)
        && !/angka|nominal|tanggal|entitas|klaim|atribusi|sebab-akibat/i.test(combined);
      return !mentionsTrustedUrl && !onlyInternalLinkConcern;
    });
  }
  let flags = result.flags
    .map(normalizeFlag)
    .filter((flag) => !BENIGN_FLAG_PATTERN.test(flag));

  if (hasAsciiTable(finalDraft)) {
    readiness = readiness === 'ready' ? 'needs_review' : readiness;
    feedback.unshift({
      category: 'CMS Formatting',
      status: 'fail',
      message: isEn
        ? 'The final draft still contains an ASCII table inside a code block instead of a GFM Markdown table.'
        : 'Draft final masih memuat tabel ASCII di dalam code block, bukan tabel Markdown GFM.',
      suggestion: isEn
        ? 'Convert the table to a GFM Markdown table before exporting to the CMS.'
        : 'Ubah tabel menjadi tabel Markdown GFM sebelum ekspor ke CMS.',
      operation: 'manual',
    });
    flags.push('Invalid ASCII Table');
  }

  if (hasMalformedMarkdownTable(finalDraft)) {
    readiness = readiness === 'ready' ? 'needs_review' : readiness;
    feedback.unshift({
      category: 'CMS Formatting',
      status: 'fail',
      message: isEn
        ? 'The Markdown table has continuation lines or inconsistent column counts that risk rendering incorrectly.'
        : 'Tabel Markdown memiliki baris lanjutan atau jumlah kolom yang tidak konsisten sehingga berisiko rusak saat dirender.',
      suggestion: isEn
        ? 'Merge each entry into a single complete table row, or convert the table to a bulleted list if the content is too long.'
        : 'Satukan setiap entri menjadi satu baris tabel yang utuh, atau ubah tabel menjadi bullet list jika isinya terlalu panjang.',
      operation: 'manual',
    });
    flags.push('Malformed Markdown Table');
  }

  const temporalPhaseMismatch = detectTemporalPhaseMismatch(finalDraft);
  if (temporalPhaseMismatch.length > 0) {
    readiness = readiness === 'ready' ? 'needs_review' : readiness;
    feedback.unshift({
      category: 'Temporal Accuracy',
      status: 'fail',
      message: isEn
        ? `The draft mentions "${temporalPhaseMismatch[0]}", even though the current editorial date is still in the ${getCurrentEditorialHalf('en')} of ${getCurrentEditorialYear()}.`
        : `Draft menyebut "${temporalPhaseMismatch[0]}", padahal tanggal editorial saat ini masih berada pada ${getCurrentEditorialHalf()} ${getCurrentEditorialYear()}.`,
      suggestion: isEn
        ? `Use "${getCurrentEditorialHalf('en')} ${getCurrentEditorialYear()}" or a neutral time orientation like "to date".`
        : `Gunakan "${getCurrentEditorialHalf()} ${getCurrentEditorialYear()}" atau orientasi netral seperti "hingga saat ini".`,
      operation: 'manual',
    });
    flags.push('Temporal Phase Mismatch');
  }

  if (VERIFICATION_ANNOTATION_PATTERN.test(finalDraft)) {
    readiness = readiness === 'ready' ? 'needs_review' : readiness;
    feedback = feedback.filter((item) =>
      item.category.toLowerCase() !== 'source verification'
      && !/source verification recommended|annotation verifikasi/i.test(item.message)
    );
    const match = finalDraft.match(VERIFICATION_ANNOTATION_PATTERN);
    const annotationText = match ? match[0] : '';
    feedback.push({
      category: 'Source Verification',
      status: 'warning',
      verificationStatus: 'needs_citation',
      message: isEn
        ? 'The pipeline detected claims that still require an editor verification decision.'
        : 'Pipeline mendeteksi klaim yang masih memerlukan keputusan verifikasi editor.',
      suggestion: isEn
        ? 'Verify the flagged sources on the refinement report before publication. Internal markers have been removed from the publication draft.'
        : 'Verifikasi sumber yang ditandai pada refinement report sebelum publikasi. Marker internal telah dihapus dari draft publikasi.',
      operation: 'manual',
      targetText: annotationText ? findSentenceContaining(finalDraft, annotationText) : undefined,
    });
    flags.push('Source Verification Pending');
  }

  const acronymExpansionDrift = detectAcronymExpansionDrift(originalDraft, finalDraft);
  if (acronymExpansionDrift.length > 0) {
    readiness = readiness === 'ready' ? 'needs_review' : readiness;
    const example = acronymExpansionDrift[0];
    feedback.push({
      category: 'Terminology',
      status: 'fail',
      message: isEn
        ? `The expansion of ${example.acronym} changed from "${example.sourceExpansion}" to "${example.finalExpansion}".`
        : `Kepanjangan ${example.acronym} berubah dari "${example.sourceExpansion}" menjadi "${example.finalExpansion}".`,
      suggestion: isEn
        ? `Restore the source term to "${example.sourceExpansion} (${example.acronym})".`
        : `Pulihkan istilah sumber menjadi "${example.sourceExpansion} (${example.acronym})".`,
      operation: 'manual',
    });
    flags.push('Acronym Expansion Drift');
  }

  const unsupportedMotiveClaims = detectUnsupportedMotiveClaims(originalDraft, finalDraft);
  if (unsupportedMotiveClaims.length > 0) {
    readiness = readiness === 'ready' ? 'needs_review' : readiness;
    const motiveContexts = collectUnsupportedMotiveContexts(originalDraft, finalDraft);
    const motiveSummary = motiveContexts.length > 0
      ? motiveContexts.slice(0, 2).map((context) => `"${context}"`).join(' ')
      : formatSignalList(unsupportedMotiveClaims);
    feedback.push({
      category: 'Source Fidelity',
      status: 'fail',
      message: isEn
        ? `The final draft adds a motive or interest attribution not stated by the source: ${motiveSummary}`
        : `Draft final menambahkan atribusi motif atau kepentingan yang tidak dinyatakan sumber: ${motiveSummary}`,
      suggestion: isEn
        ? 'Remove this specific attribution, support it with a verifiable source, or convert it to a general observation that does not claim motives for people or organizations.'
        : 'Hapus atribusi spesifik tersebut, dukung dengan sumber yang dapat diverifikasi, atau ubah menjadi observasi umum yang tidak mengklaim motif tokoh maupun organisasi.',
      operation: 'manual',
      targetText: motiveContexts[0],
    });
    flags.push('Unsupported Motive Attribution');
  }

  const sourceFidelitySignals = detectSourceFidelitySignals(originalDraft, finalDraft, options);
  const hasSourceFidelitySignals =
    sourceFidelitySignals.novelNumbers.length > 0
    || sourceFidelitySignals.novelEntities.length > 0
    || sourceFidelitySignals.novelUrls.length > 0;
  if (hasSourceFidelitySignals) {
    flags = flags.filter((flag) => flag !== 'Source Fidelity Review');
  }

  if (sourceFidelitySignals.novelNumbers.length > 0) {
    const factualNovelNumbers: string[] = [];
    const frameworkNovelNumbers: string[] = [];

    sourceFidelitySignals.novelNumbers.forEach((num) => {
      if (isFrameworkOrMethodNumber(num, finalDraft)) {
        frameworkNovelNumbers.push(num);
      } else {
        factualNovelNumbers.push(num);
      }
    });

    if (factualNovelNumbers.length > 0) {
      readiness = readiness === 'ready' ? 'needs_review' : readiness;
      feedback.push({
        category: 'Source Fidelity',
        status: 'fail',
        verificationStatus: 'needs_citation',
        message: isEn
          ? `The final draft adds numbers or measurements not found in the source draft: ${formatSignalList(factualNovelNumbers)}.`
          : `Draft final menambahkan angka atau ukuran yang tidak ditemukan pada draft sumber: ${formatSignalList(factualNovelNumbers)}.`,
        suggestion: isEn
          ? 'Restore the values from the source draft, provide a verifiable source, or remove these numbers and measurements. Editorial analysis labels are not sufficient to justify new numbers.'
          : 'Pulihkan nilai dari draft sumber, sertakan sumber yang dapat diverifikasi, atau hapus angka dan ukuran tersebut. Label analisis editorial tidak cukup untuk membenarkan angka baru.',
        operation: 'manual',
        targetText: findSentenceContaining(finalDraft, factualNovelNumbers[0]),
      });
      flags.push('Unsupported Quantitative Claim');
    }

    if (frameworkNovelNumbers.length > 0) {
      feedback.push({
        category: 'Editorial Addition',
        status: 'warning',
        message: isEn
          ? `The final draft adds a new framework, method, or rule of thumb not found in the source draft: ${formatSignalList(frameworkNovelNumbers)}.`
          : `Draft final menambahkan framework, metode, atau aturan praktis baru yang tidak ditemukan pada draf sumber: ${formatSignalList(frameworkNovelNumbers)}.`,
        suggestion: isEn
          ? 'Ensure this method or rule of thumb aligns with the brand\'s editorial policy and is relevant to readers, or consider simplifying it.'
          : 'Pastikan metode atau aturan praktis ini sesuai dengan kebijakan editorial brand dan relevan bagi pembaca, atau pertimbangkan untuk menyederhanakannya.',
        operation: 'manual',
        targetText: findSentenceContaining(finalDraft, frameworkNovelNumbers[0]),
      });
      flags.push('Editorial Framework Added');
    }
  }

  if (sourceFidelitySignals.novelEntities.length > 0) {
    readiness = readiness === 'ready' ? 'needs_review' : readiness;
    feedback.push({
      category: 'Source Fidelity',
      status: 'warning',
      verificationStatus: 'needs_citation',
      message: isEn
        ? `The final draft adds entities or identity attributes not found in the source draft: ${formatSignalList(sourceFidelitySignals.novelEntities)}.`
        : `Draft final menambahkan entitas atau atribut identitas yang tidak ditemukan pada draft sumber: ${formatSignalList(sourceFidelitySignals.novelEntities)}.`,
      suggestion: isEn
        ? 'Verify these details with supporting sources or remove unnecessary attributes from the final draft.'
        : 'Verifikasi detail tersebut dengan sumber pendukung atau hapus atribut yang tidak diperlukan dari draft final.',
      operation: 'manual',
      targetText: findSentenceContaining(finalDraft, sourceFidelitySignals.novelEntities[0]),
    });
    flags.push('Unsupported Entity Detail');
  }

  if (sourceFidelitySignals.novelUrls.length > 0) {
    const internalUrls: string[] = [];
    const externalUrls: string[] = [];
    sourceFidelitySignals.novelUrls.forEach((url) => {
      try {
        const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        if (trustedInternalDomains.has(hostname)) {
          internalUrls.push(url);
        } else {
          externalUrls.push(url);
        }
      } catch {
        externalUrls.push(url);
      }
    });

    readiness = readiness === 'ready' ? 'needs_review' : readiness;
    if (internalUrls.length > 0) {
      feedback.push({
        category: 'Internal Linking',
        status: 'warning',
        message: isEn
          ? `The final draft uses an internal-domain URL that does not exactly match the verified article catalog: ${formatSignalList(internalUrls, 2)}.`
          : `Draft final memakai URL domain internal yang tidak sama persis dengan katalog artikel terverifikasi: ${formatSignalList(internalUrls, 2)}.`,
        suggestion: isEn
          ? 'Replace it with the exact catalog URL, confirm it as an editorial exception, or remove the link.'
          : 'Ganti dengan URL katalog yang tepat, konfirmasi sebagai pengecualian editorial, atau hapus tautannya.',
        operation: 'manual',
        targetText: findSentenceContaining(finalDraft, internalUrls[0]),
      });
      flags.push('Internal Link Review');
    }
    if (externalUrls.length > 0) {
      feedback.push({
        category: 'Source Fidelity',
        status: 'warning',
        verificationStatus: 'needs_citation',
        message: isEn
          ? `The final draft adds external URLs not available in the source draft: ${formatSignalList(externalUrls, 2)}.`
          : `Draft final menambahkan URL eksternal yang tidak tersedia pada draft sumber: ${formatSignalList(externalUrls, 2)}.`,
        suggestion: isEn
          ? 'Ensure the URL comes from a trusted and relevant source before publication, or remove the link.'
          : 'Pastikan URL berasal dari sumber tepercaya dan relevan sebelum publikasi, atau hapus tautan tersebut.',
        operation: 'manual',
        targetText: findSentenceContaining(finalDraft, externalUrls[0]),
      });
      flags.push('External URL Review');
    }
  }

  if (!hasSourceFidelitySignals
    && !feedback.some((item) => item.category.toLowerCase() === 'source fidelity')) {
    flags = flags.filter((flag) => flag !== 'Source Fidelity Review');
  }

  const finalFeedback = uniqueFeedback(feedback).slice(0, 5);
  if (readiness === 'blocked' && !finalFeedback.some((item) => item.status === 'fail')) {
    readiness = 'needs_review';
  }
  if (readiness === 'ready' && finalFeedback.some((item) => item.status === 'fail')) {
    readiness = 'needs_review';
  }
  const finalFlags = Array.from(new Set(flags)).slice(0, 3);
  if (readiness === 'needs_review' && finalFeedback.length === 0 && finalFlags.length === 0) {
    readiness = 'ready';
  }

  return {
    ...result,
    readiness,
    summary: readiness === result.readiness
      ? result.summary
      : readiness === 'ready'
        ? (isEn
            ? 'The final draft is ready for human editorial review; no substantive issues remain from the quality gate.'
            : 'Draft final siap masuk review editorial manusia; tidak ada masalah substantif yang tersisa dari quality gate.')
        : (isEn
            ? 'The final draft has been generated, but still requires editor review on formatting or source verification before export.'
            : 'Draft final sudah terbentuk, tetapi masih memerlukan review editor pada format atau verifikasi sumber sebelum diekspor.'),
    feedback: finalFeedback,
    flags: finalFlags,
  };
};
