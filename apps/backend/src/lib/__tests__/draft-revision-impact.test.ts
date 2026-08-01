import { describe, expect, it } from 'vitest';
import { assessDraftRevision } from '@/lib/draft-revision-impact';

const body = [
  'Modern publishing teams build durable systems for research, production, and distribution.',
  ...Array.from({ length: 18 }, (_, index) =>
    `Paragraph ${index + 1} explains how focused editorial operations improve useful content workflows for growing organizations.`
  ),
].join('\n\n');

const metadata = {
  title: 'Modern Publishing Systems',
  excerpt: 'A practical guide to durable editorial operations for modern publishing teams.',
  metaTitle: 'Modern Publishing Systems for Editorial Teams',
  metaDescription: 'Learn how modern publishing teams build durable editorial systems for research, production, and distribution.',
  tags: ['Publishing', 'Editorial Operations'],
};

describe('assessDraftRevision', () => {
  it('requires no rerun for whitespace-only corrections', () => {
    expect(assessDraftRevision({
      previousDraft: body.replace('durable systems', 'durable  systems'),
      nextDraft: body,
      publicationMetadata: metadata,
    })).toMatchObject({ impact: 'formatting_only', validationLevel: 'none', seoReviewState: 'valid' });
  });

  it('requires no rerun when identical prose is converted into a list', () => {
    const previousDraft = `First workflow\n\nSecond workflow\n\n${body}`;
    const nextDraft = `- First workflow\n- Second workflow\n\n${body}`;
    expect(assessDraftRevision({ previousDraft, nextDraft, publicationMetadata: metadata }))
      .toMatchObject({ impact: 'formatting_only', validationLevel: 'none' });
  });

  it('accepts bounded grammar edits without a word-count threshold', () => {
    const previousDraft = 'This workflow is simple and efficient. Teams can use it daily.';
    const nextDraft = 'This workflow is easier to manage and more efficient. Teams can use it daily.';
    expect(assessDraftRevision({ previousDraft, nextDraft }))
      .toMatchObject({ impact: 'minor_copy_edit', validationLevel: 'none' });
  });

  it('uses light validation for editorial structure and heading changes', () => {
    expect(assessDraftRevision({
      previousDraft: `## Benefits\n\n${body}`,
      nextDraft: `## Key Benefits\n\n${body}`,
      publicationMetadata: metadata,
    })).toMatchObject({
      impact: 'editorial_change',
      validationLevel: 'light',
      qualityGateState: 'validation_recommended',
    });
  });

  it('separates factual Quality Gate invalidation from SEO invalidation', () => {
    expect(assessDraftRevision({
      previousDraft: body,
      nextDraft: body.replace('Paragraph 8', 'Paragraph 9'),
      publicationMetadata: metadata,
    })).toMatchObject({
      validationLevel: 'full',
      qualityGateState: 'stale',
      seoReviewState: 'valid',
      signals: { numbersChanged: true },
    });
  });

  it('marks SEO as possibly stale when metadata language changes without topical loss', () => {
    expect(assessDraftRevision({
      previousDraft: body,
      nextDraft: body.replace('durable systems', 'resilient systems'),
      publicationMetadata: metadata,
    })).toMatchObject({ validationLevel: 'light', seoReviewState: 'possibly_stale' });
  });

  it('marks SEO stale only after material topical-anchor loss', () => {
    const nextDraft = body
      .replaceAll('publishing', 'broadcasting')
      .replaceAll('editorial', 'operational')
      .replaceAll('research', 'planning')
      .replaceAll('production', 'delivery')
      .replaceAll('distribution', 'reach');
    expect(assessDraftRevision({
      previousDraft: body,
      nextDraft,
      publicationMetadata: metadata,
    })).toMatchObject({ validationLevel: 'light', seoReviewState: 'stale' });
  });

  it.each([
    ['number', body.replace('Paragraph 8', 'Paragraph 9')],
    ['negation', body.replace('improve useful', 'do not improve useful')],
    ['proper entity', body.replace('growing organizations', 'growing Google organizations')],
    ['quotation', `${body}\n\n> A newly attributed statement.`],
    ['source URL', `${body}\n\nhttps://example.com/source`],
  ])('requires a full gate for a high-risk %s change', (_label, nextDraft) => {
    expect(assessDraftRevision({
      previousDraft: body,
      nextDraft,
      publicationMetadata: metadata,
    })).toMatchObject({ impact: 'high_risk_change', validationLevel: 'full' });
  });

  it('requires a full gate when a previously reviewed target changes', () => {
    const target = 'focused editorial operations improve useful content workflows';
    expect(assessDraftRevision({
      previousDraft: body,
      nextDraft: body.replace(target, 'focused operations improve clear workflows'),
      publicationMetadata: metadata,
      protectedTargets: [target],
    })).toMatchObject({ validationLevel: 'full' });
  });
});
