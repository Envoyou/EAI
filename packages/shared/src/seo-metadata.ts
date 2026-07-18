import { SeoMetadataSchema, type SeoMetadataOutput } from './schema';
import {
  ENVOYOU_EDITORIAL_PROFILE,
  type EditorialProfileSnapshot,
} from './editorial-profile';
import type { ArticleMetadata } from './types/index';

const normalizeMetadataText = (value: string): string =>
  value.trim().replace(/\s+/g, ' ');

/** Keeps a metadata safety limit without leaving a partial word at the boundary. */
export const truncateAtWordBoundary = (value: string, maxLength: number): string => {
  const normalized = normalizeMetadataText(value);
  if (normalized.length <= maxLength) return normalized;

  const window = normalized.slice(0, maxLength + 1);
  const boundary = window.lastIndexOf(' ');
  const candidate = boundary >= Math.floor(maxLength * 0.5)
    ? window.slice(0, boundary)
    : normalized.slice(0, maxLength);

  return candidate.trim().replace(/[,:;/\-\u2013\u2014]+$/u, '').trim();
};

/** Prefers a complete sentence, then falls back to an intentional word-boundary ellipsis. */
export const truncateAtSentenceBoundary = (
  value: string,
  maxLength: number,
  minSentenceLength = 0
): string => {
  const normalized = normalizeMetadataText(value);
  if (normalized.length <= maxLength) return normalized;

  const window = normalized.slice(0, maxLength + 1);
  let sentenceEnd = -1;
  for (const match of window.matchAll(/[.!?](?=\s|$)/g)) {
    const end = (match.index ?? -1) + 1;
    if (end >= minSentenceLength && end <= maxLength) sentenceEnd = end;
  }
  if (sentenceEnd > 0) return window.slice(0, sentenceEnd).trim();

  const shortened = truncateAtWordBoundary(normalized, Math.max(1, maxLength - 1));
  return `${shortened}\u2026`;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);

export const buildFallbackSeoMetadata = (
  text: string,
  metadata?: ArticleMetadata,
  editorialProfile: EditorialProfileSnapshot = ENVOYOU_EDITORIAL_PROFILE
): SeoMetadataOutput => {
  const { seoRules } = editorialProfile.config;
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const fallbackSlug = slugify(`${editorialProfile.profileKey}-article`) || 'editorial-article';
  const rawTitle = (lines[0] || metadata?.category || `${editorialProfile.config.brandName} Editorial`)
    .replace(/^#+\s*/, '')
    .trim();
  const title = truncateAtWordBoundary((
    rawTitle.length >= 10
      ? rawTitle
      : `${rawTitle || 'Editorial'} ${editorialProfile.config.brandName}`
  ), seoRules.titleMaxLength);
  const descriptionSource = lines.slice(1).join(' ');
  const metaDescription = truncateAtSentenceBoundary(
    descriptionSource,
    seoRules.metaDescriptionMaxLength,
    50
  );
  const tagCandidates = Array.from(new Set([
    metadata?.category,
    metadata?.type,
    ...title.split(/[\s:-]+/).filter((token) => token.length > 3).slice(0, 3),
    editorialProfile.config.brandName,
    ...editorialProfile.config.categories,
    'Editorial',
    'Insight',
  ].filter((value): value is string => typeof value === 'string' && value.trim().length >= 2)));
  const tags = tagCandidates.slice(0, seoRules.tagCountMax);
  for (const fallbackTag of ['Analysis', 'Technology', 'Business']) {
    if (tags.length >= seoRules.tagCountMin) break;
    if (!tags.includes(fallbackTag)) tags.push(fallbackTag);
  }

  let safeMetaDescription = truncateAtSentenceBoundary((
    metaDescription ||
    `${title} for ${editorialProfile.config.brandName} readers seeking sharp and relevant insights.`
  ), seoRules.metaDescriptionMaxLength, 50);
  if (safeMetaDescription.length < 50) {
    safeMetaDescription = truncateAtSentenceBoundary(
      `${safeMetaDescription} Editorial analysis with context, impact, and practical implications.`,
      seoRules.metaDescriptionMaxLength,
      50
    );
  }

  return SeoMetadataSchema.parse({
    title,
    slug: slugify(title) || fallbackSlug,
    excerpt: safeMetaDescription,
    metaTitle: truncateAtWordBoundary(title, seoRules.metaTitleMaxLength),
    metaDescription: safeMetaDescription,
    coverImageAltText: truncateAtWordBoundary(`Illustration for the article: ${title}`, 120),
    tags,
  });
};

export const normalizeSeoMetadata = (
  raw: unknown,
  text: string,
  metadata?: ArticleMetadata,
  editorialProfile: EditorialProfileSnapshot = ENVOYOU_EDITORIAL_PROFILE
): SeoMetadataOutput => {
  const fallback = buildFallbackSeoMetadata(text, metadata, editorialProfile);
  const { seoRules } = editorialProfile.config;

  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const title = typeof source.title === 'string' && source.title.trim()
    ? truncateAtWordBoundary(source.title, seoRules.titleMaxLength)
    : fallback.title;
  const metaDescription = typeof source.metaDescription === 'string' && source.metaDescription.trim()
    ? truncateAtSentenceBoundary(source.metaDescription, seoRules.metaDescriptionMaxLength, 50)
    : fallback.metaDescription;
  const slug = typeof source.slug === 'string' && source.slug.trim()
    ? slugify(source.slug)
    : fallback.slug;
  const tags = Array.isArray(source.tags)
    ? source.tags
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 1)
        .slice(0, seoRules.tagCountMax)
    : fallback.tags;

  const excerpt = typeof source.excerpt === 'string' && source.excerpt.trim()
    ? truncateAtSentenceBoundary(source.excerpt, 300)
    : fallback.excerpt;
  const metaTitle = typeof source.metaTitle === 'string' && source.metaTitle.trim()
    ? truncateAtWordBoundary(source.metaTitle, seoRules.metaTitleMaxLength)
    : fallback.metaTitle;
  const coverImageAltText = typeof source.coverImageAltText === 'string' && source.coverImageAltText.trim()
    ? truncateAtWordBoundary(source.coverImageAltText, 120)
    : fallback.coverImageAltText;

  return SeoMetadataSchema.parse({
    title: title.length >= 10 ? title : fallback.title,
    metaDescription: metaDescription.length >= 50 ? metaDescription : fallback.metaDescription,
    slug: slug.length >= 3 ? slug : fallback.slug,
    excerpt,
    metaTitle,
    coverImageAltText,
    tags: tags.length >= seoRules.tagCountMin ? tags : fallback.tags,
  });
};
