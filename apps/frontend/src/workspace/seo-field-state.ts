import type { SeoField, SeoFieldStates } from '@eai/shared';

export const SAFE_AUTO_REFRESH_SEO_FIELDS: SeoField[] = [
  'excerpt',
  'metaDescription',
  'coverImageAltText',
  'tags',
];

export const parseSeoFieldStates = (value: unknown): SeoFieldStates => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const states: SeoFieldStates = {};
  const fields: SeoField[] = [
    'title', 'slug', 'excerpt', 'metaTitle', 'metaDescription', 'coverImageAltText', 'tags',
  ];
  fields.forEach((field) => {
    const item = source[field];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const entry = item as Record<string, unknown>;
    if (entry.status !== 'valid' && entry.status !== 'stale' && entry.status !== 'review_required') return;
    states[field] = {
      status: entry.status,
      ...(typeof entry.reason === 'string' ? { reason: entry.reason } : {}),
      ...(typeof entry.revisionId === 'string' ? { revisionId: entry.revisionId } : {}),
    };
  });
  return states;
};

export const getSafeStaleSeoFields = (states?: SeoFieldStates): SeoField[] =>
  SAFE_AUTO_REFRESH_SEO_FIELDS.filter((field) => states?.[field]?.status === 'stale');

export const getProtectedSeoReviewFields = (states?: SeoFieldStates): SeoField[] =>
  (['title', 'metaTitle', 'slug'] as SeoField[])
    .filter((field) => states?.[field]?.status === 'review_required');
