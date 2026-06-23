import { SeoMetadataSchema, type SeoMetadataOutput } from './schema.ts';
import {
  ENVOYOU_EDITORIAL_PROFILE,
  type EditorialProfileSnapshot,
} from './editorial-profile.ts';
import type { ArticleMetadata } from '../types/index.ts';

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
  const title = (
    rawTitle.length >= 10
      ? rawTitle
      : `${rawTitle || 'Editorial'} ${editorialProfile.config.brandName}`
  ).slice(0, seoRules.titleMaxLength);
  const descriptionSource = lines.slice(1).join(' ');
  const metaDescription = descriptionSource
    .slice(0, seoRules.metaDescriptionMaxLength)
    .trim()
    .replace(/\s+/g, ' ');
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

  let safeMetaDescription = (
    metaDescription ||
    `${title} untuk pembaca ${editorialProfile.config.brandName} yang mencari insight tajam dan relevan.`
  ).slice(0, seoRules.metaDescriptionMaxLength);
  if (safeMetaDescription.length < 50) {
    safeMetaDescription = `${safeMetaDescription} Analisis editorial dengan konteks, dampak, dan implikasi praktis.`
      .slice(0, seoRules.metaDescriptionMaxLength);
  }

  return SeoMetadataSchema.parse({
    title,
    slug: slugify(title) || fallbackSlug,
    excerpt: safeMetaDescription,
    metaTitle: title.slice(0, seoRules.metaTitleMaxLength),
    metaDescription: safeMetaDescription,
    coverImageAltText: `Ilustrasi untuk artikel ${title}`.slice(0, 120),
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
    ? source.title.trim().slice(0, seoRules.titleMaxLength)
    : fallback.title;
  const metaDescription = typeof source.metaDescription === 'string' && source.metaDescription.trim()
    ? source.metaDescription.trim().slice(0, seoRules.metaDescriptionMaxLength)
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
    ? source.excerpt.trim().slice(0, 300)
    : fallback.excerpt;
  const metaTitle = typeof source.metaTitle === 'string' && source.metaTitle.trim()
    ? source.metaTitle.trim().slice(0, seoRules.metaTitleMaxLength)
    : fallback.metaTitle;
  const coverImageAltText = typeof source.coverImageAltText === 'string' && source.coverImageAltText.trim()
    ? source.coverImageAltText.trim().slice(0, 120)
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
