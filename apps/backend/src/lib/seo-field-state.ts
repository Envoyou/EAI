import { z } from 'zod';
import type {
  DraftRevisionIdentity,
  PublicationPackage,
  PublicationPackageStatus,
  SeoField,
  SeoFieldStates,
} from '@eai/shared';
import type { DraftRevisionAssessment } from '@/lib/draft-revision-impact';

export const SEO_FIELDS: SeoField[] = [
  'title',
  'slug',
  'excerpt',
  'metaTitle',
  'metaDescription',
  'coverImageAltText',
  'tags',
];

export const SAFE_AUTO_REFRESH_SEO_FIELDS: SeoField[] = [
  'excerpt',
  'metaDescription',
  'coverImageAltText',
  'tags',
];

const SeoFieldReviewSchema = z.object({
  status: z.enum(['valid', 'stale', 'review_required']),
  reason: z.string().min(1).max(100).optional(),
  revisionId: z.string().min(1).max(100).optional(),
}).strict();

export const SeoFieldStatesSchema = z.object({
  title: SeoFieldReviewSchema.optional(),
  slug: SeoFieldReviewSchema.optional(),
  excerpt: SeoFieldReviewSchema.optional(),
  metaTitle: SeoFieldReviewSchema.optional(),
  metaDescription: SeoFieldReviewSchema.optional(),
  coverImageAltText: SeoFieldReviewSchema.optional(),
  tags: SeoFieldReviewSchema.optional(),
}).strict();

const valueText = (value: unknown): string => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string').join(' ')
  : typeof value === 'string' ? value : '';

const normalizedTokens = (value: string): Set<string> => new Set(
  (value.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((token) => token.length > 1)
);

const changedTokens = (before: string, after: string): Set<string> => {
  const left = normalizedTokens(before);
  const right = normalizedTokens(after);
  return new Set([...left, ...right].filter((token) => left.has(token) !== right.has(token)));
};

const fieldDependsOnChange = (
  field: SeoField,
  publicationPackage: PublicationPackage,
  tokens: Set<string>,
): boolean => {
  if (tokens.size === 0) return false;
  const fieldTokens = normalizedTokens(valueText(publicationPackage[field]));
  return [...tokens].some((token) => fieldTokens.has(token));
};

export const readSeoFieldStates = (value: unknown): SeoFieldStates => {
  const parsed = SeoFieldStatesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
};

export const createValidSeoFieldStates = (
  revision?: DraftRevisionIdentity,
): SeoFieldStates => Object.fromEntries(SEO_FIELDS.map((field) => [field, {
  status: 'valid',
  ...(revision?.revisionId ? { revisionId: revision.revisionId } : {}),
}])) as SeoFieldStates;

export const deriveSeoFieldStates = ({
  previousDraft,
  nextDraft,
  publicationPackage,
  assessment,
  previousStates,
  revision,
}: {
  previousDraft: string;
  nextDraft: string;
  publicationPackage?: PublicationPackage | null;
  assessment: DraftRevisionAssessment;
  previousStates?: unknown;
  revision: DraftRevisionIdentity;
}): SeoFieldStates => {
  if (!publicationPackage) return {};
  const prior = readSeoFieldStates(previousStates);
  const next = createValidSeoFieldStates(revision);
  SEO_FIELDS.forEach((field) => {
    if (prior[field] && prior[field]?.status !== 'valid') {
      next[field] = { ...prior[field], revisionId: revision.revisionId };
    }
  });

  const mark = (field: SeoField, status: 'stale' | 'review_required', reason: string) => {
    next[field] = { status, reason, revisionId: revision.revisionId };
  };
  if (assessment.signals.topicShiftDetected || assessment.reasons.includes('missing_comparison_draft')) {
    (['title', 'slug', 'metaTitle'] as SeoField[])
      .forEach((field) => mark(field, 'review_required', 'topic_changed'));
    SAFE_AUTO_REFRESH_SEO_FIELDS.forEach((field) => mark(field, 'stale', 'topic_changed'));
    return next;
  }

  const tokens = changedTokens(previousDraft, nextDraft);
  SEO_FIELDS.forEach((field) => {
    if (!fieldDependsOnChange(field, publicationPackage, tokens)) return;
    const protectedField = field === 'title' || field === 'slug' || field === 'metaTitle';
    mark(field, protectedField ? 'review_required' : 'stale', 'dependent_content_changed');
  });

  if (assessment.signals.headingsChanged || assessment.signals.structureChanged) {
    (['excerpt', 'metaDescription'] as SeoField[]).forEach((field) => {
      if (next[field]?.status === 'valid') mark(field, 'stale', 'article_structure_changed');
    });
  }
  return next;
};

export const resolveStatusFromSeoFields = (
  states: SeoFieldStates,
  hasPackage: boolean,
): PublicationPackageStatus => !hasPackage
  ? 'not_generated'
  : SEO_FIELDS.some((field) => states[field]?.status !== 'valid')
    ? 'stale'
    : 'current';

export const markSeoFieldsValid = (
  states: SeoFieldStates,
  fields: SeoField[],
  revision: DraftRevisionIdentity,
): SeoFieldStates => ({
  ...states,
  ...Object.fromEntries(fields.map((field) => [field, {
    status: 'valid',
    revisionId: revision.revisionId,
  }])),
});
