const HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`)\]}]+/gi;
const MAX_CONFIRMED_INTERNAL_URLS = 100;

type EditorialFeedbackDecision = {
  category?: string | null;
  isAccepted?: boolean | null;
  message?: string | null;
  targetText?: string | null;
  replacementText?: string | null;
  verifiedSource?: string | null;
};

const normalizeHttpUrl = (value: string): string | null => {
  const candidate = value.trim().replace(/[.,;:!?]+$/, '');
  try {
    const protocol = new URL(candidate).protocol;
    return protocol === 'http:' || protocol === 'https:' ? candidate : null;
  } catch {
    return null;
  }
};

const extractHttpUrls = (value: string): string[] =>
  (value.match(HTTP_URL_PATTERN) ?? [])
    .map(normalizeHttpUrl)
    .filter((url): url is string => Boolean(url));

export const readConfirmedInternalUrls = (
  systemMetadata: Record<string, unknown>
): string[] => {
  if (!Array.isArray(systemMetadata.confirmedInternalUrls)) return [];

  return systemMetadata.confirmedInternalUrls
    .filter((value): value is string => typeof value === 'string')
    .map(normalizeHttpUrl)
    .filter((url): url is string => Boolean(url))
    .slice(0, MAX_CONFIRMED_INTERNAL_URLS);
};

export const mergeConfirmedInternalUrls = (
  existingUrls: string[],
  feedbackValue: unknown
): string[] => {
  const feedback = Array.isArray(feedbackValue)
    ? feedbackValue.filter(
        (item): item is EditorialFeedbackDecision =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      )
    : [];
  const confirmedUrls = feedback.flatMap((item) => {
    if (
      !item.isAccepted
      || item.category?.trim().toLowerCase() !== 'internal linking'
    ) {
      return [];
    }

    return [
      item.targetText,
      item.message,
      item.replacementText,
      item.verifiedSource,
    ]
      .filter((value): value is string => typeof value === 'string')
      .flatMap(extractHttpUrls);
  });

  return Array.from(new Set([
    ...existingUrls.map(normalizeHttpUrl).filter((url): url is string => Boolean(url)),
    ...confirmedUrls,
  ])).slice(0, MAX_CONFIRMED_INTERNAL_URLS);
};
