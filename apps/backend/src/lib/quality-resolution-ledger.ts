import type { FeedbackItem, FinalQualityGateOutput } from '@eai/shared';

const MAX_RESOLVED_FINDINGS = 100;
const MAX_SOURCE_URLS = 100;

export type QualityResolution = {
  category: string;
  message: string;
  targetText?: string;
  verifiedSource?: string;
  resolution: 'accepted' | 'applied' | 'verified';
};

const normalizeText = (value: string | undefined) =>
  (value ?? '')
    .normalize('NFKC')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, '$1')
    .replace(/https?:\/\/[^\s)\]}]+/gi, '')
    .replace(/[*_`#>[\]()]/g, ' ')
    .replace(/[^\p{L}\p{N}%$€£¥]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const normalizeUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString().replace(/[.,;:!?]+$/, '')
      : undefined;
  } catch {
    return undefined;
  }
};

const readResolution = (value: unknown): QualityResolution | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const resolution = candidate.resolution;
  if (
    resolution !== 'accepted'
    && resolution !== 'applied'
    && resolution !== 'verified'
  ) return null;

  const category = typeof candidate.category === 'string'
    ? candidate.category.trim()
    : '';
  const message = typeof candidate.message === 'string'
    ? candidate.message.trim()
    : '';
  if (!category || !message) return null;

  const targetText = typeof candidate.targetText === 'string'
    ? candidate.targetText.trim()
    : undefined;
  const verifiedSource = normalizeUrl(
    typeof candidate.verifiedSource === 'string'
      ? candidate.verifiedSource
      : undefined
  );

  return {
    category,
    message,
    ...(targetText ? { targetText } : {}),
    ...(verifiedSource ? { verifiedSource } : {}),
    resolution,
  };
};

const resolutionKey = (item: QualityResolution) => [
  normalizeText(item.category),
  normalizeText(item.targetText) || normalizeText(item.message),
  item.verifiedSource ?? '',
].join('::');

const feedbackResolution = (item: FeedbackItem): QualityResolution | null => {
  const resolution = item.isVerified
    ? 'verified'
    : item.isApplied
      ? 'applied'
      : item.isAccepted
        ? 'accepted'
        : null;
  if (!resolution || item.status === 'fail') return null;

  return readResolution({
    category: item.category,
    message: item.message,
    targetText: item.targetText,
    verifiedSource: item.verifiedSource,
    resolution,
  });
};

export const readQualityResolutions = (
  systemMetadata: Record<string, unknown>
): QualityResolution[] => {
  if (!Array.isArray(systemMetadata.resolvedQualityFindings)) return [];
  return systemMetadata.resolvedQualityFindings
    .map(readResolution)
    .filter((item): item is QualityResolution => Boolean(item))
    .slice(-MAX_RESOLVED_FINDINGS);
};

export const mergeQualityResolutions = (
  existing: QualityResolution[],
  feedbackValue: unknown
): QualityResolution[] => {
  const feedback = Array.isArray(feedbackValue)
    ? feedbackValue.filter(
        (item): item is FeedbackItem =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      )
    : [];
  const next = feedback
    .map(feedbackResolution)
    .filter((item): item is QualityResolution => Boolean(item));
  const byKey = new Map<string, QualityResolution>();
  [...existing, ...next].forEach((item) => byKey.set(resolutionKey(item), item));
  return Array.from(byKey.values()).slice(-MAX_RESOLVED_FINDINGS);
};

export const readTrustedSourceUrls = (
  resolutions: QualityResolution[]
): string[] => Array.from(new Set(
  resolutions
    .map((item) => normalizeUrl(item.verifiedSource))
    .filter((url): url is string => Boolean(url))
)).slice(0, MAX_SOURCE_URLS);

const targetsMatch = (first: string, second: string) => {
  const normalizedFirst = normalizeText(first);
  const normalizedSecond = normalizeText(second);
  if (!normalizedFirst || !normalizedSecond) return false;
  if (normalizedFirst === normalizedSecond) return true;
  return Math.min(normalizedFirst.length, normalizedSecond.length) >= 24
    && (
      normalizedFirst.includes(normalizedSecond)
      || normalizedSecond.includes(normalizedFirst)
    );
};

const resolutionApplies = (
  finding: FeedbackItem,
  resolution: QualityResolution,
  finalDraft: string
) => {
  if (finding.status !== 'warning') return false;
  if (normalizeText(finding.category) !== normalizeText(resolution.category)) {
    return false;
  }

  if (finding.targetText && resolution.targetText) {
    return targetsMatch(finding.targetText, resolution.targetText)
      && normalizeText(finalDraft).includes(normalizeText(resolution.targetText));
  }

  return normalizeText(finding.message) === normalizeText(resolution.message);
};

export const reconcileQualityResolutions = (
  result: FinalQualityGateOutput,
  finalDraft: string,
  resolutions: QualityResolution[],
  language: 'id' | 'en' = 'en'
): FinalQualityGateOutput => {
  if (resolutions.length === 0) return result;

  const feedback = result.feedback.filter(
    (finding) => !resolutions.some(
      (resolution) => resolutionApplies(finding, resolution, finalDraft)
    )
  );
  if (feedback.length === result.feedback.length) return result;

  const readiness = feedback.some((item) => item.status === 'fail')
    ? 'blocked'
    : feedback.length > 0
      ? 'needs_review'
      : 'ready';

  return {
    ...result,
    readiness,
    feedback,
    flags: readiness === 'ready' ? [] : result.flags,
    summary: readiness === 'ready'
      ? language === 'id'
        ? 'Draft final saat ini siap ditinjau editor manusia; keputusan editor sebelumnya dipertahankan dan tidak ada temuan yang belum diselesaikan.'
        : 'The current final draft is ready for human editorial review; prior editor decisions were retained and no unresolved findings remain.'
      : result.summary,
  };
};
