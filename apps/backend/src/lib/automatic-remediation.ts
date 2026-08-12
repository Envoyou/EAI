import type { FeedbackItem, ResearchNote } from '@eai/shared';
import {
  applyFeedbackOperation,
  projectReviewCapability,
  replaceFirstTargetMatch,
} from '@eai/shared';
import { buildDeterministicSourceNeutralization } from '@/lib/ai/targeted-fix-stage';
import { repairMissingSentenceWhitespace } from '@/lib/text-utils';

const normalizeUrl = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.toString().replace(/\/$/u, '');
  } catch {
    return null;
  }
};

const removeAdjacentDuplicateHeadings = (draft: string): string => {
  const output: string[] = [];
  let previousMeaningfulHeading: string | null = null;
  draft.split(/\r?\n/gu).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      output.push(line);
      return;
    }
    const heading = /^#{1,6}\s+(.+)$/u.exec(trimmed);
    if (!heading?.[1]) {
      previousMeaningfulHeading = null;
      output.push(line);
      return;
    }
    const normalized = heading[1]
      .normalize('NFKC')
      .replace(/[*_`]+/gu, '')
      .replace(/\s+/gu, ' ')
      .trim()
      .toLocaleLowerCase();
    if (normalized === previousMeaningfulHeading) return;
    previousMeaningfulHeading = normalized;
    output.push(line);
  });
  return output.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
};

const addVerifiedSourceLink = (
  draft: string,
  targetText: string,
  sourceUrl: string
): string | null => {
  const target = targetText.trim();
  const index = draft.indexOf(target);
  if (index < 0) return null;
  const existingSlice = draft.slice(Math.max(0, index - 2), index + target.length + sourceUrl.length + 8);
  if (existingSlice.includes(sourceUrl)) return null;
  const label = target.replaceAll('[', '\\[').replaceAll(']', '\\]');
  return `${draft.slice(0, index)}[${label}](${sourceUrl})${draft.slice(index + target.length)}`;
};

export const buildQualitySourceCorpus = (
  originalDraft: string,
  researchNotes: ResearchNote[]
): string => [
  originalDraft,
  ...researchNotes.map((note) => [
    note.content,
    ...note.sources.map((source) => source.url),
  ].join('\n')),
].filter(Boolean).join('\n\n');

export const canUseGeneratedRemediation = (item: FeedbackItem): boolean => {
  if (!item.targetText?.trim() || item.verificationStatus) return false;
  if (item.targetField && item.targetField !== 'body') return false;
  return /structure|clarity|grammar|readability|style|tone|format|coherence|alur|struktur|kejelasan|tata bahasa/iu
    .test(`${item.category} ${item.message}`);
};

export const applyAutomaticDeterministicRemediations = ({
  draft,
  feedback,
  researchNotes,
}: {
  draft: string;
  feedback: FeedbackItem[];
  researchNotes: ResearchNote[];
}): {
  draft: string;
  appliedCount: number;
  trustedSourceUrls: string[];
} => {
  let nextDraft = repairMissingSentenceWhitespace(draft);
  let appliedCount = nextDraft === draft ? 0 : 1;
  const headingsNormalized = removeAdjacentDuplicateHeadings(nextDraft);
  if (headingsNormalized !== nextDraft) appliedCount += 1;
  nextDraft = headingsNormalized;
  const allowedSourceUrls = new Set(
    researchNotes
      .flatMap((note) => note.sources)
      .map((source) => normalizeUrl(source.url))
      .filter((url): url is string => Boolean(url))
  );
  const trustedSourceUrls = new Set<string>();

  feedback.forEach((item) => {
    const targetText = item.targetText?.trim();
    if (!targetText) return;
    const capability = projectReviewCapability(item);

    if (
      capability?.autoApplicable
      && capability.targetField === 'body'
    ) {
      const applied = applyFeedbackOperation(nextDraft, item);
      if (applied.success && applied.nextText !== nextDraft) {
        nextDraft = applied.nextText;
        appliedCount += 1;
      }
      return;
    }

    const verifiedSource = normalizeUrl(item.verifiedSource);
    if (verifiedSource && allowedSourceUrls.has(verifiedSource)) {
      const linked = addVerifiedSourceLink(nextDraft, targetText, verifiedSource);
      if (linked && linked !== nextDraft) {
        nextDraft = linked;
        trustedSourceUrls.add(verifiedSource);
        appliedCount += 1;
      }
      return;
    }

    if (item.category === 'Source Fidelity') {
      const neutralized = buildDeterministicSourceNeutralization({
        targetText,
        feedback: item.message,
        editorInstruction: 'Remove or neutralize the unsupported detail.',
      });
      if (!neutralized) return;
      const replacement = replaceFirstTargetMatch(nextDraft, targetText, neutralized);
      if (replacement.success && replacement.nextText !== nextDraft) {
        nextDraft = replacement.nextText;
        appliedCount += 1;
      }
    }
  });

  return {
    draft: nextDraft,
    appliedCount,
    trustedSourceUrls: Array.from(trustedSourceUrls),
  };
};
