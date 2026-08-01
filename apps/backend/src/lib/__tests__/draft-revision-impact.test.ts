import { describe, expect, it } from 'vitest';
import { classifyDraftRevisionImpact } from '@/lib/draft-revision-impact';

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

describe('classifyDraftRevisionImpact', () => {
  it('preserves readiness for whitespace-only corrections', () => {
    expect(classifyDraftRevisionImpact({
      previousDraft: body.replace('durable systems', 'durable  systems'),
      nextDraft: body,
      publicationMetadata: metadata,
    })).toBe('formatting_only');
  });

  it('treats up to two low-risk wording edits outside metadata as minor', () => {
    expect(classifyDraftRevisionImpact({
      previousDraft: body,
      nextDraft: body.replace('useful content workflows', 'clear content routines'),
      publicationMetadata: metadata,
    })).toBe('minor_copy_edit');
  });

  it.each([
    ['metadata keyword', body.replace('publishing teams', 'broadcast teams')],
    ['number', body.replace('Paragraph 8', 'Paragraph 9')],
    ['negation', body.replace('improve useful', 'do not improve useful')],
    ['heading', `## New direction\n\n${body}`],
    ['proper name', body.replace('Modern publishing', 'Google publishing')],
  ])('requires revalidation for a substantive %s change', (_label, nextDraft) => {
    expect(classifyDraftRevisionImpact({
      previousDraft: body,
      nextDraft,
      publicationMetadata: metadata,
    })).toBe('substantive');
  });
});
