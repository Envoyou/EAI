import { describe, expect, it } from 'vitest';
import { assessDraftRevision } from '@/lib/draft-revision-impact';
import {
  deriveSeoFieldStates,
  markSeoFieldsValid,
  resolveStatusFromSeoFields,
} from '@/lib/seo-field-state';

const revision = {
  revisionId: 'rev-2',
  previousRevisionId: 'rev-1',
  bodyHash: 'a'.repeat(64),
  createdAt: '2026-08-01T00:00:00.000Z',
};

const publicationPackage = {
  title: 'Pasar AI 2025',
  slug: 'pasar-ai-2025',
  excerpt: 'Pasar AI tumbuh 20 persen pada 2025.',
  metaTitle: 'Pasar AI 2025',
  metaDescription: 'Data pertumbuhan pasar AI sebesar 20 persen pada 2025.',
  coverImageAltText: 'Ilustrasi pasar AI',
  tags: ['AI', 'pasar'],
};

describe('SEO field dependency state', () => {
  it('invalidates only fields that contain changed factual tokens', () => {
    const previousDraft = 'Pasar AI tumbuh 20 persen pada 2025. Informasi pendukung tetap.';
    const nextDraft = 'Pasar AI tumbuh 25 persen pada 2026. Informasi pendukung tetap.';
    const assessment = assessDraftRevision({ previousDraft, nextDraft, publicationMetadata: publicationPackage });
    const states = deriveSeoFieldStates({
      previousDraft,
      nextDraft,
      publicationPackage,
      assessment,
      revision,
    });
    expect(states.title?.status).toBe('review_required');
    expect(states.slug?.status).toBe('review_required');
    expect(states.metaTitle?.status).toBe('review_required');
    expect(states.excerpt?.status).toBe('stale');
    expect(states.metaDescription?.status).toBe('stale');
    expect(states.coverImageAltText?.status).toBe('valid');
    expect(states.tags?.status).toBe('valid');
  });

  it('does not invalidate unrelated metadata for a bounded copy edit', () => {
    const previousDraft = 'Panduan ini sangat praktis untuk tim editorial.';
    const nextDraft = 'Panduan ini praktis untuk tim editorial.';
    const assessment = assessDraftRevision({ previousDraft, nextDraft, publicationMetadata: publicationPackage });
    const states = deriveSeoFieldStates({ previousDraft, nextDraft, publicationPackage, assessment, revision });
    expect(Object.values(states).every((entry) => entry?.status === 'valid')).toBe(true);
    expect(resolveStatusFromSeoFields(states, true)).toBe('current');
  });

  it('keeps protected fields blocked while safe refreshed fields become valid', () => {
    const states = {
      title: { status: 'review_required' as const },
      excerpt: { status: 'stale' as const },
    };
    const refreshed = markSeoFieldsValid(states, ['excerpt'], revision);
    expect(refreshed.excerpt?.status).toBe('valid');
    expect(refreshed.title?.status).toBe('review_required');
    expect(resolveStatusFromSeoFields(refreshed, true)).toBe('stale');
  });
});
